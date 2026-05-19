import type { ScryfallCard } from "./scryfall"

export type CommanderEntry = {
  commander: ScryfallCard
  partner: ScryfallCard | null
}

const KEY = "saved_commanders"

// Migrate old format (plain ScryfallCard[]) to CommanderEntry[]
function migrate(raw: unknown[]): CommanderEntry[] {
  return raw.map((item) => {
    if (item && typeof item === "object" && "commander" in item)
      return item as CommanderEntry
    return { commander: item as ScryfallCard, partner: null }
  })
}

export function getSaved(): CommanderEntry[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? migrate(JSON.parse(raw) as unknown[]) : []
  } catch {
    return []
  }
}

export function addSaved(entry: CommanderEntry): CommanderEntry[] {
  const current = getSaved()
  if (current.some((e) => e.commander.id === entry.commander.id)) return current
  const next = [entry, ...current]
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

export function removeSaved(id: string): CommanderEntry[] {
  const next = getSaved().filter((e) => e.commander.id !== id)
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}
