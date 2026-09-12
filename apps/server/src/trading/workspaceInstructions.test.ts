import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { seedTradingWorkspaceInstructions } from "./workspaceInstructions.ts";

it.effect("preserves existing instruction files and file symlinks when seeded concurrently", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "automorphic-guidance-" });
      yield* fs.writeFileString(`${root}/custom.md`, "User-owned instructions");
      yield* fs.symlink(`${root}/custom.md`, `${root}/AGENTS.md`);
      yield* Effect.all(
        [seedTradingWorkspaceInstructions(root), seedTradingWorkspaceInstructions(root)],
        { concurrency: "unbounded" },
      );
      assert.equal(yield* fs.readFileString(`${root}/custom.md`), "User-owned instructions");
      assert.include(yield* fs.readFileString(`${root}/CLAUDE.md`), "@AGENTS.md");
      assert.equal(
        yield* fs.readFileString(`${root}/.agents/skills/trading-visuals/SKILL.md`),
        yield* fs.readFileString(`${root}/.claude/skills/trading-visuals/SKILL.md`),
      );
      yield* fs.writeFileString(
        `${root}/.agents/skills/trading-visuals/SKILL.md`,
        "Custom visual workflow",
      );
      yield* fs.writeFileString(`${root}/.claude/skills/trading-workflow/SKILL.md`, "Custom skill");
      yield* seedTradingWorkspaceInstructions(root);
      assert.equal(
        yield* fs.readFileString(`${root}/.claude/skills/trading-workflow/SKILL.md`),
        "Custom skill",
      );
      assert.equal(
        yield* fs.readFileString(`${root}/.agents/skills/trading-visuals/SKILL.md`),
        "Custom visual workflow",
      );
    }),
  ).pipe(Effect.provide(NodeServices.layer)),
);
