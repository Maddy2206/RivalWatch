import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleAlert } from "../src/handlers/alert.js";
import { handleBrief } from "../src/handlers/brief.js";
import { handleClassify } from "../src/handlers/classify.js";
import { handleCrawl } from "../src/handlers/crawl.js";
import { handleDeliver } from "../src/handlers/deliver.js";
import { handleDiff } from "../src/handlers/diff.js";
import { handleExtract } from "../src/handlers/extract.js";
import { makeFakeDeps } from "./helpers.js";

vi.mock("@rivalwatch/config", () => ({
  hasResendConfigured: vi.fn(() => true),
  loadEnv: vi.fn(() => ({ APP_URL: "http://localhost:3000" })),
}));

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
  getWorkspaceOwnerEmail: vi.fn(),
  markAlertSent: vi.fn(async () => {}),
  getWorkspaceById: vi.fn(),
  getChangesForWorkspaceInPeriod: vi.fn(),
  createBrief: vi.fn(),
  getBriefById: vi.fn(),
  markBriefSent: vi.fn(async () => {}),
}));

import { hasResendConfigured } from "@rivalwatch/config";
import {
  createAlert,
  createBrief,
  getBriefById,
  getChangeById,
  getChangesForWorkspaceInPeriod,
  getPageById,
  getPageContext,
  getPreviousSnapshot,
  getSectionsForSnapshot,
  getSnapshotById,
  getWorkspaceById,
  getWorkspaceOwnerEmail,
  insertChanges,
  insertSnapshotWithSections,
  isPageWithinPlan,
  markAlertSent,
  markBriefSent,
  pausePage,
  recordPageFailure,
} from "@rivalwatch/db";

beforeEach(() => {
  vi.clearAllMocks();
});

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
  it("records an alert and sends email when the workspace has an owner and Resend is configured", async () => {
    const deps = makeFakeDeps();
    vi.mocked(getChangeById).mockResolvedValue({
      id: "c1",
      status: "classified",
      pageId: "p1",
      headline: "Pro price increased",
      category: "pricing",
      severity: 5,
      whyItMatters: "Competitor undercut our pricing",
    } as never);
    vi.mocked(getPageContext).mockResolvedValue({
      workspaceId: "w1",
      competitorName: "Acme",
    } as never);
    vi.mocked(createAlert).mockResolvedValue({ id: "alert1" } as never);
    vi.mocked(getWorkspaceOwnerEmail).mockResolvedValue("owner@example.com");
    vi.mocked(hasResendConfigured).mockReturnValue(true);

    await handleAlert(deps, { changeId: "c1" });

    expect(createAlert).toHaveBeenCalledWith(deps.db, { workspaceId: "w1", changeId: "c1" });
    expect(deps.sendAlertEmail).toHaveBeenCalledWith(
      "owner@example.com",
      expect.objectContaining({ competitorName: "Acme", headline: "Pro price increased" }),
    );
    expect(markAlertSent).toHaveBeenCalledWith(deps.db, "alert1");
  });

  it("records the alert but skips sending when the workspace has no owner", async () => {
    const deps = makeFakeDeps();
    vi.mocked(getChangeById).mockResolvedValue({ id: "c1", status: "classified", pageId: "p1" } as never);
    vi.mocked(getPageContext).mockResolvedValue({ workspaceId: "w1", competitorName: "Acme" } as never);
    vi.mocked(createAlert).mockResolvedValue({ id: "alert1" } as never);
    vi.mocked(getWorkspaceOwnerEmail).mockResolvedValue(undefined);

    await handleAlert(deps, { changeId: "c1" });

    expect(deps.sendAlertEmail).not.toHaveBeenCalled();
    expect(markAlertSent).not.toHaveBeenCalled();
  });

  it("records the alert but skips sending when Resend is not configured", async () => {
    const deps = makeFakeDeps();
    vi.mocked(getChangeById).mockResolvedValue({ id: "c1", status: "classified", pageId: "p1" } as never);
    vi.mocked(getPageContext).mockResolvedValue({ workspaceId: "w1", competitorName: "Acme" } as never);
    vi.mocked(createAlert).mockResolvedValue({ id: "alert1" } as never);
    vi.mocked(getWorkspaceOwnerEmail).mockResolvedValue("owner@example.com");
    vi.mocked(hasResendConfigured).mockReturnValue(false);

    await handleAlert(deps, { changeId: "c1" });

    expect(deps.sendAlertEmail).not.toHaveBeenCalled();
    expect(markAlertSent).not.toHaveBeenCalled();
  });
});

describe("handleBrief", () => {
  it("skips when there are no classified changes this period", async () => {
    const deps = makeFakeDeps();
    vi.mocked(getWorkspaceById).mockResolvedValue({ id: "w1", name: "Acme Workspace" } as never);
    vi.mocked(getChangesForWorkspaceInPeriod).mockResolvedValue([]);

    await handleBrief(deps, { workspaceId: "w1" });

    expect(deps.synthesizeBrief).not.toHaveBeenCalled();
    expect(createBrief).not.toHaveBeenCalled();
  });

  it("synthesizes a brief and enqueues delivery when changes exist", async () => {
    const deps = makeFakeDeps();
    vi.mocked(getWorkspaceById).mockResolvedValue({ id: "w1", name: "Acme Workspace" } as never);
    vi.mocked(getChangesForWorkspaceInPeriod).mockResolvedValue([
      { competitorName: "Rival", headline: "Cut prices", category: "pricing", severity: 5, whyItMatters: "!" },
    ]);
    vi.mocked(createBrief).mockResolvedValue({ id: "brief1" } as never);

    await handleBrief(deps, { workspaceId: "w1" });

    expect(deps.synthesizeBrief).toHaveBeenCalled();
    expect(createBrief).toHaveBeenCalled();
    expect(deps.enqueued).toEqual([{ queue: "deliver", payload: { briefId: "brief1" } }]);
  });
});

describe("handleDeliver", () => {
  it("sends the brief email and marks it sent", async () => {
    const deps = makeFakeDeps();
    vi.mocked(getBriefById).mockResolvedValue({
      id: "brief1",
      workspaceId: "w1",
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-01-08"),
      contentMd: "Narrative.",
    } as never);
    vi.mocked(getWorkspaceById).mockResolvedValue({ id: "w1", name: "Acme Workspace" } as never);
    vi.mocked(getWorkspaceOwnerEmail).mockResolvedValue("owner@example.com");
    vi.mocked(hasResendConfigured).mockReturnValue(true);
    vi.mocked(getChangesForWorkspaceInPeriod).mockResolvedValue([]);

    await handleDeliver(deps, { briefId: "brief1" });

    expect(deps.sendBriefEmail).toHaveBeenCalledWith(
      "owner@example.com",
      expect.objectContaining({ workspaceName: "Acme Workspace" }),
    );
    expect(markBriefSent).toHaveBeenCalledWith(deps.db, "brief1");
  });

  it("leaves the brief unsent when the workspace has no owner", async () => {
    const deps = makeFakeDeps();
    vi.mocked(getBriefById).mockResolvedValue({
      id: "brief1",
      workspaceId: "w1",
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-01-08"),
      contentMd: "Narrative.",
    } as never);
    vi.mocked(getWorkspaceById).mockResolvedValue({ id: "w1", name: "Acme Workspace" } as never);
    vi.mocked(getWorkspaceOwnerEmail).mockResolvedValue(undefined);

    await handleDeliver(deps, { briefId: "brief1" });

    expect(deps.sendBriefEmail).not.toHaveBeenCalled();
    expect(markBriefSent).not.toHaveBeenCalled();
  });
});
