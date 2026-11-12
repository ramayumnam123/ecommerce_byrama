import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { VerifyEmailPanel } from "@/components/auth/verify-email-panel";

export const metadata: Metadata = buildMetadata({
  title: "Verify email",
  path: "/verify-email",
  noIndex: true,
});

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return <VerifyEmailPanel token={Array.isArray(token) ? token[0] : token} />;
}
