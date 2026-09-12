import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";

export const accountAuthUrl =
  import.meta.env.VITE_AUTOMORPHIC_AUTH_URL || "https://ideal-mastiff-363.convex.site";
export const accountClient = createAuthClient({
  baseURL: accountAuthUrl,
  plugins: [
    convexClient(),
    crossDomainClient({ storagePrefix: "automorphic-account", disableCache: true }),
    emailOTPClient(),
  ],
});
