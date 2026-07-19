import { readFile, writeFile } from "node:fs/promises";

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/brand-usejunction-lottie.mjs <input.json> <output.json>");
}

let source = await readFile(inputPath, "utf8");

source = source
  .replaceAll("LausanneRAMP", "UseJunctionSans")
  .replaceAll("Lausanne RAMP", "UseJunction Sans")
  .replaceAll("TWKLausanne", "UseJunctionSans")
  .replaceAll("TWK Lausanne", "UseJunction Sans")
  .replaceAll("Lausanne-Light", "UseJunctionSans-Light");

const animation = JSON.parse(source);

animation.nm = "UseJunction AI insights";
animation.meta = {
  ...(animation.meta ?? {}),
  brand: "UseJunction",
};

animation.assets = (animation.assets ?? []).filter((asset) => asset.id !== "usejunction-logo");
animation.assets.push({
  id: "usejunction-logo",
  e: 0,
  w: 851,
  h: 207,
  p: "usejunction.png",
  u: "/images/",
});

animation.layers = (animation.layers ?? []).filter((layer) => layer.nm !== "UseJunction logo");
animation.layers.unshift({
  ty: 2,
  nm: "UseJunction logo",
  sr: 1,
  st: 0,
  op: animation.op,
  ip: animation.ip,
  hasMask: false,
  ao: 0,
  ks: {
    a: { a: 0, k: [425.5, 103.5, 0] },
    s: { a: 0, k: [28, 28, 100] },
    p: {
      a: 1,
      k: [
        {
          t: 0,
          s: [360, 52, 0],
          e: [360, 68, 0],
          i: { x: [0.667], y: [1] },
          o: { x: [0.333], y: [0] },
        },
        { t: 14, s: [360, 68, 0] },
      ],
    },
    r: { a: 0, k: 0 },
    sa: { a: 0, k: 0 },
    o: {
      a: 1,
      k: [
        {
          t: 0,
          s: [0],
          e: [100],
          i: { x: [0.667], y: [1] },
          o: { x: [0.333], y: [0] },
        },
        { t: 14, s: [100] },
      ],
    },
  },
  refId: "usejunction-logo",
  ind: 2,
});

await writeFile(outputPath, JSON.stringify(animation));
