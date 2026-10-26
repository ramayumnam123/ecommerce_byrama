import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

/**
 * Internal cache-purge webhook (docs/11 F9). The backend calls this after
 * product/category writes with `X-Internal-Token: $REVALIDATE_SECRET` and a
 * JSON body `{ tags?: string[]; paths?: string[] }`.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "REVALIDATE_SECRET is not set" } },
      { status: 503 },
    );
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = request.headers.get("x-internal-token") ?? bearer;
  if (!provided || provided !== secret) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid revalidation token" } },
      { status: 401 },
    );
  }

  let body: { tags?: unknown; paths?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Expected a JSON body" } },
      { status: 400 },
    );
  }

  const tags = Array.isArray(body.tags)
    ? body.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  const paths = Array.isArray(body.paths)
    ? body.paths.filter((path): path is string => typeof path === "string")
    : [];

  if (!tags.length && !paths.length) {
    return NextResponse.json(
      { error: { code: "NOTHING_TO_DO", message: "Provide tags and/or paths" } },
      { status: 400 },
    );
  }

  tags.forEach((tag) => revalidateTag(tag));
  paths.forEach((path) => revalidatePath(path));

  console.info("[revalidate]", { tags, paths });
  return NextResponse.json({ revalidated: true, tags, paths, now: Date.now() });
}
