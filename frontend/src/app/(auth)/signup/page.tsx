import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SignUpForm } from "@/components/auth/signup-form";

export const metadata: Metadata = buildMetadata({
  title: "Create account",
  path: "/signup",
  noIndex: true,
});

function safeNext(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return undefined;
  return raw;
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return <SignUpForm next={safeNext(next)} />;
}
