// Idempotent tooling: derives the public brand assets from mockups/logo.png.
// Run once (or after replacing the source): npx tsx scripts/build-brand-assets.ts
// Outputs three PNGs into public/brand/ — mark (full-color lockup), white
// (purple text recolored white for the dark footer, orange/spider art kept),
// and icon (small raster for browser/home-screen icons).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SOURCE = path.resolve("mockups/logo.png");
const OUT_DIR = path.resolve("public/brand");

/** Recolor pixels whose hue is the brand purple (blue-dominant, saturated)
 * to white, leaving alpha, oranges, and the spider art untouched. */
async function whiteVariant(): Promise<Buffer> {
  const { data, info } = await sharp(SOURCE).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturated = max > 60 && max - min > 40;
    if (saturated && b >= r && b > g) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const base = sharp(SOURCE);
  await writeFile(path.join(OUT_DIR, "pollys-logo-mark.png"), await base.clone().resize({ width: 512 }).png().toBuffer());
  await writeFile(path.join(OUT_DIR, "pollys-logo-white.png"), await sharp(await whiteVariant()).resize({ width: 512 }).png().toBuffer());
  await writeFile(path.join(OUT_DIR, "pollys-logo-icon.png"), await base.clone().resize({ width: 180 }).png().toBuffer());
  console.log("brand assets written to public/brand/");
}

void main();