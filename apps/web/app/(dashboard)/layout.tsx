import { requireSession } from "@/lib/session";
import { SignOutButton } from "./sign-out-button";
import Link from "next/link";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace } = await requireSession();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
              RivalWatch
            </Link>
            <nav className="flex gap-6 text-sm text-gray-600">
              <Link href="/dashboard" className="hover:text-gray-900">
                Overview
              </Link>
              <Link href="/competitors" className="hover:text-gray-900">
                Competitors
              </Link>
              <Link href="/changes" className="hover:text-gray-900">
                Changes
              </Link>
              <Link href="/billing" className="hover:text-gray-900">
                Billing
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span>{workspace.name}</span>
            <span className="text-gray-300">·</span>
            <span>{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
