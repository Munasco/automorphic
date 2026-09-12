import { defineConfig } from "astro/config";

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || "http://localhost:4173",
  server: {
    port: Number(process.env.PORT ?? 4173),
  },
});
