import {
  defaultDrawingLevels,
  parallelChannelSettingsLevels,
  type ChartDrawing,
} from "./drawingGeometry";
import { sanitizeDrawingVisibility } from "./drawingVisibility";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function mergeValue(before: unknown, after: unknown, target: unknown): unknown {
  if (JSON.stringify(before) === JSON.stringify(after)) return target;
  if (!isRecord(before) || !isRecord(after) || !isRecord(target)) return after;
  const result = { ...target };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    if (Object.hasOwn(after, key)) result[key] = mergeValue(before[key], after[key], target[key]);
    else delete result[key];
  }
  return result;
}

/** Apply only fields changed by an edit, preserving unrelated work in the target. */
export function mergeDrawingChanges(
  before: ChartDrawing | undefined,
  after: ChartDrawing | undefined,
  target: ChartDrawing,
): ChartDrawing {
  if (!before || !after || before === after) return target;
  const result = { ...target };
  for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const key = field as keyof ChartDrawing;
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    if (key === "visibility" && after.visibility) {
      result.visibility = sanitizeDrawingVisibility(
        mergeValue(
          sanitizeDrawingVisibility(before.visibility),
          after.visibility,
          sanitizeDrawingVisibility(target.visibility),
        ),
      );
    } else if (key === "levels" && after.levels) {
      // Older drawings store implicit levels. Compare the same settings rows that
      // the editor exposes so changing one row does not replace a peer's other row.
      const expandedChannel =
        before.kind === "channel" &&
        [before, after, target].some((drawing) => (drawing.levels?.length ?? 0) >= 7);
      const levels = (drawing: ChartDrawing) =>
        expandedChannel
          ? parallelChannelSettingsLevels(drawing)
          : (drawing.levels ?? defaultDrawingLevels(drawing.kind));
      const previous = levels(before),
        next = levels(after),
        current = levels(target);
      if (
        JSON.stringify(previous.map((level) => level.value)) ===
          JSON.stringify(next.map((level) => level.value)) &&
        JSON.stringify(previous.map((level) => level.value)) ===
          JSON.stringify(current.map((level) => level.value))
      ) {
        result.levels = next.map(
          (level, index) => mergeValue(previous[index], level, current[index]) as typeof level,
        );
      } else result.levels = after.levels;
    } else if (Object.hasOwn(after, key))
      Object.assign(result, { [key]: mergeValue(before[key], after[key], target[key]) });
    else delete result[key];
  }
  return result;
}

/** Rebase snapshots without resurrecting drawings already absent from the target. */
export function applyDrawingChanges(
  before: ChartDrawing[],
  after: ChartDrawing[],
  target: ChartDrawing[],
): ChartDrawing[] {
  const previous = new Map(before.map((drawing) => [drawing.id, drawing]));
  const next = new Map(after.map((drawing) => [drawing.id, drawing]));
  const result = target.flatMap((drawing) => {
    if (previous.has(drawing.id) && !next.has(drawing.id)) return [];
    return [mergeDrawingChanges(previous.get(drawing.id), next.get(drawing.id), drawing)];
  });
  for (const drawing of after) {
    if (!previous.has(drawing.id) && !result.some((item) => item.id === drawing.id)) {
      const index = after.findIndex((item) => item.id === drawing.id);
      const successor = after
        .slice(index + 1)
        .find((item) => result.some((current) => current.id === item.id));
      const position = successor
        ? result.findIndex((item) => item.id === successor.id)
        : result.length;
      result.splice(position, 0, drawing);
    }
  }
  const survivingBefore = before.filter((item) => next.has(item.id)).map((item) => item.id);
  const survivingAfter = after.filter((item) => previous.has(item.id)).map((item) => item.id);
  if (JSON.stringify(survivingBefore) !== JSON.stringify(survivingAfter)) {
    // Reorder shared objects while retaining local-only objects in their own slots.
    const ordered = after.flatMap((item) => result.filter((current) => current.id === item.id));
    let index = 0;
    return result.map((item) => (next.has(item.id) ? ordered[index++]! : item));
  }
  return result;
}
