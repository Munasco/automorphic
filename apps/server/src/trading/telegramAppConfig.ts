// Official desktop builds supply the application's Telegram identity at build time.
// Account authorization and saved sessions remain separate for each installation.
declare const __AUTOMORPHIC_BUILD_TELEGRAM_API_ID__: string | undefined;
declare const __AUTOMORPHIC_BUILD_TELEGRAM_API_HASH__: string | undefined;

export function bundledTelegramApp() {
  const id =
    typeof __AUTOMORPHIC_BUILD_TELEGRAM_API_ID__ === "undefined"
      ? 0
      : Number(__AUTOMORPHIC_BUILD_TELEGRAM_API_ID__);
  const hash =
    typeof __AUTOMORPHIC_BUILD_TELEGRAM_API_HASH__ === "undefined"
      ? ""
      : __AUTOMORPHIC_BUILD_TELEGRAM_API_HASH__;
  return Number.isSafeInteger(id) && id > 0 && /^[a-f\d]{32}$/i.test(hash) ? { id, hash } : null;
}
