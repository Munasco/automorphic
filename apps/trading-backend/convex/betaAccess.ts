export const BETA_RELEASES_URL = "https://github.com/TennantCloud/automorphic-releases/releases";

export function betaAccess(
  now: number,
  endsAtValue: string | undefined,
  contactEmail: string | undefined,
) {
  const endsAt = endsAtValue ? Date.parse(endsAtValue) : NaN;
  return {
    serverNow: now,
    available: Number.isFinite(endsAt) && now < endsAt,
    endsAt: Number.isFinite(endsAt) ? endsAt : null,
    contactEmail: contactEmail || null,
    downloadUrl: "https://automorphic-six.vercel.app/download",
  };
}

export function betaEmailText(endsAt: number, contactEmail: string | null) {
  const date = new Date(endsAt)
    .toISOString()
    .replace("T", " ")
    .replace(/:00\.000Z$/, " UTC");
  return `Beta access is available. Download Automorphic to get started:\n\nhttps://automorphic-six.vercel.app/download\n\nAll desktop builds: ${BETA_RELEASES_URL}\n\nThis public beta window closes on ${date} while we finish building several features.${contactEmail ? ` Email ${contactEmail} to request continued access.` : ""}\n\nThanks for trying Automorphic.\n\nIf you didn't request this email, you can ignore it.`;
}
