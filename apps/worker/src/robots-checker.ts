import { CRAWLER_USER_AGENT, isAllowed } from "@rivalwatch/core";

const ROBOTS_TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  txt: string;
  fetchedAt: number;
}

/** Fetches and caches robots.txt per origin; evaluation itself is pure core logic. */
export class RobotsChecker {
  private cache = new Map<string, CacheEntry>();

  async isUrlAllowed(url: string): Promise<boolean> {
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      return false;
    }
    const cached = this.cache.get(origin);
    let txt: string;
    if (cached && Date.now() - cached.fetchedAt < ROBOTS_TTL_MS) {
      txt = cached.txt;
    } else {
      txt = await this.fetchRobots(origin);
      this.cache.set(origin, { txt, fetchedAt: Date.now() });
    }
    return isAllowed(txt, url, CRAWLER_USER_AGENT);
  }

  private async fetchRobots(origin: string): Promise<string> {
    try {
      const response = await fetch(`${origin}/robots.txt`, {
        headers: { "user-agent": CRAWLER_USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      });
      // Missing/errored robots.txt is conventionally treated as allow-all.
      if (!response.ok) return "";
      return await response.text();
    } catch {
      return "";
    }
  }
}
