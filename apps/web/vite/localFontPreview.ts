// @effect-diagnostics nodeBuiltinImport:off - Vite development middleware serves one optional local font file.
import * as NodeFSP from "node:fs/promises";
import type { Plugin } from "vite-plus";

/** Local typeface evaluation assets are never copied into public build output. */
export function localFontPreview(): Plugin {
  return {
    name: "automorphic-local-font-preview",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(
        "/__local-fonts/aeoniktrial-regular.otf",
        async (_request, response) => {
          try {
            const font = await NodeFSP.readFile(
              new URL("../.local-fonts/aeoniktrial-regular.otf", import.meta.url),
            );
            response.setHeader("Content-Type", "font/otf");
            response.setHeader("Cache-Control", "no-store");
            response.end(font);
          } catch {
            response.statusCode = 404;
            response.end();
          }
        },
      );
    },
  };
}
