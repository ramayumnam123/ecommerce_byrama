"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, unwrap } from "@/lib/api";
import { messageForError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

const schema = z
  .object({
    new_password: z
      .string()
      .min(8, "At least 8 characters")
      .max(72, "At most 72 characters")
      .regex(/[A-Z]/, "Include one uppercase letter")
      .regex(/[0-9]/, "Include one digit"),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });

type Values = z.infer<typeof schema>;

export function ResetPasswordForm({ token }: { token?: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { new_password: "", confirm: "" },
  });

  if (!token) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Reset link missing</h1>
        <p className="text-sm text-muted-foreground">
          This page needs a valid token. Request a fresh link and try again.
        </p>
        <Button asChild className="w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold tracking-tight">Password updated</h1>
        <p className="text-sm text-muted-foreground">
          You can now sign in with your new password.
        </p>
        <Button asChild className="w-full">
          <Link href="/signin">Sign in</Link>
        </Button>
      </div>
    );
  }

  async function onSubmit(values: Values) {
    setPending(true);
    setError(null);
    try {
      await unwrap(
        await api.POST("/api/auth/reset-password", {
          body: { token: token!, new_password: values.new_password },
        }),
      );
      toast.success("Password updated");
      setDone(true);
      setTimeout(() => router.push("/signin"), 1200);
    } catch (e) {
      setError(messageForError(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">
          8+ characters, one uppercase letter and one digit.
        </p>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="new_password">New password</Label>
          <Input
            id="new_password"
            type="password"
            autoComplete="new-password"
            {...register("new_password")}
          />
          {errors.new_password ? (
            <p className="text-xs text-destructive">{errors.new_password.message}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            {...register("confirm")}
          />
          {errors.confirm ? (
            <p className="text-xs text-destructive">{errors.confirm.message}</p>
          ) : null}
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Update password
        </Button>
      </form>
    </div>
  );
}
