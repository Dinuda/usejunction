/**
 * Copy the DotLottie WASM binary into public/ so the player never depends on
 * jsDelivr/unpkg at runtime (those CDNs fail for some users → blank hero).
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const destDir = join(root, "public", "animations");
const dest = join(destDir, "dotlottie-player.wasm");

const reactEntry = require.resolve("@lottiefiles/dotlottie-react");
let dir = dirname(reactEntry);
let src = null;

for (let i = 0; i < 10; i++) {
  const candidate = join(dir, "@lottiefiles", "dotlottie-web", "dist", "dotlottie-player.wasm");
  if (existsSync(candidate)) {
    src = candidate;
    break;
  }
  dir = dirname(dir);
}

if (!src) {
  console.error("sync-dotlottie-wasm: could not find dotlottie-player.wasm near @lottiefiles/dotlottie-react");
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`sync-dotlottie-wasm: ${src} → ${dest}`);
