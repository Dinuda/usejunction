export class PayloadTooLargeError extends Error {
  constructor() {
    super("payload too large");
  }
}

export async function readJsonWithLimit<T = unknown>(request: Request, maxBytes = 1_048_576): Promise<T> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new PayloadTooLargeError();
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new PayloadTooLargeError();
  return JSON.parse(text) as T;
}
