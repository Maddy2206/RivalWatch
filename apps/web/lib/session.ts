import { auth } from "@/lib/auth";
import { getDb, getOrCreateWorkspaceForOwner, type Workspace } from "@rivalwatch/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

/**
 * Server-side auth guard for dashboard pages/layouts and server actions.
 * Redirects to /sign-in if there's no valid session, and auto-provisions the
 * user's single workspace on first visit.
 */
export async function requireSession(): Promise<{ user: CurrentUser; workspace: Workspace }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const db = getDb();
  const workspace = await getOrCreateWorkspaceForOwner(
    db,
    session.user.id,
    `${session.user.name}'s Workspace`,
  );
  return { user: session.user, workspace };
}
