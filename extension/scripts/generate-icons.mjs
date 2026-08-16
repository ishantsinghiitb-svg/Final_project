// Generates the extension's icon PNGs at every required size from the
// single master OfferLyst symbol mark (offerlyst-mark.png). Re-run with
// `npm run icons:generate` whenever the master artwork changes.
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SIZES = [16, 32, 48, 128];

const iconsDir = fileURLToPath(new URL("../src/assets/icons", import.meta.url));
const masterPath = path.join(iconsDir, "offerlyst-mark.png");

// The master artwork is portrait (217x253), so fitting it into a square
// letterboxes it. sharp's default `background` for `fit: "contain"` is OPAQUE
// BLACK, which baked black bars down the left and right edge of every
// generated icon — visible as dark lines beside the mark in the extension
// popup, the floating panel launcher and the browser tab. Padding with a
// fully transparent background instead keeps the letterboxing invisible on
// any surface. Nothing else about the icons changes.
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

for (const size of SIZES) {
  const filePath = path.join(iconsDir, `icon-${size}.png`);
  await sharp(masterPath)
    .resize(size, size, { fit: "contain", background: TRANSPARENT })
    .png()
    .toFile(filePath);
  console.log(`Generated ${filePath}`);
}
