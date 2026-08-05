"use client";

import { setWasmUrl } from "@lottiefiles/dotlottie-react";

/** Same-origin WASM — DotLottie defaults to jsDelivr/unpkg, which fail for some users. */
export const DOTLOTTIE_WASM_URL = "/animations/dotlottie-player.wasm";

let configured = false;

/** Idempotent; call before mounting any DotLottieReact player. */
export function ensureDotLottieWasm() {
  if (configured) return;
  setWasmUrl(DOTLOTTIE_WASM_URL);
  configured = true;
}
