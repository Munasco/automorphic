import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const source = process.argv[2];
if (!source || source === "--help") {
  console.log(
    "Usage: vp run --filter @t3tools/marketing snapshot:update /path/to/workspace-screenshot.png",
  );
  process.exit(source ? 0 : 1);
}
const destination = fileURLToPath(new URL("../public/workspace-snapshot.jpg", import.meta.url));
const temporary = `${destination}.${process.pid}.tmp`;
try {
  // Read first so the existing snapshot can also be used as the source.
  const input = await readFile(source);
  const output = await sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 2400, withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  await writeFile(temporary, output);
  await rename(temporary, destination);
  console.log("Workspace snapshot updated. Rebuild the landing page to publish it.");
} catch {
  await rm(temporary, { force: true });
  console.error(
    "Could not update the snapshot. Provide a readable image file (maximum 40 megapixels).",
  );
  process.exitCode = 1;
}
