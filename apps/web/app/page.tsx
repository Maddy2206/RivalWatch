import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">RivalWatch</h1>
      <p className="max-w-md text-balance text-gray-600">
        Competitive intelligence autopilot for indie SaaS founders. The
        pipeline — crawl, extract, diff, classify, brief, deliver — is the
        product; this dashboard is a shell around it.
      </p>
      <div className="flex gap-3">
        <Link href="/sign-up">
          <Button>Get started</Button>
        </Link>
        <Link href="/sign-in">
          <Button variant="outline">Sign in</Button>
        </Link>
      </div>
      <p className="text-sm text-gray-400">Billing ships in a later phase.</p>
    </main>
  );
}
