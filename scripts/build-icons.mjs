// Renders the app icon artwork to the PNG sizes iOS, Android and the web
// manifest need. Run after changing assets/brand/app-icon.svg:
//
//   node scripts/build-icons.mjs
//
// Uses sharp, which Next.js already installs for image optimisation.
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const svg = readFileSync(path.join(root, "assets/brand/app-icon.svg"));
mkdirSync(path.join(root, "public/icons"), { recursive: true });

const outputs = [
  // the artwork keeps everything inside the 80% safe circle, so one design
  // serves as both the "any" and the "maskable" icon
  { file: "public/icons/icon-192.png", size: 192 },
  { file: "public/icons/icon-512.png", size: 512 },
  { file: "public/icons/maskable-192.png", size: 192 },
  { file: "public/icons/maskable-512.png", size: 512 },
  // iOS home screen; Next.js links app/apple-icon.png automatically
  { file: "app/apple-icon.png", size: 180 },
];

for (const { file, size } of outputs) {
  await sharp(svg, { density: Math.ceil((72 * size) / 1024) * 4 })
    .resize(size, size)
    .flatten({ background: "#101827" })
    .png({ compressionLevel: 9 })
    .toFile(path.join(root, file));
  console.log(`wrote ${file} (${size}×${size})`);
}
