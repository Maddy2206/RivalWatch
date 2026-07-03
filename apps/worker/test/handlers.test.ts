import { describe, expect, it, vi } from "vitest";

import { handleAlert } from "../src/handlers/alert.js";
import { handleClassify } from "../src/handlers/classify.js";
import { handleCrawl } from "../src/handlers/crawl.js";
import { handleDiff } from "../src/handlers/diff.js";
import { handleExtract } from "../src/handlers/extract.js";
import { makeFakeDeps } from "./helpers.js";

vi.mock("@rivalwatch/db", () => ({
  getPageById: vi.fn(),
  isPageWithinPlan: vi.fn(async () => true),
  pausePage: vi.fn(async () => {}),
  recordPageFailure: vi.fn(async () => ({ degraded: false })),
  schedulePageAfterSuccess: vi.fn(async () => {}),
  insertSnapshotWithSections: vi.fn(),
  getSnapshotById: vi.fn(),
  getPreviousSnapshot: vi.fn(),
  getSectionsForSnapshot: vi.fn(),
  replaceSnapshotSections: vi.fn(async () => {}),
  insertChanges: vi.fn(),
  getChangeById: vi.fn(),
  getPageContext: vi.fn(),
  setChangeClassification: vi.fn(async () => {}),
  setChangeError: vi.fn(async () => {}),
  createAlert: vi.fn(),
}));

import {
  createAlert,
  getChangeById,
  getPageById,
  getPageContext,
  getPreviousSnapshot,
  getSectionsForSnapshot,
  getSnapshotById,
  insertChanges,
  insertSnapshotWithSections,
  isPageWithinPlan,
  pausePage,
  recordPageFailure,
} from "@rivalwatch/db";

describe("handleCrawl", () => {
  it("skips a paused page", async () => {
    const deps = makeFakeDeps();
    vi.mocked(getPageById).mockResolvedValue({
      id: "p1",
      status: "paused",
    } as never);

    await handleCrawl(deps, { pageId: "p1" });
    expect(deps.fetcher.fetch).not.toHaveBeenCalled();
  });

  it("skips a page outside its workspace plan", async () => {
    const deps = makeFakeDeps();
    vi.mocked(getPageById).mockResolvedValue({ id: "p1", status: "active", url: "http://x/" } as never);
    vi.mocked(isPageWithinPlan).mockResolvedValueOnce(false);

    await handleCrawl(deps, { pageId: "p1" });
    expect(deps.fetcher.fetch).not.toHaveBeenCalled();
  });

  it("pauses the page and throws when robots.txt disallows", async () => {
    const deps = makeFakeDeps({ robots: { isUrlAllowed: vi.fn(async () => false) } });
    vi.mocked(getPageById).mockResolvedValue({ id: "p1", status: "active", url: "http://x/" } as never);

    await expect(handleCrawl(deps, { pageId: "p1" })).rejects.toThrow(/robots\.txt/);
    expect(pausePage).toHaveBeenCalledWith(deps.db, "p1");
  });

  it("records a failure and rethrows when the fetch fails", async () => {
    const deps = makeFakeDeps({
      fetcher: {
        fetch: vi.fn(async () => {
          throw new Error("network down");
        }),
        close: vi.fn(async () => {}),
      },
    });
    vi.mocked(getPageById).mockResolvedValue({ id: "p1", status: "active", url: "http://x/" } as never);

    await expect(handleCrawl(deps, { pageId: "p1" })).rejects.toThrow("network down");
    expect(recordPageFailure).toHaveBeenCalledWith(deps.db, "p1");
  });

  it("stores raw html and enqueues extract on success", async () => {
    const deps = makeFakeDeps();
    vi.mocked(getPageById).mockResolvedValue({
      id: "p1",
      status: "active",
      url: "http://x/",
      crawlIntervalMinutes: 60,
    } as never);

    await handleCrawl(deps, { pageId: "p1" });
    expect(deps.storage.put).toHaveBeenCalled();
    expect(deps.enqueued).toHaveLength(1);
    expect(deps.enqueued[0]!.queue).toBe("extract");
  });
});

describe("handleExtract", () => {
  it("extracts sections, persists the snapshot, and enqueues diff", async () => {
    const deps = makeFakeDeps({
      storage: {
        put: vi.fn(async () => {}),
        get: vi.fn(async () => "<h1>Hello</h1><p>World</p>"),
      },
    });
    vi.mocked(insertSnapshotWithSections).mockResolvedValue({ id: "snap1" } as never);

    await handleExtract(deps, { pageId: "p1", rawHtmlKey: "raw/p1/1.html", httpStatus: 200 });

    expect(insertSnapshotWithSections).toHaveBeenCalled();
    expect(deps.enqueued).toHaveLength(1);
    expect(deps.enqueued[0]).toEqual({ queue: "diff", payload: { snapshotId: "snap1" } });
  });
});

