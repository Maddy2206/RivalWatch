/**
 * Typed errors shared across the pipeline. The worker's top-level handler
 * uses `retryable` to decide between retry (with backoff) and dead-letter.
 */
export abstract class RivalWatchError extends Error {
  abstract readonly retryable: boolean;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Transient crawl failure (network error, 5xx, timeout). Retry with backoff. */
export class CrawlError extends RivalWatchError {
  readonly retryable: boolean;

  constructor(message: string, opts?: { retryable?: boolean; cause?: unknown }) {
    super(message, { cause: opts?.cause });
    this.retryable = opts?.retryable ?? true;
  }
}

/** robots.txt disallows this URL. Never retried — the page should be paused. */
export class RobotsDisallowedError extends RivalWatchError {
  readonly retryable = false;

  constructor(url: string) {
    super(`robots.txt disallows crawling: ${url}`);
  }
}

export class ExtractError extends RivalWatchError {
  readonly retryable = false;
}

/** Attempted to diff snapshots produced by different extraction versions. */
export class ExtractVersionMismatchError extends RivalWatchError {
  readonly retryable = false;

  constructor(beforeVersion: number, afterVersion: number) {
    super(
      `Cannot diff snapshots with different extract versions ` +
        `(before=v${beforeVersion}, after=v${afterVersion}); re-extract from raw HTML first`,
    );
  }
}

/** LLM returned unparseable/invalid JSON even after the gateway's retry. */
export class LlmParseError extends RivalWatchError {
  readonly retryable = false;
}

/** Workspace exceeded a plan limit. Not retryable — resolves via upgrade, not time. */
export class PlanLimitError extends RivalWatchError {
  readonly retryable = false;
}
