import { query } from "./_generated/server";

export const appConfig = query({
  args: {},
  handler: async () => {
    const id = Number(process.env.AUTOMORPHIC_TELEGRAM_API_ID);
    const hash = process.env.AUTOMORPHIC_TELEGRAM_API_HASH?.trim();
    if (Number.isSafeInteger(id) && id > 0 && hash && /^[a-f\d]{32}$/i.test(hash)) {
      return { id, hash };
    }
    return null;
  },
});
