// @effect-diagnostics nodeBuiltinImport:off - Durable, exclusive manual-order claims in the configured environment state directory.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeCrypto from "node:crypto";
import type { TradingOrderReceipt } from "@t3tools/contracts";
import { TradingAccountError } from "./accountData.ts";

export type OrderReceiptLedger = {
  claim: (key: string, body: string) => Promise<TradingOrderReceipt | null>;
  complete: (key: string, receipt: TradingOrderReceipt) => Promise<void>;
};

export function createOrderReceiptLedger(stateDir: string): OrderReceiptLedger {
  const directory = NodePath.join(stateDir, "trading-order-receipts");
  const path = (key: string) =>
    NodePath.join(directory, NodeCrypto.createHash("sha256").update(key).digest("hex"));
  const syncDirectory = async () => {
    const file = await NodeFSP.open(directory, "r");
    try {
      await file.sync();
    } finally {
      await file.close();
    }
  };
  return {
    async claim(key, body) {
      await NodeFSP.mkdir(directory, { recursive: true, mode: 0o700 });
      try {
        const file = await NodeFSP.open(`${path(key)}.json`, "wx", 0o600);
        try {
          await file.writeFile(JSON.stringify({ body }));
          await file.sync();
        } finally {
          await file.close();
        }
        await syncDirectory();
        return null;
      } catch (error) {
        if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST")
          throw new TradingAccountError(
            "Could not record this order request. No order was sent.",
            503,
          );
        let previous: unknown;
        try {
          previous = JSON.parse(await NodeFSP.readFile(`${path(key)}.json`, "utf8"));
        } catch {
          throw new TradingAccountError(
            "Order status is unknown. Check Tradovate before submitting another order.",
            409,
          );
        }
        if (
          !previous ||
          typeof previous !== "object" ||
          !("body" in previous) ||
          previous.body !== body
        )
          throw new TradingAccountError("Order details changed for a submitted request.", 409);
        try {
          const value: unknown = JSON.parse(
            await NodeFSP.readFile(`${path(key)}.result.json`, "utf8"),
          );
          if (
            value &&
            typeof value === "object" &&
            "orderId" in value &&
            typeof value.orderId === "number" &&
            Number.isSafeInteger(value.orderId) &&
            value.orderId > 0
          )
            return { orderId: value.orderId };
        } catch {
          /* A claim without a receipt may already have reached the broker. */
        }
        throw new TradingAccountError(
          "Order status is unknown. Check Tradovate before submitting another order.",
          409,
        );
      }
    },
    async complete(key, receipt) {
      const pending = `${path(key)}.result.tmp`;
      const file = await NodeFSP.open(pending, "w", 0o600);
      try {
        await file.writeFile(JSON.stringify(receipt));
        await file.sync();
      } finally {
        await file.close();
      }
      await NodeFSP.rename(pending, `${path(key)}.result.json`);
      await syncDirectory();
    },
  };
}
