import { NextResponse } from "next/server"

// Extract commander names from EDHREC's JSON structure (try multiple known patterns).
function extractNames(data: unknown): string[] {
  if (data === null || typeof data !== "object") return []
  const d = data as Record<string, unknown>

  // Pattern A: container.json_dict.cardlists[*].cardviews
  try {
    const container = d.container as Record<string, unknown> | undefined
    const jd = container?.json_dict as Record<string, unknown> | undefined
    const cardlists = jd?.cardlists as Array<Record<string, unknown>> | undefined
    if (Array.isArray(cardlists)) {
      for (const list of cardlists) {
        const cardviews = list.cardviews as Array<Record<string, unknown>> | undefined
        if (Array.isArray(cardviews) && cardviews.length >= 10) {
          const names = cardviews
            .map((cv) => (typeof cv.name === "string" ? cv.name : null))
            .filter(Boolean) as string[]
          if (names.length >= 10) return names.slice(0, 100)
        }
      }
    }
  } catch { /* try next pattern */ }

  // Pattern B: panels.cardlist.cardviews
  try {
    const panels = d.panels as Record<string, unknown> | undefined
    const cardlist = panels?.cardlist as Record<string, unknown> | undefined
    const cardviews = cardlist?.cardviews as Array<Record<string, unknown>> | undefined
    if (Array.isArray(cardviews) && cardviews.length >= 10) {
      const names = cardviews
        .map((cv) => (typeof cv.name === "string" ? cv.name : null))
        .filter(Boolean) as string[]
      if (names.length >= 10) return names.slice(0, 100)
    }
  } catch { /* try next pattern */ }

  return []
}

// Resolve up to 150 card names to Scryfall IDs using the collection endpoint (max 75 per batch).
async function resolveNamesToIds(names: string[]): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < names.length; i += 75) {
    const batch = names.slice(i, i + 75)
    try {
      const res = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "random-edh-commander-generator/1.0" },
        body: JSON.stringify({ identifiers: batch.map((name) => ({ name })) }),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const data = await res.json() as { data: Array<{ id: string }> }
      ids.push(...data.data.map((c) => c.id))
    } catch { /* skip batch on error */ }
  }
  return ids
}

// Returns an array of up to 100 Scryfall IDs for the top EDHREC commanders.
// Primary: live EDHREC data (accurate commander ranking).
// Fallback: Scryfall edhrec sort (may differ from live EDHREC but always available).
// Cached server-side for 24h so clients pay the latency only once per day.
export async function GET() {
  // ── Primary: EDHREC live top commanders ──
  try {
    const edhrecRes = await fetch("https://json.edhrec.com/pages/commanders.json", {
      next: { revalidate: 86400 },
      headers: { "User-Agent": "random-edh-commander-generator/1.0" },
      signal: AbortSignal.timeout(7000),
    })
    if (edhrecRes.ok) {
      const data: unknown = await edhrecRes.json()
      const names = extractNames(data)
      if (names.length >= 20) {
        const ids = await resolveNamesToIds(names)
        if (ids.length >= 20) {
          return NextResponse.json(
            { ids, source: "edhrec" },
            { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } }
          )
        }
      }
    }
  } catch { /* fall through to Scryfall */ }

  // ── Fallback: Scryfall edhrec sort ──
  try {
    const res = await fetch(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent("is:commander")}&order=edhrec`,
      { next: { revalidate: 86400 }, headers: { "User-Agent": "random-edh-commander-generator/1.0" } }
    )
    if (res.ok) {
      const data = await res.json() as { data: Array<{ id: string }> }
      const ids = data.data.slice(0, 100).map((c) => c.id)
      return NextResponse.json(
        { ids, source: "scryfall-fallback" },
        { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } }
      )
    }
  } catch { /* nothing we can do */ }

  return NextResponse.json({ ids: [], source: "error" }, { status: 503 })
}
