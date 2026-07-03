/**
 * Plain HTML/JSX (no @react-email/components — see instant-alert.tsx for why).
 */
export interface WeeklyBriefChange {
  competitorName: string;
  headline: string;
  category: string;
  severity: number;
  whyItMatters: string;
}

export interface WeeklyBriefEmailProps {
  workspaceName: string;
  periodStart: string;
  periodEnd: string;
  summaryMd: string;
  changes: WeeklyBriefChange[];
  dashboardUrl: string;
}

export function WeeklyBriefEmail({
  workspaceName,
  periodStart,
  periodEnd,
  summaryMd,
  changes,
  dashboardUrl,
}: WeeklyBriefEmailProps) {
  const paragraphs = summaryMd
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body style={{ backgroundColor: "#f9fafb", fontFamily: "sans-serif", margin: 0, padding: "32px 16px" }}>
        <div style={{ display: "none", overflow: "hidden", lineHeight: "1px", opacity: 0, maxHeight: 0, maxWidth: 0 }}>
          Weekly brief for {workspaceName}: {changes.length} change{changes.length === 1 ? "" : "s"}
        </div>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ maxWidth: "560px", margin: "0 auto" }}>
          <tbody>
            <tr>
              <td style={{ backgroundColor: "#ffffff", padding: "32px", borderRadius: "8px" }}>
                <p style={{ color: "#6b7280", fontSize: "13px", margin: "0 0 4px" }}>
                  {periodStart} – {periodEnd}
                </p>
                <h1 style={{ fontSize: "22px", margin: "0 0 16px" }}>{workspaceName}&apos;s weekly brief</h1>

                {paragraphs.map((paragraph, i) => (
                  <p key={i} style={{ fontSize: "15px", lineHeight: 1.5 }}>
                    {paragraph}
                  </p>
                ))}

                <hr style={{ margin: "24px 0", border: "none", borderTop: "1px solid #e5e7eb" }} />

                {changes.map((change, i) => (
                  <div key={i} style={{ marginBottom: "16px" }}>
                    <p style={{ color: "#6b7280", fontSize: "12px", margin: "0 0 2px" }}>
                      {change.competitorName} · {change.category} · Severity {change.severity}
                    </p>
                    <p style={{ fontWeight: 600, fontSize: "15px", margin: "0 0 2px" }}>{change.headline}</p>
                    <p style={{ fontSize: "14px", color: "#374151", margin: 0 }}>{change.whyItMatters}</p>
                  </div>
                ))}

                <hr style={{ margin: "24px 0", border: "none", borderTop: "1px solid #e5e7eb" }} />
                <a
                  href={dashboardUrl}
                  style={{
                    display: "inline-block",
                    backgroundColor: "#111827",
                    color: "#ffffff",
                    padding: "10px 20px",
                    borderRadius: "6px",
                    fontSize: "14px",
                    textDecoration: "none",
                  }}
                >
                  Open dashboard
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

export default WeeklyBriefEmail;
