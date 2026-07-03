/**
 * Plain HTML/JSX (no @react-email/components — that package and its
 * sub-packages are flagged "no longer supported" on npm; see packages/emails
 * for why). Only @react-email/render is used (Resend's own peer dependency,
 * not deprecated) to turn this into an HTML string.
 */
export interface InstantAlertEmailProps {
  competitorName: string;
  headline: string;
  category: string;
  severity: number;
  whyItMatters: string;
  changeUrl: string;
}

const SEVERITY_LABEL: Record<number, string> = {
  4: "Important",
  5: "Critical",
};

export function InstantAlertEmail({
  competitorName,
  headline,
  category,
  severity,
  whyItMatters,
  changeUrl,
}: InstantAlertEmailProps) {
  const label = SEVERITY_LABEL[severity] ?? `Severity ${severity}`;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body style={{ backgroundColor: "#f9fafb", fontFamily: "sans-serif", margin: 0, padding: "32px 16px" }}>
        {/* Preview text: shown in the inbox list, hidden in the rendered body. */}
        <div style={{ display: "none", overflow: "hidden", lineHeight: "1px", opacity: 0, maxHeight: 0, maxWidth: 0 }}>
          {competitorName}: {headline}
        </div>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ maxWidth: "560px", margin: "0 auto" }}>
          <tbody>
            <tr>
              <td style={{ backgroundColor: "#ffffff", padding: "32px", borderRadius: "8px" }}>
                <p style={{ color: "#b91c1c", fontWeight: 600, fontSize: "13px", margin: "0 0 8px" }}>
                  {label} · {category}
                </p>
                <h1 style={{ fontSize: "20px", margin: "0 0 4px" }}>{headline}</h1>
                <p style={{ color: "#6b7280", fontSize: "14px", margin: "0 0 16px" }}>{competitorName}</p>
                <p style={{ fontSize: "15px", lineHeight: 1.5, margin: 0 }}>{whyItMatters}</p>
                <hr style={{ margin: "24px 0", border: "none", borderTop: "1px solid #e5e7eb" }} />
                <a
                  href={changeUrl}
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
                  View in RivalWatch
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

export default InstantAlertEmail;
