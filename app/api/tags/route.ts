import { NextRequest, NextResponse } from "next/server"

// Fetches EDHREC taglinks for a given commander slug.
// Returns { tags: string[] } always — never throws to the client.
// Cached server-side for 1 hour to avoid hammering EDHREC on repeat spins.
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug")?.trim()
  if (!slug) return NextResponse.json({ tags: [] })

  try {
    const res = await fetch(
      `https://json.edhrec.com/pages/commanders/${encodeURIComponent(slug)}.json`,
      {
        next: { revalidate: 3600 },
        headers: { "User-Agent": "random-edh-commander-generator/1.0" },
        signal: AbortSignal.timeout(6000),
      }
    )

    if (!res.ok) return NextResponse.json({ tags: [] })

    const data: unknown = await res.json()

    // Defensive extraction — any structural change just yields []
    const taglinks =
      data !== null &&
      typeof data === "object" &&
      "panels" in data &&
      data.panels !== null &&
      typeof data.panels === "object" &&
      "taglinks" in data.panels
        ? data.panels.taglinks
        : null

    if (!Array.isArray(taglinks)) return NextResponse.json({ tags: [] })

    const tags = taglinks
      .slice(0, 6) // top 6 by deck count (already sorted desc)
      .flatMap((item: unknown) => {
        if (
          item !== null &&
          typeof item === "object" &&
          "value" in item &&
          typeof (item as Record<string, unknown>).value === "string"
        ) {
          return [(item as Record<string, string>).value]
        }
        return []
      })

    return NextResponse.json({ tags })
  } catch {
    // Network error, timeout, JSON parse failure, anything — graceful empty
    return NextResponse.json({ tags: [] })
  }
}
