/**
 * Minimal robots.txt evaluation (pure: text in, decision out). Follows the
 * common interpretation: most-specific user-agent group wins, longest path
 * match wins, allow beats disallow on equal length. Supports `*` wildcards
 * and `$` end anchors in paths.
 */

export const CRAWLER_USER_AGENT = "RivalWatchBot";

interface RobotsRule {
  allow: boolean;
  path: string;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

export function parseRobotsTxt(txt: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (field === "user-agent") {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === "allow" || field === "disallow") {
      lastWasAgent = false;
      if (!current) continue;
      if (value === "" && field === "disallow") continue; // "Disallow:" = allow all
      current.rules.push({ allow: field === "allow", path: value });
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function pathMatches(rulePath: string, urlPath: string): number {
  // Returns match specificity (rule length) or -1 if no match.
  const anchored = rulePath.endsWith("$");
  const pattern = anchored ? rulePath.slice(0, -1) : rulePath;
  const regex = new RegExp(
    "^" + pattern.split("*").map(escapeRegExp).join(".*") + (anchored ? "$" : ""),
  );
  return regex.test(urlPath) ? rulePath.length : -1;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function selectGroup(groups: RobotsGroup[], userAgent: string): RobotsGroup | null {
  const ua = userAgent.toLowerCase();
  let best: RobotsGroup | null = null;
  let bestLength = -1;
  for (const group of groups) {
    for (const agent of group.agents) {
      if (agent !== "*" && ua.includes(agent) && agent.length > bestLength) {
        best = group;
        bestLength = agent.length;
      }
    }
  }
  return best ?? groups.find((g) => g.agents.includes("*")) ?? null;
}

/**
 * Decide whether `url` may be crawled according to `robotsTxt`.
 * An unparseable or empty robots.txt allows everything.
 */
export function isAllowed(robotsTxt: string, url: string, userAgent = CRAWLER_USER_AGENT): boolean {
  let path: string;
  try {
    const parsed = new URL(url);
    path = parsed.pathname + parsed.search;
  } catch {
    return false;
  }

  const group = selectGroup(parseRobotsTxt(robotsTxt), userAgent);
  if (!group) return true;

  let verdict = true;
  let bestSpecificity = -1;
  for (const rule of group.rules) {
    const specificity = pathMatches(rule.path, path);
    if (specificity > bestSpecificity || (specificity === bestSpecificity && rule.allow)) {
      if (specificity >= 0) {
        verdict = rule.allow;
        bestSpecificity = specificity;
      }
    }
  }
  return verdict;
}
