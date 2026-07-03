/** The only file that may import the resend SDK. */
import { loadEnv, requireEnv } from "@rivalwatch/config";
import { InstantAlertEmail, WeeklyBriefEmail, type InstantAlertEmailProps, type WeeklyBriefEmailProps } from "@rivalwatch/emails";
import { Resend } from "resend";

let client: Resend | undefined;

function getClient(): Resend {
  if (!client) client = new Resend(requireEnv("RESEND_API_KEY"));
  return client;
}

function fromAddress(): string {
  // resend.dev works without a verified sending domain — fine for local dev;
  // set RESEND_FROM_EMAIL once a real domain is verified with Resend.
  return loadEnv().RESEND_FROM_EMAIL ?? "RivalWatch <onboarding@resend.dev>";
}

export async function sendAlertEmail(to: string, props: InstantAlertEmailProps): Promise<void> {
  const resend = getClient();
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to,
    subject: `${props.competitorName}: ${props.headline}`,
    react: InstantAlertEmail(props),
  });
  if (error) throw new Error(`Resend send failed: ${error.name} — ${error.message}`);
}

export async function sendBriefEmail(to: string, props: WeeklyBriefEmailProps): Promise<void> {
  const resend = getClient();
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to,
    subject: `Weekly brief for ${props.workspaceName} — ${props.periodEnd}`,
    react: WeeklyBriefEmail(props),
  });
  if (error) throw new Error(`Resend send failed: ${error.name} — ${error.message}`);
}
