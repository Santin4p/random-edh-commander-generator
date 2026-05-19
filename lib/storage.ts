import type { ScryfallCard } from "./scryfall"

const KEY = "saved_commanders"

export function getSaved(): ScryfallCard[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as ScryfallCard[]) : []
  } catch {
    return []
  }
}

export function addSaved(card: ScryfallCard): ScryfallCard[] {
  const current = getSaved()
  if (current.some((c) => c.id === card.id)) return current
  const next = [card, ...current] // newest first
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

export function removeSaved(id: string): ScryfallCard[] {
  const next = getSaved().filter((c) => c.id !== id)
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}
