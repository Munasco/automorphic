export type RenewalResult = { status: string; expiration?: number; httpStatus?: number };
export function tokenExpiry(token: string | undefined): number;
export function renewTradovateSession(options: {
  envPath: string;
  force?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<RenewalResult>;
export function startTradovateRenewal(envPath: string, log?: (message: string) => void): () => void;
