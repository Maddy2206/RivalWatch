"use client";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() =>
        authClient.signOut({
          fetchOptions: { onSuccess: () => router.push("/sign-in") },
        })
      }
    >
      Sign out
    </Button>
  );
}
