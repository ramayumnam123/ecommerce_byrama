"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, MailWarning } from "lucide-react";
import { api, unwrap } from "@/lib/api";
import { messageForError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function VerifyEmailPanel({ token }: { token?: string }) {
  const [state, setState] = React.useState<"idle" | "pending" | "done" | "error">(
    token ? "pending" : "idle",
  );
  const [error, setError] = React.useState<string | null>(null);
  const ran = React.useRef(false);

  React.useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    (async () => {
      try {
        await unwrap(await api.POST("/api/auth/verify-email", { body: { token } }));
        setState("done");
      } catch (e) {
        setError(messageForError(e));
        setState("error");
      }
    })();
  }, [token]);

  if (!token) {
    return (
      <div className="space-y-5">
        <span className="flex size-12 items-center justify-center rounded-full bg-amber-500/15">
          <MailWarning className="size-6 text-amber-700 dark:text-amber-400" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Verify your email</h1>
          <p className="text-sm text-muted-foreground">
            Open the link from your inbox to verify. You can sign in now — checkout
            unlocks after verification.
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href="/account">Go to account</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {state === "pending" ? (
        <>
          <span className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Loader2 className="size-6 animate-spin" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Verifying your email…</h1>
          <p className="text-sm text-muted-foreground">This takes just a second.</p>
        </>
      ) : state === "done" ? (
        <>
          <span className="flex size-12 items-center justify-center rounded-full bg-emerald-600/10">
            <CheckCircle2 className="size-6 text-emerald-700 dark:text-emerald-400" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Email verified</h1>
          <p className="text-sm text-muted-foreground">
            Your account is ready. Checkout is now unlocked.
          </p>
          <Button asChild className="w-full">
            <Link href="/account">Continue to your account</Link>
          </Button>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Link didn&apos;t work</h1>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground">
            Verification links expire after 48 hours. Sign in and resend the link from
            your account.
          </p>
          <Button asChild className="w-full">
            <Link href="/account">Go to account</Link>
          </Button>
        </>
      )}
    </div>
  );
}
