import { beforeEach, expect, it, vi } from "vite-plus/test";
vi.mock("./workspaceStorage", () => ({
  tradingWorkspaceStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    registerHydrator: vi.fn(),
    capture: vi.fn(),
    getSnapshot: vi.fn(() => ({ ready: true })),
  },
}));
vi.mock("../ui/toast", () => ({ toastManager: { add: vi.fn() } }));
import { tradingWorkspaceStorage } from "./workspaceStorage";
import { useDrawingTemplates, type DrawingTemplate } from "./drawingTemplates";
import {
  MAX_DRAWING_TEMPLATE_FILE_BYTES,
  parseDrawingTemplateFile,
  serializeDrawingTemplate,
  drawingTemplateFileName,
} from "./drawingTemplateTransfer";
import { importDrawingTemplateFile } from "./drawingTemplateFiles";
const template: DrawingTemplate = {
  kind: "fib",
  name: "My levels",
  settings: {
    color: "#123456",
    width: 2,
    lineStyle: "dotted",
    levels: [{ value: 0.5, color: "#abcdef", visible: true }],
    background: false,
  },
};
const file = (text = serializeDrawingTemplate(template)) => ({
  size: new TextEncoder().encode(text).byteLength,
  text: async () => text,
});
beforeEach(() => {
  useDrawingTemplates.setState(useDrawingTemplates.getInitialState(), true);
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
  vi.mocked(tradingWorkspaceStorage.getSnapshot).mockReturnValue({ ready: true } as never);
  vi.mocked(tradingWorkspaceStorage.capture).mockReturnValue({} as never);
});
it("roundtrips sparse settings and nested levels without coordinates, identity, or unknown metadata", () => {
  const text = serializeDrawingTemplate({
    ...template,
    id: "private",
    anchors: [{ time: 1, price: 2 }],
    settings: { ...template.settings, token: "private", locked: true },
  } as never);
  expect(text).not.toContain("private");
  expect(text).not.toContain("anchors");
  expect(text).not.toContain("locked");
  const restored = parseDrawingTemplateFile(text);
  expect(restored).toEqual(template);
  restored.settings.levels![0]!.color = "#ffffff";
  expect(template.settings.levels![0]!.color).toBe("#abcdef");
  expect(drawingTemplateFileName({ ...template, name: " ../Mý levels / " })).toBe(
    "fib-my-levels.json",
  );
});
it.each([
  "{bad",
  "null",
  "[]",
  "{}",
  JSON.stringify({ ...template, format: "automorphic-chart-template", version: 1 }),
  JSON.stringify({ ...template, format: "automorphic-drawing-template", version: 2 }),
  JSON.stringify({
    ...template,
    format: "automorphic-drawing-template",
    version: 1,
    kind: "__proto__",
  }),
  JSON.stringify({ ...template, format: "automorphic-drawing-template", version: 1, settings: {} }),
])("rejects invalid files: %s", (text) => {
  expect(() => parseDrawingTemplateFile(text)).toThrow();
});
it("rejects oversized UTF-8 files and invalid names before normalization", () => {
  expect(() => parseDrawingTemplateFile("😀".repeat(65000))).toThrow("250 KB");
  expect(() => serializeDrawingTemplate({ ...template, name: "a".repeat(81) })).toThrow("name");
  expect(() => serializeDrawingTemplate({ ...template, name: " " })).toThrow("name");
});
it("imports without overwriting collisions, persists settings and leaves source data detached", async () => {
  const destination = tradingWorkspaceStorage.capture();
  expect(await importDrawingTemplateFile(file(), "fib", destination)).toBe("My levels");
  expect(await importDrawingTemplateFile(file(), "fib", destination)).toBe("My levels copy");
  expect(useDrawingTemplates.getState().templates.map((t) => t.name)).toEqual([
    "My levels",
    "My levels copy",
  ]);
  const saved = vi.mocked(tradingWorkspaceStorage.setItem).mock.calls.at(-1)![1];
  vi.mocked(tradingWorkspaceStorage.getItem).mockReturnValue(saved as never);
  useDrawingTemplates.setState({ templates: [] });
  await useDrawingTemplates.persist.rehydrate();
  expect(useDrawingTemplates.getState().templates[1]!.settings).toEqual(template.settings);
});
it("rejects wrong drawing tools and oversized files without writes", async () => {
  const destination = tradingWorkspaceStorage.capture();
  const read = vi.fn(async () => "");
  await expect(importDrawingTemplateFile(file(), "trend", destination)).rejects.toThrow(
    "fib template",
  );
  await expect(
    importDrawingTemplateFile(
      { size: MAX_DRAWING_TEMPLATE_FILE_BYTES + 1, text: read },
      "fib",
      destination,
    ),
  ).rejects.toThrow("250 KB");
  expect(read).not.toHaveBeenCalled();
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
});
it.each(["changed", "loading"])(
  "does not import into a workspace that is %s while the file is read",
  async (mode) => {
    const destination = tradingWorkspaceStorage.capture();
    let resolve!: (text: string) => void;
    const pending = importDrawingTemplateFile(
      {
        size: 100,
        text: () =>
          new Promise<string>((r) => {
            resolve = r;
          }),
      },
      "fib",
      destination,
    );
    if (mode === "changed") vi.mocked(tradingWorkspaceStorage.capture).mockReturnValue({} as never);
    else vi.mocked(tradingWorkspaceStorage.getSnapshot).mockReturnValue({ ready: false } as never);
    resolve(serializeDrawingTemplate(template));
    await expect(pending).rejects.toThrow("workspace changed");
    expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
  },
);
it("rejects imports at per-tool capacity without removing existing templates", async () => {
  useDrawingTemplates.setState({
    templates: Array.from({ length: 20 }, (_, i) => ({ ...template, name: `Saved ${i}` })),
  });
  vi.mocked(tradingWorkspaceStorage.setItem).mockClear();
  await expect(
    importDrawingTemplateFile(file(), "fib", tradingWorkspaceStorage.capture()),
  ).rejects.toThrow("limit reached");
  expect(useDrawingTemplates.getState().templates).toHaveLength(20);
  expect(tradingWorkspaceStorage.setItem).not.toHaveBeenCalled();
});
