"use client"

import { useState, useCallback, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"
import {
  type ScryfallCard,
  fetchRandomCommander,
  getCardImage,
  getCardOracleText,
  getEdhrecSlug,
} from "@/lib/scryfall"

// ── Types ──────────────────────────────────────────────────────────────────
type AppState = "idle" | "spinning" | "revealed"
type ColorKey = "W" | "U" | "B" | "R" | "G"

// ── Mana color tokens ──────────────────────────────────────────────────────
const MANA_COLORS: {
  key: ColorKey
  label: string
  hex: string
  glow: string
  textDark: boolean
}[] = [
  { key: "W", label: "White", hex: "#f0e8d0", glow: "rgba(240,232,208,0.6)", textDark: true },
  { key: "U", label: "Blue",  hex: "#4a90d9", glow: "rgba(74,144,217,0.6)",  textDark: false },
  { key: "B", label: "Black", hex: "#9b72d4", glow: "rgba(155,114,212,0.6)", textDark: false },
  { key: "R", label: "Red",   hex: "#e05252", glow: "rgba(224,82,82,0.6)",   textDark: false },
  { key: "G", label: "Green", hex: "#3db87a", glow: "rgba(61,184,122,0.6)",  textDark: true },
]

// ── Slot machine constants ─────────────────────────────────────────────────
const CARD_W = 260
const CARD_GAP = 14
const CARD_STEP = CARD_W + CARD_GAP
const STRIP_COUNT = 60
const WINNER_IDX = 45
const SPIN_DURATION_MS = 2800

// ─────────────────────────────────────────────────────────────────────────────
// AmbientBlob — slow floating glow behind everything
// ─────────────────────────────────────────────────────────────────────────────
function AmbientBlob({ style, delay }: { style: React.CSSProperties; delay: number }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{ filter: "blur(100px)", opacity: 0.13, ...style }}
      animate={{ x: [0, 28, -18, 0], y: [0, -22, 15, 0], scale: [1, 1.08, 0.92, 1] }}
      transition={{ duration: 16, delay, repeat: Infinity, ease: "easeInOut" }}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ManaOrb — color identity filter button; looks like a gemstone pip
// ─────────────────────────────────────────────────────────────────────────────
function ManaOrb({
  color,
  active,
  onToggle,
}: {
  color: (typeof MANA_COLORS)[0]
  active: boolean
  onToggle: () => void
}) {
  return (
    <motion.button
      onClick={onToggle}
      aria-label={`${active ? "Remove" : "Add"} ${color.label} filter`}
      aria-pressed={active}
      className="relative flex items-center justify-center rounded-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
      style={{ width: 52, height: 52 }}
      whileHover={{ scale: 1.18 }}
      whileTap={{ scale: 0.82 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
    >
      <div
        className="relative w-9 h-9 rounded-full border-2 flex items-center justify-center overflow-hidden transition-all duration-200"
        style={{
          backgroundColor: active ? color.hex : "transparent",
          borderColor: color.hex,
          boxShadow: active
            ? `0 0 16px ${color.glow}, 0 0 32px ${color.glow.replace("0.6", "0.2")}`
            : "none",
        }}
      >
        {/* Gem highlight — radial glint on active */}
        {active && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.38) 0%, transparent 55%)",
            }}
          />
        )}
        <span
          className="relative z-10 text-xs font-semibold"
          style={{
            fontFamily: "var(--font-cinzel)",
            color: active ? (color.textDark ? "#0a0a0f" : "#fff") : color.hex,
            letterSpacing: "0.05em",
          }}
        >
          {color.key}
        </span>
      </div>
      <span className="sr-only">{color.label}</span>
    </motion.button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CardBackTile — approximates the classic MTG card back in SVG
