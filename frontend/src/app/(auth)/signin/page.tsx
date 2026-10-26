import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SignInForm } from "@/components/auth/signin-form";

export const metadata: Metadata = buildMetadata({
  title: "Sign in",
  path: "/signin",
  noIndex: true,
});

function safeNext(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return undefined;
  return raw;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return <SignInForm next={safeNext(next)} />;
}
