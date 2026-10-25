export const BREAKING_WINDOW_MS = 15 * 60_000;

type Headline = { title: string; category: string; publishedAt: string };

/** Pin publisher-marked breaking headlines only while they are fresh. */
export function selectBreakingNews<T extends Headline>(items: readonly T[], now: number): T | null {
  return (
    items
      .filter((item) => {
        const age = now - Date.parse(item.publishedAt);
        const marked =
          /^(?:breaking(?: news)?|just in)\s*[:—–-]/i.test(item.title.trim()) ||
          /^(?:breaking|breaking news|just in)$/i.test(item.category.trim());
        return marked && Number.isFinite(age) && age >= 0 && age < BREAKING_WINDOW_MS;
      })
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0] ?? null
  );
}
