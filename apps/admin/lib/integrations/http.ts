const MAX_ATTEMPTS = 4;

function retryable(status: number) {
  return status === 429 || status === 408 || status >= 500;
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function providerFetch(url: string, init: RequestInit = {}) {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
      if (!retryable(response.status) || attempt === MAX_ATTEMPTS - 1) return response;
      const retryAfter = Number(response.headers.get("retry-after"));
      await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt);
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS - 1) throw error;
      await wait(250 * 2 ** attempt);
    }
  }
  throw lastError;
}

export async function fetchJson<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await providerFetch(url, init);
  const text = await response.text();
  if (!response.ok) throw new Error(`provider request failed (${response.status}): ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export async function fetchNdjson(url: string): Promise<Record<string, unknown>[]> {
  const response = await providerFetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`report download failed (${response.status}): ${text.slice(0, 500)}`);
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}