// ─────────────────────────────────────────────────────────────────────────────
function CardBackTile() {
  return (
    <div
      className="card-aspect flex-shrink-0 rounded-xl overflow-hidden"
      style={{
        width: CARD_W,
        background: "#0e0804",
        border: "2px solid #3a2208",
        padding: 5,
      }}
    >
      {/* Inner frame */}
      <div
        className="w-full h-full rounded-lg overflow-hidden relative"
        style={{ border: "1px solid #5c3a14" }}
      >
        <svg
          viewBox="0 0 100 140"
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Background */}
          <rect width="100" height="140" fill="#130b05" />

          {/* Outer rule */}
          <rect x="3" y="3" width="94" height="134" rx="2" fill="none" stroke="#4a2e0e" strokeWidth="0.5" />

          {/* Corner ornaments */}
          <path d="M3,3 h8 M3,3 v8"       stroke="#7a4e1e" strokeWidth="1" fill="none"/>
          <path d="M97,3 h-8 M97,3 v8"    stroke="#7a4e1e" strokeWidth="1" fill="none"/>
          <path d="M3,137 h8 M3,137 v-8"  stroke="#7a4e1e" strokeWidth="1" fill="none"/>
          <path d="M97,137 h-8 M97,137 v-8" stroke="#7a4e1e" strokeWidth="1" fill="none"/>

          {/* Center oval */}
          <ellipse cx="50" cy="70" rx="34" ry="46" fill="#0a0703" stroke="#6a3e14" strokeWidth="0.75" />
          <ellipse cx="50" cy="70" rx="26" ry="37" fill="none" stroke="#4a2e0e" strokeWidth="0.5" />

          {/* Diamond / Deckmaster motif */}
          <polygon
            points="50,38 70,70 50,102 30,70"
            fill="#0d0905"
            stroke="#7a5020"
            strokeWidth="0.6"
          />
          <polygon
            points="50,48 62,70 50,92 38,70"
            fill="none"
            stroke="#5a3810"
            strokeWidth="0.4"
          />

          {/* Cardinal tick marks */}
          <line x1="50" y1="24" x2="50" y2="34" stroke="#5a3810" strokeWidth="0.5"/>
          <line x1="50" y1="106" x2="50" y2="116" stroke="#5a3810" strokeWidth="0.5"/>
          <line x1="16" y1="70" x2="26" y2="70" stroke="#5a3810" strokeWidth="0.5"/>
          <line x1="74" y1="70" x2="84" y2="70" stroke="#5a3810" strokeWidth="0.5"/>

          {/* Subtle purple arcane overlay */}
          <ellipse cx="50" cy="60" rx="20" ry="16" fill="oklch(47% 0.24 292 / 0.06)" />
        </svg>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SpinButton — the centerpiece; rotating arcane ring + pulsing gold glow
// ─────────────────────────────────────────────────────────────────────────────
function SpinButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <div className="relative flex items-center justify-center">
      {/* Slow-rotating dashed arcane ring */}
      <motion.div
        className="absolute pointer-events-none"
        style={{ width: 228, height: 228 }}
        animate={{ rotate: 360 }}
        transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
      >
        <svg viewBox="0 0 228 228" className="w-full h-full">
          <circle
            cx="114" cy="114" r="110"
            fill="none"
            stroke="oklch(72% 0.115 82 / 0.22)"
            strokeWidth="1"
            strokeDasharray="5 11"
          />
          {/* Cardinal ticks */}
          <line x1="114" y1="2"   x2="114" y2="18"  stroke="oklch(72% 0.115 82 / 0.5)" strokeWidth="1.5"/>
          <line x1="114" y1="210" x2="114" y2="226" stroke="oklch(72% 0.115 82 / 0.5)" strokeWidth="1.5"/>
          <line x1="2"   y1="114" x2="18"  y2="114" stroke="oklch(72% 0.115 82 / 0.5)" strokeWidth="1.5"/>
          <line x1="210" y1="114" x2="226" y2="114" stroke="oklch(72% 0.115 82 / 0.5)" strokeWidth="1.5"/>
          {/* Diagonal marks */}
          <circle cx="114" cy="4"   r="2" fill="oklch(72% 0.115 82 / 0.4)"/>
          <circle cx="114" cy="224" r="2" fill="oklch(72% 0.115 82 / 0.4)"/>
          <circle cx="4"   cy="114" r="2" fill="oklch(72% 0.115 82 / 0.4)"/>
          <circle cx="224" cy="114" r="2" fill="oklch(72% 0.115 82 / 0.4)"/>
        </svg>
      </motion.div>

      {/* Inner pulse ring */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{ width: 186, height: 186, border: "1px solid oklch(72% 0.115 82 / 0.18)" }}
        animate={{ scale: [1, 1.1, 1], opacity: [0.18, 0.5, 0.18] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Button */}
      <motion.button
        onClick={onClick}
        disabled={disabled}
        aria-label="Spin for a random commander"
        className="glow-spin-btn relative z-10 flex flex-col items-center justify-center rounded-full cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
        style={{
          width: 156,
          height: 156,
          background: "radial-gradient(circle at 40% 35%, oklch(18% 0.03 82) 0%, oklch(10% 0.02 82) 100%)",
          border: "2px solid oklch(72% 0.115 82 / 0.6)",
        }}
        whileHover={disabled ? {} : { scale: 1.07 }}
        whileTap={disabled ? {} : { scale: 0.94 }}
        transition={{ type: "spring", stiffness: 320, damping: 18 }}
      >
        {/* Inner gem highlight */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle at 38% 30%, oklch(72% 0.115 82 / 0.12) 0%, transparent 60%)",
          }}
        />
        {/* Pentagram-ish icon — simplified */}
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="oklch(72% 0.115 82)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="relative z-10"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
        <span
          className="relative z-10 mt-2 text-sm font-semibold tracking-[0.22em] uppercase"
          style={{ fontFamily: "var(--font-cinzel)", color: "oklch(72% 0.115 82)" }}
        >
          Spin
        </span>
      </motion.button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SlotMachine — the roulette drum
