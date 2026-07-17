// Generates the extension's icon PNGs at every required size from the
// single master NextOffer logo (nextoffer-mark.png). Re-run with
// `npm run icons:generate` whenever the master artwork changes.
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SIZES = [16, 32, 48, 128];

const iconsDir = fileURLToPath(new URL("../src/assets/icons", import.meta.url));
const masterPath = path.join(iconsDir, "nextoffer-mark.png");

for (const size of SIZES) {
  const filePath = path.join(iconsDir, `icon-${size}.png`);
  await sharp(masterPath).resize(size, size, { fit: "contain" }).png().toFile(filePath);
  console.log(`Generated ${filePath}`);
}
