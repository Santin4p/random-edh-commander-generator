export type ScryfallCard = {
  id: string
  name: string
  oracle_id?: string
  prints_search_uri?: string
  color_identity: string[]
  oracle_text?: string
  image_uris?: { normal: string; large: string }
  card_faces?: Array<{
    image_uris?: { normal: string; large: string }
    oracle_text?: string
  }>
  scryfall_uri: string
  artist?: string
}

export type ScryfallPrinting = {
  id: string
  set: string
  set_name: string
  artist?: string
  image_uris?: { normal: string; large: string }
  card_faces?: Array<{
    image_uris?: { normal: string; large: string }
  }>
}

export function getCardImage(card: ScryfallCard | ScryfallPrinting): string {
  return (
    card.image_uris?.normal ??
    card.card_faces?.[0]?.image_uris?.normal ??
    ""
  )
}

export function getCardOracleText(card: ScryfallCard): string {
  return (
    card.oracle_text ??
    card.card_faces?.map((f) => f.oracle_text ?? "").join("\n//\n") ??
    ""
  )
}

export function getEdhrecSlug(card: ScryfallCard): string {
  return card.name
    .toLowerCase()
    .replace(/[',]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

// Fetches all printings via the pre-built Scryfall URL included in each card.
// Filters to: one per unique artist (non-SLD, latest wins) + all Secret Lair.
// Returns [] on any failure — never throws.
export async function fetchCardPrintings(
  printsSearchUri: string
): Promise<ScryfallPrinting[]> {
  try {
    const res = await fetch(`${printsSearchUri}&unique=prints`)
    if (!res.ok) return []
    const data = await res.json()
    const cards: ScryfallPrinting[] = Array.isArray(data.data) ? data.data : []

    const sld = cards.filter((c) => c.set === "sld")
    const nonSLD = cards.filter((c) => c.set !== "sld")

    // One per unique artist — iterating oldest→newest so the last write (most recent) wins
    const byArtist = new Map<string, ScryfallPrinting>()
    for (const card of nonSLD) {
      if (card.artist) byArtist.set(card.artist, card)
    }

    return [...byArtist.values(), ...sld]
  } catch {
    return []
  }
}

// id= means EXACT color identity (e.g. id=WU → only true Azorius commanders).
// Scryfall color identity already accounts for mana symbols in rules text.
export async function fetchRandomCommander(
  colorIdentity: string[]
): Promise<ScryfallCard> {
  let query = "is:commander"
  if (colorIdentity.length > 0) {
    query += ` id=${colorIdentity.join("")}`
  }
  const url = `https://api.scryfall.com/cards/random?q=${encodeURIComponent(query)}`

  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Scryfall ${res.status}: ${body}`)
  }
  return res.json() as Promise<ScryfallCard>
}
