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
  purchase_uris?: {
    tcgplayer?: string
    cardmarket?: string
    cardhoarder?: string
  }
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

export async function fetchCommanderById(id: string): Promise<ScryfallCard> {
  const res = await fetch(`https://api.scryfall.com/cards/${encodeURIComponent(id)}`, { cache: "no-store" })
  if (!res.ok) throw new Error(`Scryfall ${res.status}`)
  return res.json() as Promise<ScryfallCard>
}

export async function fetchRandomPartner(excludeId?: string, colorIdentity: string[] = []): Promise<ScryfallCard> {
  let q = `is:commander o:partner -o:"partner with" -o:"choose a background" -o:"character select"`
  if (colorIdentity.length > 0) q += ` id<=${colorIdentity.join("")}`
  const url = `https://api.scryfall.com/cards/random?q=${encodeURIComponent(q)}`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`Scryfall ${res.status}`)
  const card = await res.json() as ScryfallCard
  if (excludeId && card.id === excludeId) {
    const res2 = await fetch(url, { cache: "no-store" })
    if (res2.ok) return res2.json() as Promise<ScryfallCard>
  }
  return card
}

export async function fetchRandomDoctor(excludeId?: string, colorIdentity: string[] = []): Promise<ScryfallCard> {
  let q = `is:commander t:"time lord" t:doctor`
  if (colorIdentity.length > 0) q += ` id<=${colorIdentity.join("")}`
  const url = `https://api.scryfall.com/cards/random?q=${encodeURIComponent(q)}`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`Scryfall ${res.status}`)
  const card = await res.json() as ScryfallCard
  if (excludeId && card.id === excludeId) {
    const res2 = await fetch(url, { cache: "no-store" })
    if (res2.ok) return res2.json() as Promise<ScryfallCard>
  }
  return card
}

export async function fetchRandomCharacterSelectPartner(excludeId?: string, colorIdentity: string[] = []): Promise<ScryfallCard> {
  let q = `is:commander o:"partner—character select"`
  if (colorIdentity.length > 0) q += ` id<=${colorIdentity.join("")}`
  const url = `https://api.scryfall.com/cards/random?q=${encodeURIComponent(q)}`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`Scryfall ${res.status}`)
  const card = await res.json() as ScryfallCard
  if (excludeId && card.id === excludeId) {
    const res2 = await fetch(url, { cache: "no-store" })
    if (res2.ok) return res2.json() as Promise<ScryfallCard>
  }
  return card
}

export async function fetchRandomFriendsForeverPartner(excludeId?: string, colorIdentity: string[] = []): Promise<ScryfallCard> {
  let q = `is:commander o:"friends forever"`
  if (colorIdentity.length > 0) q += ` id<=${colorIdentity.join("")}`
  const url = `https://api.scryfall.com/cards/random?q=${encodeURIComponent(q)}`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`Scryfall ${res.status}`)
  const card = await res.json() as ScryfallCard
  if (excludeId && card.id === excludeId) {
    const res2 = await fetch(url, { cache: "no-store" })
    if (res2.ok) return res2.json() as Promise<ScryfallCard>
  }
  return card
}

export async function fetchRandomSurvivorPartner(excludeId?: string, colorIdentity: string[] = []): Promise<ScryfallCard> {
  let q = `is:commander o:"partner—survivors"`
  if (colorIdentity.length > 0) q += ` id<=${colorIdentity.join("")}`
  const url = `https://api.scryfall.com/cards/random?q=${encodeURIComponent(q)}`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`Scryfall ${res.status}`)
  const card = await res.json() as ScryfallCard
  if (excludeId && card.id === excludeId) {
    const res2 = await fetch(url, { cache: "no-store" })
    if (res2.ok) return res2.json() as Promise<ScryfallCard>
  }
  return card
}

export async function fetchRandomFatherSonPartner(excludeId?: string, colorIdentity: string[] = []): Promise<ScryfallCard> {
  let q = `is:commander o:"father & son"`
  if (colorIdentity.length > 0) q += ` id<=${colorIdentity.join("")}`
  const url = `https://api.scryfall.com/cards/random?q=${encodeURIComponent(q)}`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`Scryfall ${res.status}`)
  const card = await res.json() as ScryfallCard
  if (excludeId && card.id === excludeId) {
    const res2 = await fetch(url, { cache: "no-store" })
    if (res2.ok) return res2.json() as Promise<ScryfallCard>
  }
  return card
}

export async function fetchRandomBackground(colorIdentity: string[] = []): Promise<ScryfallCard> {
  let q = "t:background"
  if (colorIdentity.length > 0) q += ` id<=${colorIdentity.join("")}`
  const res = await fetch(
    `https://api.scryfall.com/cards/random?q=${encodeURIComponent(q)}`,
    { cache: "no-store" }
  )
  if (!res.ok) throw new Error(`Scryfall ${res.status}`)
  return res.json() as Promise<ScryfallCard>
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

// Duo mode: commander with generic partner ability (not "partner with", not "choose a background").
export async function fetchRandomDuoCommander(colorIdentity: string[]): Promise<ScryfallCard> {
  let query = `is:commander o:partner -o:"partner with" -o:"choose a background" -o:"character select"`
  if (colorIdentity.length > 0) query += ` id<=${colorIdentity.join("")}`
  const res = await fetch(
    `https://api.scryfall.com/cards/random?q=${encodeURIComponent(query)}`,
    { cache: "no-store" }
  )
  if (!res.ok) throw new Error(`Scryfall ${res.status}`)
  return res.json() as Promise<ScryfallCard>
}

// Origin mode: commander that requires a Background enchantment.
export async function fetchRandomOriginCommander(colorIdentity: string[]): Promise<ScryfallCard> {
  let query = `is:commander o:"choose a background"`
  if (colorIdentity.length > 0) query += ` id<=${colorIdentity.join("")}`
  const res = await fetch(
    `https://api.scryfall.com/cards/random?q=${encodeURIComponent(query)}`,
    { cache: "no-store" }
  )
  if (!res.ok) throw new Error(`Scryfall ${res.status}`)
  return res.json() as Promise<ScryfallCard>
}

// Legend mode: fetches top commander IDs from our server-side proxy (uses live EDHREC data).
// Cached in module memory for the browser session to avoid redundant calls.
let _top100Cache: string[] | null = null
export async function fetchTop100Ids(): Promise<string[]> {
  if (_top100Cache) return _top100Cache
  const res = await fetch("/api/top-commanders", { cache: "no-store" })
  if (!res.ok) throw new Error("Could not load Legend commanders list")
  const data = await res.json() as { ids: string[] }
  if (!data.ids?.length) throw new Error("Empty Legend commanders list")
  _top100Cache = data.ids
  return _top100Cache
}
