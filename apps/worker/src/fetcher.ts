import { loadEnv } from "@rivalwatch/config";
import { CrawlError, CRAWLER_USER_AGENT } from "@rivalwatch/core";
import type { Browser } from "playwright";

export interface FetchResult {
  html: string;
  status: number;
}

export interface PageFetcher {
  fetch(url: string): Promise<FetchResult>;
  close(): Promise<void>;
}

const FETCH_TIMEOUT_MS = 30_000;

/** Plain HTTP fetch — fine for static pages and the offline fixture server. */
export class HttpFetcher implements PageFetcher {
  async fetch(url: string): Promise<FetchResult> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "user-agent": `${CRAWLER_USER_AGENT}/0.1 (+https://rivalwatch.app/bot)` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "follow",
      });
    } catch (error) {
      throw new CrawlError(`Fetch failed for ${url}`, { retryable: true, cause: error });
    }
    if (response.status >= 500) {
      throw new CrawlError(`HTTP ${response.status} for ${url}`, { retryable: true });
    }
    if (response.status >= 400) {
      throw new CrawlError(`HTTP ${response.status} for ${url}`, { retryable: false });
    }
    return { html: await response.text(), status: response.status };
  }

  async close(): Promise<void> {}
}

/** Headless Chromium via Playwright — needed for JS-rendered pages. */
export class PlaywrightFetcher implements PageFetcher {
  private browser: Browser | undefined;

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      const { chromium } = await import("playwright");
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }

  async fetch(url: string): Promise<FetchResult> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent: `${CRAWLER_USER_AGENT}/0.1 (+https://rivalwatch.app/bot)`,
    });
    try {
      const page = await context.newPage();
      const response = await page.goto(url, {
        waitUntil: "networkidle",
        timeout: FETCH_TIMEOUT_MS,
      });
      const status = response?.status() ?? 0;
      if (status >= 500) throw new CrawlError(`HTTP ${status} for ${url}`, { retryable: true });
      if (status >= 400) throw new CrawlError(`HTTP ${status} for ${url}`, { retryable: false });
      return { html: await page.content(), status };
    } catch (error) {
      if (error instanceof CrawlError) throw error;
      throw new CrawlError(`Playwright fetch failed for ${url}`, { retryable: true, cause: error });
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined;
  }
}

/**
 * CRAWL_MODE=playwright|http|auto. In auto mode, fall back to plain HTTP when
 * Playwright (or its browser download) isn't available — keeps local dev and
 * the offline fixture pipeline working without `playwright install`.
 */
export async function makeFetcher(): Promise<PageFetcher> {
  const mode = loadEnv().CRAWL_MODE;
  if (mode === "http") return new HttpFetcher();
  if (mode === "playwright") return new PlaywrightFetcher();
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return new PlaywrightFetcher();
  } catch {
    console.warn("[fetcher] Playwright browser unavailable — falling back to HTTP fetch");
    return new HttpFetcher();
  }
}
