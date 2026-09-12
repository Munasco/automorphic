// @effect-diagnostics nodeBuiltinImport:off - Temporary native env-file fixtures for the broker REST adapter.
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { accountSnapshot, normalizeAccountData, parseAccountId } from "./accountData.ts";

describe("Tradovate account attribution", () => {
  it("joins fills through the selected account's orders and rejects foreign or busted fills", () => {
    const result = normalizeAccountData(
      1,
      {
        positions: [
          { id: 1, accountId: 1, contractId: 30, netPos: -2, netPrice: 100 },
          { id: 2, accountId: 2, contractId: 30, netPos: 3 },
          { id: 3, accountId: 1, contractId: 30, netPos: 0 },
        ],
        orders: [
          { id: 10, accountId: 1, contractId: 30, action: "Buy", ordStatus: "Filled" },
          { id: 11, accountId: 2, contractId: 40 },
        ],
        fills: [
          { id: 20, orderId: 10, contractId: 30, qty: 2, price: 101, active: true },
          { id: 21, orderId: 11, contractId: 40 },
          { id: 22, orderId: 999, contractId: 30 },
          { id: 23, orderId: 10, contractId: 40 },
          { id: 24, orderId: 10, contractId: 30, active: false },
        ],
        versions: [
          { id: 5, orderId: 10, orderQty: 1, orderType: "Limit", price: 100 },
          { id: 7, orderId: 10, orderQty: 2, orderType: "Market" },
          { id: 6, orderId: 10, orderQty: 3 },
        ],
      },
      new Map([[30, "MGCV6"]]),
    );
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]).toMatchObject({ symbol: "MGCV6", netPos: -2, netPrice: 100 });
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]).toMatchObject({ quantity: 2, type: "Market", accountId: 1 });
    expect(result.orders[0]?.price).toBeUndefined();
    expect(result.history).toHaveLength(1);
    expect(result.history[0]).toMatchObject({
      accountId: 1,
      symbol: "MGCV6",
      quantity: 2,
      fillPrice: 101,
    });
  });

  it("does not fabricate prices, symbols or timestamps for missing values", () => {
    const result = normalizeAccountData(
      1,
      {
        positions: [
          {
            id: 1,
            accountId: 1,
            contractId: 30,
            netPos: 2,
            netPrice: NaN,
            timestamp: "invalid",
            secret: "omit",
          },
        ],
        orders: [],
        fills: [],
        versions: [],
      },
      new Map(),
    );
    expect(result.positions[0]).toMatchObject({ id: 1, contractId: 30 });
    expect(result.positions[0]?.netPrice).toBeUndefined();
    expect(result.positions[0]?.symbol).toBeUndefined();
    expect(result.positions[0]?.timestamp).toBeUndefined();
    expect(result.positions[0]).not.toHaveProperty("secret");
  });

  it("rejects malformed account IDs", () => {
    expect(parseAccountId(null)).toBeUndefined();
    expect(parseAccountId("123")).toBe(123);
    for (const value of ["", "-1", "0", "1.2", "1e3", "9007199254740992", "1&x=2"])
      expect(() => parseAccountId(value)).toThrow("valid trading account");
  });
});

describe("read-only account snapshot", () => {
  const temporaryPaths: string[] = [];
  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await Promise.all(
      temporaryPaths.splice(0).map((path) => NodeFSP.rm(path, { recursive: true, force: true })),
    );
  });
  async function setup() {
    const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "automorphic-account-"));
    temporaryPaths.push(directory);
    const path = NodePath.join(directory, ".env");
    await NodeFSP.writeFile(
      path,
      "TRADOVATE_ACCESS_TOKEN=test-session\nTRADOVATE_ENVIRONMENT=demo\nTRADOVATE_TOKEN_EXPIRATION=2099-01-01T00:00:00.000Z\n",
      { mode: 0o600 },
    );
    vi.stubEnv("AUTOMORPHIC_ENV_FILE", path);
  }
  it("uses only GET, resolves the exact contract, and returns only allowlisted data", async () => {
    await setup();
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      expect(init.method).toBe("GET");
      const path = new URL(url).pathname;
      const data: Record<string, unknown[]> = {
        "/v1/account/list": [{ id: 1, name: "Demo", userId: 123 }],
        "/v1/position/list": [{ id: 1, accountId: 1, contractId: 30, netPos: 1 }],
        "/v1/order/list": [],
        "/v1/fill/list": [],
        "/v1/orderVersion/list": [],
        "/v1/contract/items": [{ id: 30, name: "MGCV6" }],
      };
      expect(data).toHaveProperty(path);
      return Response.json(data[path]);
    });
    vi.stubGlobal("fetch", fetch);
    const result = await accountSnapshot();
    expect(result.accounts).toEqual([{ id: 1, name: "Demo" }]);
    expect(result.positions[0]?.symbol).toBe("MGCV6");
    expect(result.environment).toBe("demo");
    expect(JSON.stringify(result)).not.toContain("test-session");
    expect(fetch).toHaveBeenCalledTimes(6);
  });
  it("stops before retrieving trading rows for an account outside this session", async () => {
    await setup();
    const fetch = vi.fn(async () => Response.json([{ id: 1, name: "Demo" }]));
    vi.stubGlobal("fetch", fetch);
    await expect(accountSnapshot(2)).rejects.toThrow("not available");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("surfaces broker permission failure without leaking its response", async () => {
    await setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("private broker detail", { status: 403 })),
    );
    await expect(accountSnapshot()).rejects.toThrow("Tradovate rejected account access");
  });
});
