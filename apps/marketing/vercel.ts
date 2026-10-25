import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  redirects: [{ source: "/download", destination: "/waitlist", permanent: false }],
  git: {
    deploymentEnabled: false,
  },
  installCommand: "npm install -g vite-plus && vp install --filter '@t3tools/marketing...'",
  buildCommand: "vp run --filter @t3tools/marketing build",
  outputDirectory: "dist",
};
