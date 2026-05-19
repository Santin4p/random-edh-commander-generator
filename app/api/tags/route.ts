import { NextRequest, NextResponse } from "next/server"

// Simple in-memory rate limiter: 60 requests per IP per minute
const rl = new Map<string, { n: number; exp: number }>()
function allowed(ip: string): boolean {
  const now = Date.now()
  const e = rl.get(ip)
  if (!e || now > e.exp) { rl.set(ip, { n: 1, exp: now + 60_000 }); return true }
  if (e.n >= 60) return false
  e.n++; return true
}

function extractRank(data: unknown): number | null {
  if (data === null || typeof data !== "object") return null
  try {
    const d = data as Record<string, unknown>
    if (typeof d.rank === "number") return d.rank
    // Try panels.cardview.json_dict.card.rank
    const panels = d.panels as Record<string, unknown> | undefined
    const cardview = panels?.cardview as Record<string, unknown> | undefined
    const jd1 = cardview?.json_dict as Record<string, unknown> | undefined
    const card1 = jd1?.card as Record<string, unknown> | undefined
    if (typeof card1?.rank === "number") return card1.rank as number
    // Try container.json_dict.card.rank
    const container = d.container as Record<string, unknown> | undefined
    const jd2 = container?.json_dict as Record<string, unknown> | undefined
    const card2 = jd2?.card as Record<string, unknown> | undefined
    if (typeof card2?.rank === "number") return card2.rank as number
  } catch { /* ignore */ }
  return null
}

// Fetches EDHREC tags + rank for a given commander slug.
// Returns { tags: string[], rank: number | null } always — never throws.
// Cached server-side for 1 hour.
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
  if (!allowed(ip)) return NextResponse.json({ tags: [], rank: null }, { status: 429 })

  const slug = req.nextUrl.searchParams.get("slug")?.trim()
  if (!slug) return NextResponse.json({ tags: [], rank: null })

  try {
    const res = await fetch(
      `https://json.edhrec.com/pages/commanders/${encodeURIComponent(slug)}.json`,
      {
        next: { revalidate: 3600 },
        headers: { "User-Agent": "random-edh-commander-generator/1.0" },
        signal: AbortSignal.timeout(6000),
      }
    )

    if (!res.ok) return NextResponse.json({ tags: [], rank: null })

    const data: unknown = await res.json()

    const taglinks =
      data !== null &&
      typeof data === "object" &&
      "panels" in data &&
      data.panels !== null &&
      typeof data.panels === "object" &&
      "taglinks" in data.panels
        ? data.panels.taglinks
        : null

    const tags = Array.isArray(taglinks)
      ? taglinks
          .slice(0, 6)
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
      : []

    const rank = extractRank(data)

    return NextResponse.json({ tags, rank })
  } catch {
    return NextResponse.json({ tags: [], rank: null })
  }
}
