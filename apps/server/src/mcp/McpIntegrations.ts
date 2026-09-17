import { McpIntegrationDocument, validateMcpPlugins } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { ServerConfig } from "../config.ts";
class McpRevisionConflict extends Schema.TaggedError<McpRevisionConflict>()(
  "McpRevisionConflict",
  {},
) {}
const lock = Semaphore.makeUnsafe(1);
const decodeDocument = Schema.decodeUnknownEffect(Schema.fromJsonString(McpIntegrationDocument));
const encodeDocument = Schema.encodeEffect(Schema.fromJsonString(McpIntegrationDocument));
const empty: McpIntegrationDocument = { version: 1, revision: 0, plugins: [] };
export const readMcpIntegrations = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig;
  const filename = path.join(config.stateDir, "mcp-integrations.json");
  if (!(yield* fs.exists(filename))) return empty;
  const document = yield* decodeDocument(yield* fs.readFileString(filename));
  yield* Effect.try(() => validateMcpPlugins(document.plugins));
  return document;
});
export const writeMcpIntegrations = (document: McpIntegrationDocument) =>
  lock.withPermit(
    Effect.gen(function* () {
      yield* Effect.try(() => validateMcpPlugins(document.plugins));
      const current = yield* readMcpIntegrations;
      if (document.revision !== current.revision)
        return yield* Effect.fail(new McpRevisionConflict({}));
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const config = yield* ServerConfig;
      const filename = path.join(config.stateDir, "mcp-integrations.json");
      const next = { ...document, revision: current.revision + 1 };
      yield* fs.makeDirectory(config.stateDir, { recursive: true });
      const encoded = yield* encodeDocument(next);
      if (encoded.length > 262144) return yield* Effect.fail(new McpRevisionConflict({}));
      yield* fs.writeFileString(`${filename}.tmp`, encoded, { mode: 0o600 });
      yield* fs.rename(`${filename}.tmp`, filename);
      return next;
    }),
  );