// ─────────────────────────────────────────────────────────────────────────────
function SlotMachine() {
  const cardHeight = Math.round(CARD_W * (7 / 5))

  return (
    <div className="relative w-full overflow-hidden" style={{ height: cardHeight + 24 }}>
      {/* Edge fades */}
      {(["left", "right"] as const).map((side) => (
        <div
          key={side}
          className="absolute inset-y-0 z-10 w-32 pointer-events-none"
          style={{
            [side]: 0,
            background: `linear-gradient(to ${side === "left" ? "right" : "left"}, oklch(7.5% 0.009 285) 0%, transparent 100%)`,
          }}
        />
      ))}

      {/* Center highlight window */}
      <div
        className="absolute inset-y-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none rounded-xl"
        style={{
          width: CARD_W + 12,
          border: "1.5px solid oklch(72% 0.115 82 / 0.45)",
          boxShadow: "0 0 32px oklch(72% 0.115 82 / 0.12), inset 0 0 16px oklch(72% 0.115 82 / 0.04)",
        }}
      />

      {/* Card strip */}
      <motion.div
        className="absolute flex items-center py-3"
        style={{ left: `calc(50% - ${CARD_W / 2}px)`, gap: CARD_GAP }}
        initial={{ x: -(5 * CARD_STEP) }}
        animate={{ x: -(WINNER_IDX * CARD_STEP) }}
        transition={{ duration: 2.6, ease: [0.12, 0.88, 0.28, 1.0] }}
      >
        {Array.from({ length: STRIP_COUNT }, (_, i) => (
          <CardBackTile key={i} />
        ))}
      </motion.div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// getCommanderTags — derive EDHREC-style playstyle tags from oracle text
// ─────────────────────────────────────────────────────────────────────────────
function getCommanderTags(card: ScryfallCard): string[] {
  const text = getCardOracleText(card).toLowerCase()
  const tags: string[] = []

  if (/create.{0,60}token|populate/.test(text))                              tags.push("Tokens")
  if (tags.includes("Tokens") && /whenever.{0,60}attacks/.test(text))        tags.push("Go Wide")
  if (/\+1\/\+1 counter/.test(text))                                         tags.push("+1/+1 Counters")
  if (/\bproliferate\b/.test(text))                                           tags.push("Proliferate")
  if (/draw (a|\d+) card/.test(text))                                         tags.push("Card Draw")
  if (/search your library.{0,80}land|land.{0,80}onto the battlefield/.test(text)) tags.push("Ramp")
  if (/whenever.{0,60}attacks|double strike|first strike and/.test(text))     tags.push("Aggro")
  if (/\bequipment\b.{0,60}\bequip\b|\bequip\b.{0,60}\bequipment\b/.test(text)) tags.push("Voltron")
  if (/return.{0,60}from.{0,30}graveyard|graveyard.{0,60}onto the battlefield/.test(text)) tags.push("Reanimator")
  if (/whenever.{0,60}dies.{0,60}(lose|gain)|sacrifice.{0,60}(draw|gain|lose)/.test(text)) tags.push("Aristocrats")
  if (/whenever you cast an instant or sorcery|magecraft|\bstorm\b/.test(text)) tags.push("Spellslinger")
  if (/gain.{0,30}life/.test(text))                                           tags.push("Lifegain")
  if (/\binfect\b|\bpoison counter\b/.test(text))                             tags.push("Infect")
  if (/copy.{0,40}(instant|sorcery|spell)/.test(text))                        tags.push("Spellcopy")
  if (/\bpartner\b/.test(text))                                                tags.push("Partner")
  if (/\bbackground\b/.test(text))                                             tags.push("Background")

  // Tribal — "whenever another/a [TYPE] you control/enters/dies"
  const tribal = text.match(/whenever (?:another |a )(\w+) (?:you control |enters|dies|attacks)/)
  if (tribal) {
    const t = tribal[1]
    const skip = new Set(["creature","permanent","land","artifact","enchantment","planeswalker","nontoken","nonland","player","opponent"])
    if (!skip.has(t) && t.length > 2) tags.push(`${t[0].toUpperCase()}${t.slice(1)} Tribal`)
  }

  return [...new Set(tags)].slice(0, 5)
}

// ─────────────────────────────────────────────────────────────────────────────
// CommanderReveal — the card appears; the hero of the whole experience
// ─────────────────────────────────────────────────────────────────────────────
function CommanderReveal({
  commander,
  onSave,
  onSpinAgain,
  isSaved,
}: {
  commander: ScryfallCard
  onSave: () => void
  onSpinAgain: () => void
  isSaved: boolean
}) {
  const image = getCardImage(commander)
  const oracleText = getCardOracleText(commander)
  const edhrecSlug = getEdhrecSlug(commander)
  const colorBadges = MANA_COLORS.filter((c) => commander.color_identity.includes(c.key))

  // Start with oracle-derived tags immediately; replace with EDHREC tags when they arrive
  const [tags, setTags] = useState<string[]>(() => getCommanderTags(commander))

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)

    fetch(`/api/tags?slug=${encodeURIComponent(edhrecSlug)}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: unknown) => {
        if (
          !cancelled &&
          data !== null &&
          typeof data === "object" &&
          "tags" in data &&
          Array.isArray((data as { tags: unknown }).tags) &&
          ((data as { tags: string[] }).tags).length > 0
        ) {
          setTags((data as { tags: string[] }).tags)
        }
      })
      .catch(() => {}) // keep oracle tags on any failure
      .finally(() => clearTimeout(timeout))

    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(timeout)
    }
  }, [edhrecSlug])

  return (
    <motion.div
      className="flex flex-col lg:flex-row-reverse gap-6 lg:gap-10 w-full max-w-sm lg:max-w-5xl mx-auto px-4 lg:px-10 lg:items-center"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* ── Card image — top on mobile, RIGHT on desktop ── */}
      <div className="relative w-full lg:w-[54%] flex-shrink-0">
        <div
          className="reveal-flash absolute inset-0 rounded-2xl pointer-events-none z-10"
          style={{
            background: "radial-gradient(circle at 50% 40%, oklch(72% 0.115 82 / 0.55) 0%, transparent 65%)",
          }}
        />
        <motion.div
          className="w-full rounded-2xl overflow-hidden"
          initial={{ boxShadow: "0 0 0px oklch(72% 0.115 82 / 0)" }}
          animate={{
            boxShadow: "0 0 100px oklch(72% 0.115 82 / 0.38), 0 0 200px oklch(47% 0.24 292 / 0.2)",
          }}
          transition={{ duration: 1.1, delay: 0.15, ease: "easeOut" }}
        >
          <Image
            src={image}
            alt={commander.name}
            width={480}
            height={672}
            className="w-full h-auto"
            priority
          />
        </motion.div>
      </div>

      {/* ── Info column — bottom on mobile, LEFT on desktop ── */}
      <div className="w-full lg:w-[46%] flex flex-col gap-4">
        {/* Commander name */}
        <motion.h2
          className="text-2xl lg:text-3xl font-black leading-snug"
          style={{
            fontFamily: "var(--font-cinzel)",
            color: "oklch(72% 0.115 82)",
            textShadow: "0 0 40px oklch(72% 0.115 82 / 0.3)",
          }}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.28, duration: 0.5 }}
        >
          {commander.name}
        </motion.h2>

        {/* Color identity badges */}
        {colorBadges.length > 0 && (
          <motion.div
            className="flex gap-2"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.38, type: "spring", stiffness: 280, damping: 18 }}
          >
            {colorBadges.map((c) => (
              <div
                key={c.key}
                className="relative w-7 h-7 rounded-full border-2 flex items-center justify-center overflow-hidden"
                style={{
                  backgroundColor: c.hex,
                  borderColor: c.hex,
                  boxShadow: `0 0 12px ${c.glow}`,
                }}
                title={c.label}
              >
                <div
                  className="absolute inset-0 rounded-full"
                  style={{ background: "radial-gradient(circle at 35% 28%, rgba(255,255,255,0.35) 0%, transparent 55%)" }}
                />
                <span
                  className="relative z-10"
                  style={{ fontFamily: "var(--font-cinzel)", color: c.textDark ? "#0a0a0f" : "#fff", fontSize: "0.65rem" }}
                >
                  {c.key}
                </span>
              </div>
            ))}
          </motion.div>
        )}

        {/* Playstyle tags — oracle-derived initially, replaced by EDHREC when ready */}
        {tags.length > 0 && (
          <motion.div
            key={tags.join(",")}
            className="flex flex-wrap gap-2"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.46 }}
          >
            {tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 rounded-full text-xs font-semibold tracking-wide"
                style={{
                  background: "oklch(72% 0.115 82 / 0.09)",
                  border: "1px solid oklch(72% 0.115 82 / 0.25)",
                  color: "oklch(65% 0.09 82)",
                  fontFamily: "var(--font-raleway)",
                }}
              >
                {tag}
              </span>
            ))}
          </motion.div>
        )}

        {/* Oracle text */}
        {oracleText && (
          <motion.div
            className="rounded-xl p-4 text-sm leading-relaxed whitespace-pre-line"
            style={{
              background: "oklch(11% 0.009 285)",
              border: "1px solid oklch(100% 0 0 / 0.07)",
              color: "oklch(62% 0.01 285)",
              fontFamily: "var(--font-raleway)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.52 }}
          >
            {oracleText}
          </motion.div>
        )}

        {/* Action buttons */}
        <motion.div
          className="flex gap-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <button
            onClick={onSave}
            className="flex-1 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
            style={{
              background: isSaved ? "oklch(72% 0.115 82 / 0.18)" : "oklch(72% 0.115 82 / 0.08)",
              border: `1px solid oklch(72% 0.115 82 / ${isSaved ? "0.55" : "0.28"})`,
              color: "oklch(72% 0.115 82)",
              fontFamily: "var(--font-raleway)",
            }}
          >
            {isSaved ? "✓ Saved" : "Save"}
          </button>
          <button
            onClick={onSpinAgain}
            className="flex-1 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40"
            style={{
              background: "oklch(47% 0.24 292 / 0.1)",
              border: "1px solid oklch(47% 0.24 292 / 0.32)",
              color: "oklch(72% 0.18 295)",
              fontFamily: "var(--font-raleway)",
            }}
          >
            Spin Again
          </button>
        </motion.div>

        {/* External links */}
        <motion.div
          className="flex gap-5 text-xs"
          style={{ color: "oklch(42% 0.006 285)", fontFamily: "var(--font-raleway)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          <a
            href={`https://edhrec.com/commanders/${edhrecSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-1 rounded"
          >
            EDHREC ↗
          </a>
          <a
            href={commander.scryfall_uri}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-1 rounded"
          >
            Scryfall ↗
          </a>
        </motion.div>
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page — state machine: idle → spinning → revealed
// ─────────────────────────────────────────────────────────────────────────────
export default function Page() {
  const [appState, setAppState] = useState<AppState>("idle")
  const [selectedColors, setSelectedColors] = useState<Set<ColorKey>>(new Set())
  const [commander, setCommander] = useState<ScryfallCard | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)

  const toggleColor = useCallback((key: ColorKey) => {
    setSelectedColors((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  const handleSpin = useCallback(async () => {
    if (appState !== "idle") return
    setIsSaved(false)
    setFetchError(null)
    setCommander(null)
    setAppState("spinning")

    const colors = Array.from(selectedColors)
    const [card] = await Promise.allSettled([
      fetchRandomCommander(colors),
      new Promise((r) => setTimeout(r, SPIN_DURATION_MS)),
    ])

    if (card.status === "fulfilled") {
      setCommander(card.value)
      setAppState("revealed")
    } else {
      setFetchError("Could not reach Scryfall. Check your connection and try again.")
      setAppState("idle")
    }
  }, [appState, selectedColors])

  const handleSpinAgain = useCallback(() => {
    setAppState("idle")
    setCommander(null)
    setIsSaved(false)
    setFetchError(null)
  }, [])

  const handleSave = useCallback(() => {
    setIsSaved(true)
  }, [])

  return (
    <main className="relative min-h-dvh flex flex-col overflow-hidden">
      {/* ── Background blobs ── */}
      <div className="fixed inset-0 -z-10" aria-hidden="true">
        <AmbientBlob style={{ left: "6%",  top: "10%",    width: 480, height: 480, background: "oklch(47% 0.24 292)" }} delay={0} />
        <AmbientBlob style={{ right: "4%", top: "26%",    width: 360, height: 360, background: "oklch(72% 0.115 82)" }} delay={5} />
        <AmbientBlob style={{ left: "20%", bottom: "6%",  width: 400, height: 400, background: "oklch(42% 0.18 242)" }} delay={9} />
      </div>

      {/* ── Header ── */}
      <header className="pt-12 pb-5 px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1
            className="text-3xl sm:text-4xl font-black tracking-wide uppercase leading-none"
            style={{ fontFamily: "var(--font-cinzel)", color: "oklch(72% 0.115 82)" }}
          >
            Random EDH
          </h1>
          <p
            className="mt-1 text-sm sm:text-base font-semibold tracking-[0.18em] uppercase"
            style={{ fontFamily: "var(--font-cinzel)", color: "oklch(50% 0.08 82)" }}
          >
            Commander Generator
          </p>
        </motion.div>

        {/* Decorative rule */}
        <motion.div
          className="mt-4 flex items-center justify-center gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="h-px w-12 bg-gradient-to-r from-transparent to-amber-700/40" />
          <span style={{ color: "oklch(38% 0.006 285)", fontSize: "0.6rem", letterSpacing: "0.3em", fontFamily: "var(--font-raleway)" }}>
            SPIN · DISCOVER · BUILD
          </span>
          <div className="h-px w-12 bg-gradient-to-l from-transparent to-amber-700/40" />
        </motion.div>

        {/* WUBRG filter */}
        <motion.div
          className="mt-5 flex justify-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.44 }}
          role="group"
          aria-label="Filter commanders by color identity"
        >
          {MANA_COLORS.map((c) => (
            <ManaOrb
              key={c.key}
              color={c}
              active={selectedColors.has(c.key)}
              onToggle={() => toggleColor(c.key)}
            />
          ))}
        </motion.div>

        <AnimatePresence>
          {selectedColors.size > 0 && (
            <motion.p
              className="mt-2 text-xs tracking-wide"
              style={{ color: "oklch(45% 0.006 285)", fontFamily: "var(--font-raleway)" }}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              {selectedColors.size === 5
                ? "Any color identity"
                : `${selectedColors.size} color${selectedColors.size > 1 ? "s" : ""} selected`}
            </motion.p>
          )}
        </AnimatePresence>
      </header>

      {/* ── Center — state machine ── */}
      <div className="flex-1 flex flex-col items-center justify-center py-8 px-4">
        <AnimatePresence mode="wait">
          {appState === "idle" && (
            <motion.div
              key="idle"
              className="flex flex-col items-center gap-10"
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.88 }}
              transition={{ duration: 0.35 }}
            >
              <SpinButton onClick={handleSpin} disabled={false} />
              {fetchError ? (
                <p
                  className="text-xs text-center max-w-[240px]"
                  style={{ color: "oklch(60% 0.18 25)", fontFamily: "var(--font-raleway)" }}
                >
                  {fetchError}
                </p>
              ) : (
                <p
                  className="text-xs text-center max-w-[200px] tracking-wide"
                  style={{ color: "oklch(32% 0.006 285)", fontFamily: "var(--font-raleway)" }}
                >
                  Press to summon a random commander from the multiverse
                </p>
              )}
            </motion.div>
          )}

          {appState === "spinning" && (
            <motion.div
              key="spinning"
              className="w-full flex flex-col items-center gap-7"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <p
                className="summoning-text text-xs tracking-[0.3em] uppercase"
                style={{ fontFamily: "var(--font-cinzel)", color: "oklch(50% 0.08 82)" }}
              >
                Summoning
              </p>
              <SlotMachine />
            </motion.div>
          )}

          {appState === "revealed" && commander && (
            <motion.div
              key="revealed"
              className="w-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
            >
              <CommanderReveal
                commander={commander}
                onSave={handleSave}
                onSpinAgain={handleSpinAgain}
                isSaved={isSaved}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Footer ── */}
      <footer
        className="py-5 text-center text-xs tracking-wide"
        style={{ color: "oklch(32% 0.005 285)", fontFamily: "var(--font-raleway)" }}
      >
        Not affiliated with Wizards of the Coast · Card data from{" "}
        <a
          href="https://scryfall.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:opacity-80 transition-opacity"
        >
          Scryfall
        </a>
      </footer>
    </main>
  )
}
