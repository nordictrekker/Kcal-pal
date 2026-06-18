import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";
mkdirSync("public/icons", { recursive: true });
const icon = readFileSync("brand/icon.svg");
const maskable = readFileSync("brand/maskable.svg");
const cover = readFileSync("brand/cover.svg");
const jobs = [
  [icon, 512, "public/icons/icon-512.png"],
  [icon, 192, "public/icons/icon-192.png"],
  [icon, 180, "public/icons/apple-touch-icon.png"],
  [maskable, 512, "public/icons/maskable-512.png"],
  [icon, 180, "app/apple-icon.png"],
];
for (const [buf, size, out] of jobs) {
  await sharp(buf).resize(size, size).png().toFile(out);
  console.log("wrote", out, size);
}
await sharp(cover, { density: 200 }).resize(1200, 630).png().toFile("app/opengraph-image.png");
await sharp(cover, { density: 200 }).resize(1200, 630).png().toFile("app/twitter-image.png");
console.log("wrote covers");