describe("handleDiff", () => {
  it("does nothing for the first snapshot of a page (no previous)", async () => {
    const deps = makeFakeDeps();
    vi.mocked(getSnapshotById).mockResolvedValue({
      id: "s2",
      pageId: "p1",
      extractVersion: 1,
      contentHash: "abc",
    } as never);
    vi.mocked(getPreviousSnapshot).mockResolvedValue(undefined);

    await handleDiff(deps, { snapshotId: "s2" });
    expect(deps.enqueued).toHaveLength(0);
  });

  it("skips when content hash is unchanged", async () => {
    const deps = makeFakeDeps();
    vi.mocked(getSnapshotById).mockResolvedValue({
      id: "s2",
      pageId: "p1",
      extractVersion: 1,
      contentHash: "same",
    } as never);
    vi.mocked(getPreviousSnapshot).mockResolvedValue({
      id: "s1",
      extractVersion: 1,
      contentHash: "same",
      rawHtmlKey: "raw/p1/1.html",
    } as never);

    await handleDiff(deps, { snapshotId: "s2" });
    expect(getSectionsForSnapshot).not.toHaveBeenCalled();
    expect(deps.enqueued).toHaveLength(0);
  });

  it("diffs sections, gates noise, and enqueues classify only for signal changes", async () => {
    const deps = makeFakeDeps();
    vi.mocked(getSnapshotById).mockResolvedValue({
      id: "s2",
      pageId: "p1",
      extractVersion: 1,
      contentHash: "new",
    } as never);
    vi.mocked(getPreviousSnapshot).mockResolvedValue({
      id: "s1",
      extractVersion: 1,
      contentHash: "old",
      rawHtmlKey: "raw/p1/1.html",
    } as never);
    vi.mocked(getSectionsForSnapshot).mockImplementation(async (_db, snapshotId: string) => {
      if (snapshotId === "s1") {
        return [
          {
            anchorKey: "pricing",
            kind: "pricing_table",
            heading: "Plans",
            position: 0,
            normalizedText: "Pro | $29/mo",
            textHash: "hash-before",
          },
        ];
      }
      return [
        {
          anchorKey: "pricing",
          kind: "pricing_table",
          heading: "Plans",
          position: 0,
          normalizedText: "Pro | $39/mo",
          textHash: "hash-after",
        },
      ];
    });
    vi.mocked(insertChanges).mockResolvedValue([
      { id: "change1", status: "pending" } as never,
    ]);

    await handleDiff(deps, { snapshotId: "s2" });

    expect(insertChanges).toHaveBeenCalled();
    expect(deps.enqueued).toHaveLength(1);
    expect(deps.enqueued[0]).toEqual({ queue: "classify", payload: { changeId: "change1" } });
  });
});

describe("handleClassify", () => {
  it("skips a change that is not pending", async () => {
    const deps = makeFakeDeps();
    vi.mocked(getChangeById).mockResolvedValue({ id: "c1", status: "classified" } as never);

    await handleClassify(deps, { changeId: "c1" });
    expect(deps.classify).not.toHaveBeenCalled();
  });

  it("classifies a pending change and enqueues an alert for high severity pricing", async () => {
    const deps = makeFakeDeps();
    vi.mocked(getChangeById).mockResolvedValue({
      id: "c1",
      status: "pending",
      pageId: "p1",
      heading: "Plans",
      sectionKind: "pricing_table",
      changeType: "modified",
      diffSummary: "[-$29-] {+$39+}",
    } as never);
    vi.mocked(getPageContext).mockResolvedValue({
      pageId: "p1",
      url: "http://x/pricing",
      kind: "pricing",
      competitorName: "Acme",
      workspaceId: "w1",
    } as never);

    await handleClassify(deps, { changeId: "c1" });

    expect(deps.classify).toHaveBeenCalled();
    expect(deps.enqueued).toHaveLength(1);
    expect(deps.enqueued[0]).toEqual({ queue: "alert", payload: { changeId: "c1" } });
  });
});

describe("handleAlert", () => {
  it("records an alert for a classified change", async () => {
    const deps = makeFakeDeps();
    vi.mocked(getChangeById).mockResolvedValue({
      id: "c1",
      status: "classified",
      pageId: "p1",
      headline: "Pro price increased",
    } as never);
    vi.mocked(getPageContext).mockResolvedValue({
      workspaceId: "w1",
    } as never);
    vi.mocked(createAlert).mockResolvedValue({ id: "alert1" } as never);

    await handleAlert(deps, { changeId: "c1" });
    expect(createAlert).toHaveBeenCalledWith(deps.db, { workspaceId: "w1", changeId: "c1" });
  });
});
