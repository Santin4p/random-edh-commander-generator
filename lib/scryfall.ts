export type ScryfallCard = {
  id: string
  name: string
  color_identity: string[]
  oracle_text?: string
  image_uris?: { normal: string; large: string }
  card_faces?: Array<{
    image_uris?: { normal: string; large: string }
    oracle_text?: string
  }>
  scryfall_uri: string
}

export function getCardImage(card: ScryfallCard): string {
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

// Scryfall /cards/random returns a random card matching the query.
// color<=WUBRG means "color identity is a subset of these colors".
export async function fetchRandomCommander(
  colorIdentity: string[]
): Promise<ScryfallCard> {
  const colors = colorIdentity.length > 0 ? colorIdentity.join("") : "WUBRG"
  const query = `is:commander color<=${colors}`
  const url = `https://api.scryfall.com/cards/random?q=${encodeURIComponent(query)}`

  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Scryfall ${res.status}: ${body}`)
  }
  return res.json() as Promise<ScryfallCard>
}
