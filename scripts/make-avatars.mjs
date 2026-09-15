// One-time asset build: shrink the source avatar PNGs into small, web-sized
// card faces. Run once (`npm run build:avatars`); the output is committed and
// `sharp` is not needed to run the workshop.
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

const SRC = process.argv[2] ?? "C:/Users/Admin/SoulCircle/Circle/public/avatars";
const OUT = "public/avatars";
const SIZE = 256;

await fs.mkdir(OUT, { recursive: true });
const files = (await fs.readdir(SRC)).filter((f) => f.endsWith(".png")).sort();

const manifest = [];
for (const file of files) {
  const id = file.replace(/^avatar-/, "").replace(/\.png$/, "");
  const outName = `${id.toLowerCase()}.webp`;
  await sharp(path.join(SRC, file))
    .resize(SIZE, SIZE, { fit: "cover" })
    .webp({ quality: 82 })
    .toFile(path.join(OUT, outName));
  manifest.push({ id, file: outName });
}

await fs.writeFile(
  path.join(OUT, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(`wrote ${manifest.length} avatars to ${OUT}`);
