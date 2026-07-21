/**
 * Render HTML to an A4 PDF via headless Chrome.
 * - Vercel/Lambda: puppeteer-core + @sparticuz/chromium
 * - Local/CI: Playwright Chromium (already installed for e2e)
 *
 * Uses setContent (not goto) so cron does not need an authenticated page URL.
 */

let browserCloser: (() => Promise<void>) | null = null;

async function renderWithPlaywright(html: string): Promise<Buffer> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--font-render-hinting=none"],
  });
  browserCloser = async () => {
    await browser.close().catch(() => undefined);
    browserCloser = null;
  };
  const page = await browser.newPage();
  try {
    await page.setViewportSize({ width: 1240, height: 1754 });
    await page.setContent(html, { waitUntil: "networkidle", timeout: 30_000 });
    await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fonts = (document as any).fonts;
      if (fonts?.ready) await fonts.ready;
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function renderWithPuppeteer(html: string): Promise<Buffer> {
  const puppeteer = await import("puppeteer-core");
  const chromium = (await import("@sparticuz/chromium")).default;
  const browser = await puppeteer.default.launch({
    args: chromium.args,
    defaultViewport: { width: 1240, height: 1754 },
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  browserCloser = async () => {
    await browser.close().catch(() => undefined);
    browserCloser = null;
  };
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30_000 });
    await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fonts = (document as any).fonts;
      if (fonts?.ready) await fonts.ready;
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return renderWithPuppeteer(html);
  }
  return renderWithPlaywright(html);
}

/** Close any leftover browser (tests / process shutdown). */
export async function closePdfBrowser(): Promise<void> {
  if (browserCloser) await browserCloser();
}
