// @effect-diagnostics nodeBuiltinImport:off - Native private credential storage at the environment boundary.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeCrypto from "node:crypto";
import * as NodeUtil from "node:util";
import { resolveTradingEnvironmentFile } from "./runtimeEnv.ts";

export class ConnectionError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export interface ConnectionSecrets {
  read(name: "telegram" | "telegram-app" | "tradovate"): Promise<unknown>;
  write(name: "telegram" | "telegram-app" | "tradovate", value: unknown): Promise<void>;
  remove(name: "telegram" | "telegram-app" | "tradovate"): Promise<void>;
}
export function connectionSecrets(
  directory = NodePath.join(NodePath.dirname(resolveTradingEnvironmentFile()), ".connections"),
): ConnectionSecrets {
  return {
    async read(name) {
      try {
        return JSON.parse(await NodeFSP.readFile(NodePath.join(directory, `${name}.json`), "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw new ConnectionError(
          "Saved connection could not be opened. Reconnect in Trading settings.",
          503,
        );
      }
    },
    async write(name, value) {
      await NodeFSP.mkdir(directory, { recursive: true, mode: 0o700 });
      await NodeFSP.chmod(directory, 0o700);
      const target = NodePath.join(directory, `${name}.json`);
      const temporary = `${target}.${NodeCrypto.randomUUID()}.tmp`;
      try {
        await NodeFSP.writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: "wx" });
        await NodeFSP.rename(temporary, target);
      } finally {
        await NodeFSP.rm(temporary, { force: true });
      }
    },
    async remove(name) {
      await NodeFSP.rm(NodePath.join(directory, `${name}.json`), { force: true });
    },
  };
}
export async function tradingConnectionEnvironment(): Promise<NodeJS.ProcessEnv> {
  let saved: NodeJS.ProcessEnv = {};
  try {
    saved = NodeUtil.parseEnv(await NodeFSP.readFile(resolveTradingEnvironmentFile(), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new ConnectionError("Trading configuration is unavailable.", 503);
  }
  return { ...saved, ...process.env };
}
