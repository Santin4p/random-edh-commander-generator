"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { motion, AnimatePresence, useAnimate } from "framer-motion"
import Image from "next/image"
import {
  type ScryfallCard,
  type ScryfallPrinting,
  fetchRandomCommander,
  fetchRandomDuoCommander,
  fetchRandomOriginCommander,
  fetchCommanderById,
  fetchRandomPartner,
  fetchRandomFriendsForeverPartner,
  fetchRandomDoctor,
  fetchRandomCharacterSelectPartner,
  fetchRandomSurvivorPartner,
  fetchRandomFatherSonPartner,
  fetchRandomBackground,
  fetchCardPrintings,
  getCardImage,
  getCardOracleText,
  getEdhrecSlug,
} from "@/lib/scryfall"
import { type CommanderEntry, getSaved, addSaved, removeSaved } from "@/lib/storage"

// URLs of card images that have already loaded this session — prevents skeleton flash on revisit
const _loadedImageUrls = new Set<string>()

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

// ── Rarity tiers (by EDHREC rank) ─────────────────────────────────────────
type RarityTier = "diamond" | "legendary" | "epic" | "rare" | "common"

const RARITY: Record<RarityTier, { label: string; color: string; rgb: string }> = {
  diamond:   { label: "Diamond",   color: "oklch(85% 0.10 200)", rgb: "130,210,242" },
  legendary: { label: "Legendary", color: "oklch(72% 0.115 82)",  rgb: "212,175,55"  },
  epic:      { label: "Epic",      color: "oklch(72% 0.18 295)",  rgb: "155,89,220"  },
  rare:      { label: "Rare",      color: "oklch(65% 0.15 240)",  rgb: "80,140,220"  },
  common:    { label: "Common",    color: "oklch(52% 0.01 285)",  rgb: "130,130,140" },
}

const RARITY_RANKS: Record<RarityTier, string> = {
  diamond:   "EDHREC Top 10",
  legendary: "Top 11–50",
  epic:      "Top 51–100",
  rare:      "Top 101–500",
  common:    "Rank 500+",
}

function getRarityTier(rank: number | null): RarityTier {
  if (rank === null) return "common"
  if (rank <= 10)  return "diamond"
  if (rank <= 50)  return "legendary"
  if (rank <= 100) return "epic"
  if (rank <= 500) return "rare"
  return "common"
}

// ── Color identity theme ───────────────────────────────────────────────────
const COLOR_HUES:    Record<ColorKey, number> = { W: 82,  U: 240, B: 292, R: 28,  G: 145 }
const COLOR_CHROMAS: Record<ColorKey, number> = { W: 0.06, U: 0.20, B: 0.14, R: 0.22, G: 0.18 }
const WUBRG_ORDER = ["W", "U", "B", "R", "G"] as const

const COLOR_COMBO_NAMES: Record<string, string> = {
  W: "Mono White", U: "Mono Blue", B: "Mono Black", R: "Mono Red", G: "Mono Green",
  WU: "Azorius",  WB: "Orzhov",  WR: "Boros",  WG: "Selesnya",
  UB: "Dimir",   UR: "Izzet",   UG: "Simic",
  BR: "Rakdos",  BG: "Golgari", RG: "Gruul",
  WUB: "Esper",  WUR: "Jeskai", WUG: "Bant",
  WBR: "Mardu",  WBG: "Abzan",  WRG: "Naya",
  UBR: "Grixis", UBG: "Sultai", URG: "Temur", BRG: "Jund",
  WUBR: "Non-Green", WUBG: "Non-Red", WURG: "Non-Black", WBRG: "Non-Blue", UBRG: "Non-White",
  WUBRG: "Five Color",
}

function normalizeColorKey(colors: string[]): string {
  return WUBRG_ORDER.filter((c) => colors.includes(c)).join("")
}

function getColorComboName(colors: string[]): string {
  return COLOR_COMBO_NAMES[normalizeColorKey(colors)] ?? normalizeColorKey(colors)
}

function getColorTheme(keys: ColorKey[]): { blobs: [string, string, string]; overlay: string } {
  if (keys.length === 0 || keys.length === 5) {
    return {
      blobs: ["oklch(47% 0.24 292)", "oklch(72% 0.115 82)", "oklch(42% 0.18 242)"],
      overlay: "none",
    }
  }
  const n = keys.length
  const sinM = keys.reduce((s, k) => s + Math.sin((COLOR_HUES[k] * Math.PI) / 180), 0) / n
  const cosM = keys.reduce((s, k) => s + Math.cos((COLOR_HUES[k] * Math.PI) / 180), 0) / n
  const hue = ((Math.atan2(sinM, cosM) * 180) / Math.PI + 360) % 360
  const chr = keys.reduce((s, k) => s + COLOR_CHROMAS[k], 0) / n
  const h0 = hue.toFixed(1), h1 = ((hue + 28) % 360).toFixed(1), h2 = ((hue - 18 + 360) % 360).toFixed(1)
  const c0 = chr.toFixed(3), c1 = (chr * 0.82).toFixed(3), c2 = (chr * 0.65).toFixed(3)
  return {
    blobs: [`oklch(42% ${c0} ${h0})`, `oklch(36% ${c1} ${h1})`, `oklch(50% ${c2} ${h2})`],
    overlay: `radial-gradient(ellipse at 50% 0%, oklch(44% ${(chr * 0.7).toFixed(3)} ${h0} / 0.11) 0%, transparent 65%)`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AmbientBlob — slow floating glow behind everything
// ─────────────────────────────────────────────────────────────────────────────
function AmbientBlob({ color, style, delay }: { color: string; style: React.CSSProperties; delay: number }) {
  return (
    <motion.div
      className="ambient-blob absolute rounded-full pointer-events-none"
      style={{ opacity: 0.13, background: color, transition: "background 1.4s ease", ...style }}
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
  color: { key: string; label: string; hex: string; glow: string; textDark: boolean }
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
            color: active ? (color.textDark ? "oklch(8% 0.009 285)" : "oklch(97% 0.005 285)") : color.hex,
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
// VerticalMiniSlot — vertical card-back carousel for partner / background reveal
// ─────────────────────────────────────────────────────────────────────────────
// Carousel tiles stay compact; result card expands to RESULT_W for readability
const MINI_W = 90
const MINI_H = Math.round(MINI_W * (7 / 5))
const MINI_GAP = 8
const MINI_STEP = MINI_H + MINI_GAP
const MINI_STRIP = 16
const MINI_WINNER = 12
const RESULT_W = 160
const RESULT_H = Math.round(RESULT_W * (7 / 5))

function VerticalMiniSlot({
  spinning,
  result,
  label,
  fullWidth = false,
}: {
  spinning: boolean
  result: ScryfallCard | null
  label: string
  fullWidth?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p
        className="text-[0.58rem] tracking-[0.22em] uppercase"
        style={{ color: "oklch(42% 0.006 285)", fontFamily: "var(--font-raleway)" }}
      >
        {label}
      </p>

      <AnimatePresence mode="wait">
        {!result ? (
          /* ── Spinning carousel ── */
          <motion.div
            key="carousel"
            className="relative overflow-hidden rounded-xl"
            style={{
              width: MINI_W,
              height: MINI_H + 16,
              border: "1px solid oklch(100% 0 0 / 0.08)",
              background: "oklch(8% 0.009 285)",
            }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
          >
            {(["top", "bottom"] as const).map((side) => (
              <div
                key={side}
                className="absolute left-0 right-0 z-10 pointer-events-none"
                style={{
                  [side]: 0,
                  height: 28,
                  background: `linear-gradient(to ${side === "top" ? "bottom" : "top"}, oklch(8% 0.009 285) 0%, transparent 100%)`,
                }}
              />
            ))}
            <motion.div
              className="absolute flex flex-col items-center"
              style={{ top: 8, left: 0, right: 0, gap: MINI_GAP }}
              initial={{ y: -(3 * MINI_STEP) }}
              animate={spinning ? { y: -(MINI_WINNER * MINI_STEP) } : { y: -(3 * MINI_STEP) }}
              transition={{ duration: 1.8, ease: [0.12, 0.88, 0.28, 1.0] }}
            >
              {Array.from({ length: MINI_STRIP }, (_, i) => (
                <div key={i} className="flex-shrink-0 rounded-lg overflow-hidden" style={{ width: MINI_W, height: MINI_H }}>
                  <Image
                    src="https://cards.scryfall.io/back.png"
                    alt="card back"
                    width={MINI_W}
                    height={MINI_H}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                </div>
              ))}
            </motion.div>
          </motion.div>
        ) : (
          /* ── Result — expands to RESULT_W ── */
          <motion.div
            key="result"
            className="flex flex-col items-center gap-2"
            initial={{ opacity: 0, scale: 0.85, rotateY: -90 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            style={{ perspective: 800 }}
          >
            <motion.div
              className="rounded-2xl overflow-hidden"
              animate={{
                boxShadow: "0 0 40px oklch(72% 0.115 82 / 0.22), 0 0 80px oklch(72% 0.115 82 / 0.08)",
              }}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              <Image
                src={getCardImage(result)}
                alt={result.name}
                width={fullWidth ? 480 : RESULT_W}
                height={fullWidth ? 672 : RESULT_H}
                className={fullWidth ? "w-full h-auto block" : "block"}
              />
            </motion.div>
            <div className="text-center" style={fullWidth ? undefined : { maxWidth: RESULT_W }}>
              <p
                className="text-xs font-semibold leading-snug"
                style={{ fontFamily: "var(--font-cinzel)", color: "oklch(72% 0.115 82)" }}
              >
                {result.name}
              </p>
              <div className="flex justify-center gap-3 mt-1">
                <a
                  href={`https://edhrec.com/commanders/${getEdhrecSlug(result)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-[0.62rem] hover:opacity-80"
                  style={{ color: "oklch(50% 0.006 285)", fontFamily: "var(--font-raleway)" }}
                >
                  EDHREC ↗
                </a>
                <a
                  href={result.scryfall_uri}
                  target="_blank" rel="noopener noreferrer"
                  className="text-[0.62rem] hover:opacity-80"
                  style={{ color: "oklch(50% 0.006 285)", fontFamily: "var(--font-raleway)" }}
                >
                  Scryfall ↗
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CardBackTile — official MTG card back image
// ─────────────────────────────────────────────────────────────────────────────
function CardBackTile() {
  return (
    <div className="flex-shrink-0 rounded-xl overflow-hidden" style={{ width: CARD_W }}>
      <Image
        src="https://cards.scryfall.io/back.png"
        alt="MTG card back"
        width={CARD_W}
        height={Math.round(CARD_W * (7 / 5))}
        className="w-full h-auto block"
      />
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
// SpinGlow — full-screen omnidirectional rarity glow; lives in the bg layer
// so it escapes every overflow-hidden and spreads in all directions
// ─────────────────────────────────────────────────────────────────────────────
function SpinGlow({ rgb }: { rgb: string }) {
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.38 }}
    >
      {/* Outer sphere — wide soft halo, rises from the start */}
      <motion.div
        className="absolute"
        style={{ left: "50%", top: "52%", transform: "translate(-50%, -50%)", width: "180vw", height: "180vh" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.5, 0.85, 1] }}
        transition={{ duration: 2.3, ease: [0.08, 0, 0.5, 1], times: [0, 0.22, 0.62, 1] }}
      >
        <div
          className="w-full h-full rounded-full"
          style={{
            background: `radial-gradient(ellipse at center, rgba(${rgb}, 0.22) 0%, rgba(${rgb}, 0.10) 28%, rgba(${rgb}, 0.04) 52%, transparent 70%)`,
            transition: "background 1.1s ease",
          }}
        />
      </motion.div>

      {/* Mid sphere — concentrated, erupts in the final stretch */}
      <motion.div
        className="absolute"
        style={{ left: "50%", top: "52%", transform: "translate(-50%, -50%)", width: "110vw", height: "110vh" }}
        initial={{ opacity: 0, scale: 0.35 }}
        animate={{ opacity: [0, 0, 0.28, 0.88, 1], scale: [0.35, 0.5, 0.78, 1, 1] }}
        transition={{ duration: 2.55, ease: [0.08, 0, 0.28, 1], times: [0, 0.15, 0.46, 0.82, 1] }}
      >
        <div
          className="w-full h-full rounded-full"
          style={{
            background: `radial-gradient(ellipse at center, rgba(${rgb}, 0.70) 0%, rgba(${rgb}, 0.32) 18%, rgba(${rgb}, 0.11) 40%, transparent 58%)`,
            transition: "background 0.9s ease",
          }}
        />
      </motion.div>

      {/* Flash burst — sharp peak the instant the cards lock */}
      <motion.div
        className="absolute"
        style={{ left: "50%", top: "52%", transform: "translate(-50%, -50%)", width: "70vw", height: "70vh" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 0, 1, 0.32] }}
        transition={{ duration: 2.8, ease: "easeOut", times: [0, 0.57, 0.75, 0.88, 1] }}
      >
        <div
          className="w-full h-full rounded-full"
          style={{
            background: `radial-gradient(ellipse at center, rgba(${rgb}, 1.0) 0%, rgba(${rgb}, 0.48) 14%, transparent 42%)`,
            transition: "background 0.4s ease",
          }}
        />
      </motion.div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SlotMachine — the roulette drum (glow is handled by SpinGlow in bg layer)
// ─────────────────────────────────────────────────────────────────────────────
function SlotMachine({ rarity }: { rarity?: RarityTier | null }) {
  const cardHeight = Math.round(CARD_W * (7 / 5))
  // Neutral when rarity unknown; shifts to rarity color via CSS transition in SpinGlow
  const rgb = rarity ? RARITY[rarity].rgb : "210,215,235"

  return (
    <div className="relative w-full overflow-hidden" style={{ height: cardHeight + 24 }}>
      {/* Edge fades */}
      {(["left", "right"] as const).map((side) => (
        <div
          key={side}
          className="absolute inset-y-0 z-10 w-40 pointer-events-none"
          style={{
            [side]: 0,
            background: `linear-gradient(to ${side === "left" ? "right" : "left"}, oklch(7.5% 0.009 285) 0%, transparent 100%)`,
          }}
        />
      ))}

      {/* Center highlight window — frame glow synced to the spin timeline */}
      <motion.div
        className="absolute inset-y-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none rounded-xl"
        style={{
          width: CARD_W + 12,
          borderWidth: "1.5px",
          borderStyle: "solid",
          borderColor: `rgba(${rgb}, 0.75)`,
          transition: "border-color 0.9s ease",
        }}
        animate={{
          boxShadow: [
            `0 0 4px rgba(${rgb}, 0.04)`,
            `0 0 50px rgba(${rgb}, 0.45), 0 0 100px rgba(${rgb}, 0.20), inset 0 0 28px rgba(${rgb}, 0.09)`,
            `0 0 130px rgba(${rgb}, 1.0), 0 0 260px rgba(${rgb}, 0.50), 0 0 400px rgba(${rgb}, 0.24), inset 0 0 110px rgba(${rgb}, 0.30)`,
            `0 0 85px rgba(${rgb}, 0.68), 0 0 170px rgba(${rgb}, 0.34), 0 0 280px rgba(${rgb}, 0.15), inset 0 0 70px rgba(${rgb}, 0.18)`,
          ],
        }}
        transition={{ duration: 2.6, ease: [0.12, 0.88, 0.28, 1.0], times: [0, 0.44, 0.87, 1] }}
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
// getPartnerType — detect partner mechanic variant from oracle text
// ─────────────────────────────────────────────────────────────────────────────
type PartnerVariant =
  | { type: "generic" }
  | { type: "with"; name: string }
  | { type: "background" }
  | { type: "friends-forever" }
  | { type: "doctors-companion" }
  | { type: "character-select" }
  | { type: "survivors" }
  | { type: "father-son" }

function getPartnerType(card: ScryfallCard): PartnerVariant | null {
  const text = getCardOracleText(card).toLowerCase()
  const withMatch = text.match(/partner with ([^\n(]+)/)
  if (withMatch) return { type: "with", name: withMatch[1].trim().replace(/\.$/, "") }
  if (/choose a background/.test(text)) return { type: "background" }
  if (/friends forever/.test(text)) return { type: "friends-forever" }
  if (/doctor.s companion/.test(text)) return { type: "doctors-companion" }
  if (/character select/.test(text)) return { type: "character-select" }
  if (/partner.survivors/.test(text)) return { type: "survivors" }
  if (/father & son/.test(text)) return { type: "father-son" }
  if (/\bpartner\b/.test(text)) return { type: "generic" }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// ArtStrip — always-visible row of art thumbnails; no text, purely visual
// ─────────────────────────────────────────────────────────────────────────────
function ArtStrip({
  printings,
  currentId,
  onSelect,
}: {
  printings: ScryfallPrinting[]
  currentId: string
  onSelect: (p: ScryfallPrinting) => void
}) {
  if (printings.length < 2) return null

  return (
    <motion.div
      className="flex items-center gap-2 mt-3"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.35 }}
    >
      {/* Layers icon — indicates "multiple versions" */}
      <svg
        width="13" height="13" viewBox="0 0 24 24"
        fill="none" stroke="oklch(50% 0.08 82 / 0.65)" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"
        className="flex-shrink-0"
        aria-hidden="true"
      >
        <polygon points="12 2 2 7 12 12 22 7 12 2"/>
        <polyline points="2 17 12 22 22 17"/>
        <polyline points="2 12 12 17 22 12"/>
      </svg>

      <div
        className="flex gap-1.5 overflow-x-auto pb-0.5"
        style={{ scrollbarWidth: "none" }}
        role="group"
        aria-label="Select alternate art"
      >
        {printings.map((p) => {
          const img = getCardImage(p)
          const isSelected = p.id === currentId
          const isSLD = p.set === "sld"

          return (
            <motion.button
              key={p.id}
              onClick={() => onSelect(p)}
              title={`${p.artist ?? "Unknown"}${isSLD ? " · Secret Lair" : ""}`}
              aria-pressed={isSelected}
              className="relative flex-shrink-0 rounded-lg overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/50"
              style={{
                width: 58,
                border: `2px solid ${isSelected ? "oklch(72% 0.115 82)" : "oklch(100% 0 0 / 0.1)"}`,
                boxShadow: isSelected ? "0 0 12px oklch(72% 0.115 82 / 0.4)" : "none",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
              whileHover={{ scale: 1.12, y: -3 }}
              whileTap={{ scale: 0.94 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
            >
              {img ? (
                <Image
                  src={img}
                  alt={p.artist ? `Art by ${p.artist}` : "Alternate card art"}
                  width={58}
                  height={81}
                  className="w-full h-auto block"
                />
              ) : (
                <div className="w-full card-aspect" style={{ background: "oklch(11% 0.009 285)" }} />
              )}

              {isSLD && (
                <div
                  className="absolute top-0.5 right-0.5 leading-none font-black rounded px-0.5"
                  style={{
                    fontSize: "0.42rem",
                    background: "oklch(72% 0.115 82)",
                    color: "oklch(10% 0.02 82)",
                    fontFamily: "var(--font-cinzel)",
                    paddingTop: "1px",
                    paddingBottom: "1px",
                  }}
                >
                  SL
                </div>
              )}
            </motion.button>
          )
        })}
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CommanderReveal — the card appears; the hero of the whole experience
// ─────────────────────────────────────────────────────────────────────────────
function CommanderReveal({
  commander,
  onSave,
  onSpinAgain,
  isSaved,
  initialRarity,
  colorIdentity,
  partnerCard,
  onPartnerChange,
}: {
  commander: ScryfallCard
  onSave: () => void
  onSpinAgain: () => void
  isSaved: boolean
  initialRarity?: RarityTier | null
  colorIdentity: string[]
  partnerCard: ScryfallCard | null
  onPartnerChange: (card: ScryfallCard | null) => void
}) {
  const oracleText = getCardOracleText(commander)
  const edhrecSlug = getEdhrecSlug(commander)
  const colorBadges = MANA_COLORS.filter((c) => commander.color_identity.includes(c.key))
  const isDoubleFaced = !!commander.card_faces?.[1]?.image_uris

  // ── Rarity (seeded from pre-spin fetch, confirmed by tags fetch) ──
  const [rarity, setRarity] = useState<RarityTier | null>(initialRarity ?? null)
  const [edhrecRank, setEdhrecRank] = useState<number | null>(null)

  // ── EDHREC tags + rank ──
  const [tags, setTags] = useState<string[]>(() => getCommanderTags(commander))
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    fetch(`/api/tags?slug=${encodeURIComponent(edhrecSlug)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: unknown) => {
        if (cancelled) return
        if (
          data !== null && typeof data === "object" &&
          "tags" in data && Array.isArray((data as { tags: unknown }).tags) &&
          (data as { tags: string[] }).tags.length > 0
        ) setTags((data as { tags: string[] }).tags)
        if (
          data !== null && typeof data === "object" &&
          "rank" in data && typeof (data as { rank: unknown }).rank === "number"
        ) {
          const r = (data as { rank: number }).rank
          setEdhrecRank(r)
          setRarity(getRarityTier(r))
        }
      })
      .catch(() => {})
      .finally(() => clearTimeout(timeout))
    return () => { cancelled = true; controller.abort(); clearTimeout(timeout) }
  }, [edhrecSlug])

  // ── Art printings ──
  const [printings, setPrintings] = useState<ScryfallPrinting[]>([])
  const [selectedPrinting, setSelectedPrinting] = useState<ScryfallPrinting | null>(null)
  useEffect(() => {
    if (!commander.prints_search_uri) return
    let cancelled = false
    fetchCardPrintings(commander.prints_search_uri)
      .then((data) => { if (!cancelled && data.length >= 2) setPrintings(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [commander.prints_search_uri])

  // ── Card face flip ──
  const [faceIndex, setFaceIndex] = useState(0)
  const [isFlipping, setIsFlipping] = useState(false)
  const [scope, animateFlip] = useAnimate()

  const handleFlip = async () => {
    if (isFlipping || !isDoubleFaced) return
    setIsFlipping(true)
    try {
      await animateFlip(scope.current, { scaleX: 0 }, { duration: 0.18, ease: [0.4, 0, 1, 1] })
      setFaceIndex((f) => 1 - f)
      await animateFlip(scope.current, { scaleX: 1 }, { duration: 0.18, ease: [0, 0, 0.2, 1] })
    } finally {
      setIsFlipping(false)
    }
  }

  const handleSelectPrinting = (p: ScryfallPrinting) => {
    if (isFlipping) return
    setSelectedPrinting(p)
    setFaceIndex(0)
  }

  // ── Extra UI state ──
  const defaultImage = commander.image_uris?.normal ?? commander.card_faces?.[0]?.image_uris?.normal ?? ""
  const [imageLoaded, setImageLoaded] = useState(() => _loadedImageUrls.has(defaultImage))
  const [rollingPartner, setRollingPartner] = useState(false)
  const [shareToast, setShareToast] = useState(false)
  const [showRarityInfo, setShowRarityInfo] = useState(false)

  const partnerType = getPartnerType(commander)

  // Reset derived UI state when commander changes; skip skeleton if image was already loaded
  useEffect(() => {
    const img = commander.image_uris?.normal ?? commander.card_faces?.[0]?.image_uris?.normal ?? ""
    setImageLoaded(_loadedImageUrls.has(img))
  }, [commander.id])

  const handleRollPartner = async () => {
    if (rollingPartner) return
    setRollingPartner(true)
    try {
      const partner = partnerType?.type === "background"
        ? await fetchRandomBackground(colorIdentity)
        : partnerType?.type === "friends-forever"
        ? await fetchRandomFriendsForeverPartner(commander.id, colorIdentity)
        : partnerType?.type === "doctors-companion"
        ? await fetchRandomDoctor(commander.id, colorIdentity)
        : partnerType?.type === "character-select"
        ? await fetchRandomCharacterSelectPartner(commander.id, colorIdentity)
        : partnerType?.type === "survivors"
        ? await fetchRandomSurvivorPartner(commander.id, colorIdentity)
        : partnerType?.type === "father-son"
        ? await fetchRandomFatherSonPartner(commander.id, colorIdentity)
        : await fetchRandomPartner(commander.id, colorIdentity)
      onPartnerChange(partner)
    } catch { /* silent */ }
    finally { setRollingPartner(false) }
  }

  const handleShare = async () => {
    const url = `${window.location.origin}?c=${commander.id}`
    const text = `I rolled ${commander.name}${rarity ? ` — ${RARITY[rarity].label} tier` : ""}! 🎰`
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Random EDH Commander Generator", text, url })
      } else {
        await navigator.clipboard.writeText(url)
        setShareToast(true)
        setTimeout(() => setShareToast(false), 2200)
      }
    } catch { /* cancelled */ }
  }

  // ── Displayed image ──
  const source = selectedPrinting ?? commander
  const displayImage =
    isDoubleFaced && faceIndex === 1
      ? (source.card_faces?.[1]?.image_uris?.normal ??
         commander.card_faces![1].image_uris!.normal)
      : (source.image_uris?.normal ?? source.card_faces?.[0]?.image_uris?.normal ?? "")

  const currentId = selectedPrinting?.id ?? commander.id
  // Face images for the flip button (uses selected printing when available)
  const face0img = source.card_faces?.[0]?.image_uris?.normal ?? commander.card_faces?.[0]?.image_uris?.normal ?? ""
  const face1img = source.card_faces?.[1]?.image_uris?.normal ?? commander.card_faces?.[1]?.image_uris?.normal ?? ""

  const partnerLabel =
    partnerType?.type === "background" ? "Background" :
    partnerType?.type === "friends-forever" ? "Friend" :
    partnerType?.type === "doctors-companion" ? "The Doctor" :
    partnerType?.type === "survivors" ? "Survivor" :
    partnerType?.type === "father-son" ? "Father / Son" :
    "Partner"

  const splitActive = (rollingPartner || !!partnerCard) &&
    (partnerType?.type === "generic" || partnerType?.type === "background" ||
     partnerType?.type === "friends-forever" || partnerType?.type === "doctors-companion" ||
     partnerType?.type === "character-select" || partnerType?.type === "survivors" ||
     partnerType?.type === "father-son")

  return (
    <motion.div
      className="flex flex-col lg:flex-row-reverse gap-6 lg:gap-10 w-full max-w-sm lg:max-w-5xl mx-auto px-4 lg:px-10 lg:items-center"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* ── Card column — top on mobile, RIGHT on desktop ── */}
      <div className="w-full lg:w-[54%] flex-shrink-0">

        {/* Card image */}
        <div className="relative">
          <div
            className="reveal-flash absolute inset-0 rounded-2xl pointer-events-none z-10"
            style={{
              background: rarity
                ? `radial-gradient(circle at 50% 40%, rgba(${RARITY[rarity].rgb}, 0.55) 0%, transparent 65%)`
                : "radial-gradient(circle at 50% 40%, rgba(212,175,55,0.55) 0%, transparent 65%)",
            }}
          />
          <div ref={scope} style={{ transformOrigin: "center center" }}>
            <motion.div
              className="w-full rounded-2xl overflow-hidden"
              initial={{ boxShadow: "0 0 0px rgba(212,175,55,0)" }}
              animate={{
                boxShadow: rarity
                  ? `0 0 100px rgba(${RARITY[rarity].rgb}, 0.38), 0 0 200px rgba(${RARITY[rarity].rgb}, 0.12)`
                  : "0 0 100px rgba(212,175,55,0.38), 0 0 200px rgba(100,80,200,0.2)",
              }}
              transition={{ duration: 1.1, delay: 0.15, ease: "easeOut" }}
            >
              {!imageLoaded && (
                <div
                  className="absolute inset-0 rounded-2xl animate-pulse"
                  style={{ background: "oklch(13% 0.009 285)" }}
                />
              )}
              <Image
                src={displayImage}
                alt={commander.name}
                width={480}
                height={672}
                className="w-full h-auto"
                priority
                onLoad={() => { _loadedImageUrls.add(displayImage); setImageLoaded(true) }}
              />
            </motion.div>
          </div>
        </div>

        {/* Flip button — outside the card; shows both face thumbnails */}
        {isDoubleFaced && (
          <div className="flex justify-center mt-3">
            <motion.button
              onClick={handleFlip}
              disabled={isFlipping}
              aria-label={faceIndex === 0 ? "Flip to back face" : "Flip to front face"}
              className="flex items-center gap-2.5 px-3 py-2 rounded-full cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
              style={{
                background: "oklch(11% 0.009 285)",
                border: "1px solid oklch(72% 0.115 82 / 0.3)",
              }}
              whileHover={{ scale: 1.06, borderColor: "oklch(72% 0.115 82 / 0.6)" }}
              whileTap={{ scale: 0.93 }}
              transition={{ type: "spring", stiffness: 340, damping: 20 }}
            >
              {/* Front face mini */}
              <div
                className="rounded overflow-hidden flex-shrink-0"
                style={{
                  width: 32, height: 45,
                  border: `1.5px solid ${faceIndex === 0 ? "oklch(72% 0.115 82)" : "oklch(100% 0 0 / 0.15)"}`,
                  opacity: faceIndex === 0 ? 1 : 0.38,
                  transition: "opacity 0.2s, border-color 0.2s",
                }}
              >
                <Image src={face0img} alt="Front face" width={32} height={45} className="w-full h-full object-cover" />
              </div>

              {/* Rotate icon */}
              <motion.svg
                width="15" height="15" viewBox="0 0 24 24"
                fill="none" stroke="oklch(65% 0.09 82)" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                animate={{ rotate: isFlipping ? 180 : 0 }}
                transition={{ duration: 0.35 }}
                aria-hidden="true"
              >
                <polyline points="1 4 1 10 7 10"/>
                <polyline points="23 20 23 14 17 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </motion.svg>

              {/* Back face mini */}
              <div
                className="rounded overflow-hidden flex-shrink-0"
                style={{
                  width: 32, height: 45,
                  border: `1.5px solid ${faceIndex === 1 ? "oklch(72% 0.115 82)" : "oklch(100% 0 0 / 0.15)"}`,
                  opacity: faceIndex === 1 ? 1 : 0.38,
                  transition: "opacity 0.2s, border-color 0.2s",
                }}
              >
                <Image src={face1img} alt="Back face" width={32} height={45} className="w-full h-full object-cover" />
              </div>
            </motion.button>
          </div>
        )}

        {/* Art strip — visual thumbnails only, icon indicates "versions" */}
        <ArtStrip
          printings={printings}
          currentId={currentId}
          onSelect={handleSelectPrinting}
        />

        {/* Partner / Background — appears below the card at 80% width */}
        <AnimatePresence>
          {splitActive && (
            <motion.div
              className="mt-4 w-4/5 mx-auto flex flex-col items-center"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <VerticalMiniSlot
                spinning={rollingPartner}
                result={partnerCard}
                label={partnerLabel}
                fullWidth
              />
              {partnerCard && (
                <motion.button
                  onClick={handleRollPartner}
                  disabled={rollingPartner}
                  className="mt-2 text-[0.58rem] opacity-40 hover:opacity-80 cursor-pointer disabled:cursor-not-allowed transition-opacity"
                  style={{ color: "oklch(55% 0.006 285)", fontFamily: "var(--font-raleway)" }}
                  title="Reroll"
                >
                  ↺ reroll
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Info column — bottom on mobile, LEFT on desktop ── */}
      <div className="w-full lg:w-[46%] flex flex-col gap-4">
        <motion.h2
          className="text-2xl lg:text-3xl font-black leading-snug"
          style={{ fontFamily: "var(--font-cinzel)", color: "oklch(72% 0.115 82)", textShadow: "0 0 40px oklch(72% 0.115 82 / 0.3)" }}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.28, duration: 0.5 }}
        >
          {commander.name}
        </motion.h2>

        {/* Rarity badge */}
        <AnimatePresence>
          {rarity && (
            <motion.div
              key={rarity}
              className="flex items-center gap-2.5"
              initial={{ opacity: 0, y: 6, scale: 0.88 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.18, type: "spring", stiffness: 260, damping: 18 }}
            >
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tracking-[0.16em] uppercase"
                style={{
                  background: `rgba(${RARITY[rarity].rgb}, 0.1)`,
                  border: `1px solid rgba(${RARITY[rarity].rgb}, 0.38)`,
                  color: RARITY[rarity].color,
                  fontFamily: "var(--font-cinzel)",
                  boxShadow: `0 0 18px rgba(${RARITY[rarity].rgb}, 0.22)`,
                }}
              >
                ◆ {RARITY[rarity].label}
              </span>
              {edhrecRank !== null && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{
                    fontFamily: "var(--font-raleway)",
                    background: "oklch(18% 0.012 285)",
                    border: "1px solid oklch(32% 0.012 285)",
                    color: "oklch(64% 0.018 285)",
                  }}
                >
                  #{edhrecRank} on EDHREC
                </span>
              )}
              {/* Rarity info popover */}
              <div className="relative">
                <button
                  onMouseEnter={() => setShowRarityInfo(true)}
                  onMouseLeave={() => setShowRarityInfo(false)}
                  onFocus={() => setShowRarityInfo(true)}
                  onBlur={() => setShowRarityInfo(false)}
                  aria-label="Rarity tier information"
                  className="flex items-center justify-center rounded-full cursor-pointer focus-visible:outline-none"
                  style={{
                    width: 18, height: 18,
                    background: "oklch(18% 0.012 285)",
                    border: "1px solid oklch(32% 0.012 285)",
                    color: "oklch(48% 0.006 285)",
                    fontSize: "0.6rem",
                    fontFamily: "var(--font-raleway)",
                    fontWeight: 700,
                  }}
                >
                  ?
                </button>
                <AnimatePresence>
                  {showRarityInfo && (
                    <motion.div
                      className="absolute z-20 bottom-full mb-2 left-0 rounded-xl p-3 min-w-[160px]"
                      style={{
                        background: "oklch(13% 0.012 285)",
                        border: "1px solid oklch(28% 0.012 285)",
                        boxShadow: "0 8px 32px oklch(5% 0.005 285 / 0.8)",
                      }}
                      initial={{ opacity: 0, y: 4, scale: 0.94 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.94 }}
                      transition={{ duration: 0.15 }}
                    >
                      {(Object.entries(RARITY) as [RarityTier, typeof RARITY[RarityTier]][]).map(([key, tier]) => (
                        <div key={key} className="flex items-center justify-between gap-3 py-0.5">
                          <span style={{ color: tier.color, fontSize: "0.68rem", fontFamily: "var(--font-cinzel)", fontWeight: 700 }}>
                            ◆ {tier.label}
                          </span>
                          <span style={{ color: "oklch(44% 0.006 285)", fontSize: "0.62rem", fontFamily: "var(--font-raleway)" }}>
                            {RARITY_RANKS[key]}
                          </span>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
                style={{ backgroundColor: c.hex, borderColor: c.hex, boxShadow: `0 0 12px ${c.glow}` }}
                title={c.label}
              >
                <div className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle at 35% 28%, rgba(255,255,255,0.35) 0%, transparent 55%)" }} />
                <span className="relative z-10" style={{ fontFamily: "var(--font-cinzel)", color: c.textDark ? "oklch(8% 0.009 285)" : "oklch(97% 0.005 285)", fontSize: "0.65rem" }}>
                  {c.key}
                </span>
              </div>
            ))}
          </motion.div>
        )}

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
                style={{ background: "oklch(72% 0.115 82 / 0.09)", border: "1px solid oklch(72% 0.115 82 / 0.25)", color: "oklch(65% 0.09 82)", fontFamily: "var(--font-raleway)" }}
              >
                {tag}
              </span>
            ))}
          </motion.div>
        )}

        {oracleText && (
          <motion.div
            className="rounded-xl p-4 text-sm leading-relaxed whitespace-pre-line"
            style={{ background: "oklch(11% 0.009 285)", border: "1px solid oklch(100% 0 0 / 0.07)", color: "oklch(62% 0.01 285)", fontFamily: "var(--font-raleway)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.52 }}
          >
            {oracleText}
          </motion.div>
        )}

        {/* Partner / Background section */}
        {partnerType && (
          <motion.div
            className="flex flex-col gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
          >
            {/* "Partner with X" fixed link — always shown */}
            {partnerType.type === "with" && (
              <p style={{ fontSize: "0.72rem", color: "oklch(48% 0.006 285)", fontFamily: "var(--font-raleway)" }}>
                Partners with{" "}
                <a
                  href={`https://edhrec.com/commanders/${partnerType.name.toLowerCase().replace(/[',]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ color: "oklch(72% 0.115 82)" }}
                >
                  {partnerType.name} ↗
                </a>
              </p>
            )}
            {/* Generic partner / background / friends-forever: roll button then mini slot */}
            {(partnerType.type === "generic" || partnerType.type === "background" || partnerType.type === "friends-forever" || partnerType.type === "doctors-companion" || partnerType.type === "character-select" || partnerType.type === "survivors" || partnerType.type === "father-son") && (
              <>
                {/* Roll button — always shown before rolling, on all screen sizes */}
                {!rollingPartner && !partnerCard && (
                  <button
                    onClick={handleRollPartner}
                    className="w-full py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40"
                    style={{
                      background: "oklch(47% 0.24 292 / 0.07)",
                      border: "1px solid oklch(47% 0.24 292 / 0.28)",
                      color: "oklch(72% 0.18 295)",
                      fontFamily: "var(--font-raleway)",
                    }}
                  >
                    {partnerType.type === "background"
                      ? "🎲 Roll a Background"
                      : partnerType.type === "friends-forever"
                      ? "🎲 Roll a Friend Forever"
                      : partnerType.type === "doctors-companion"
                      ? "🎲 Roll a Doctor"
                      : partnerType.type === "survivors"
                      ? "🎲 Roll a Survivor"
                      : partnerType.type === "father-son"
                      ? "🎲 Roll Father / Son"
                      : "🎲 Roll a Partner"}
                  </button>
                )}
              </>
            )}
          </motion.div>
        )}

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
            style={{ background: "oklch(47% 0.24 292 / 0.1)", border: "1px solid oklch(47% 0.24 292 / 0.32)", color: "oklch(72% 0.18 295)", fontFamily: "var(--font-raleway)" }}
          >
            Spin Again
          </button>
        </motion.div>

        {/* Share button */}
        <motion.div
          className="relative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.65 }}
        >
          <button
            onClick={handleShare}
            className="w-full py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 flex items-center justify-center gap-1.5"
            style={{
              background: "oklch(100% 0 0 / 0.03)",
              border: "1px solid oklch(100% 0 0 / 0.1)",
              color: "oklch(52% 0.006 285)",
              fontFamily: "var(--font-raleway)",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Share this commander
          </button>
          <AnimatePresence>
            {shareToast && (
              <motion.span
                className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[0.65rem] pointer-events-none whitespace-nowrap"
                style={{ background: "oklch(18% 0.012 285)", color: "oklch(72% 0.115 82)", border: "1px solid oklch(32% 0.012 285)", fontFamily: "var(--font-raleway)" }}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                Link copied!
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>

        {/* External links + TCGPlayer */}
        <motion.div
          className="flex flex-wrap gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          {[
            { href: `https://edhrec.com/commanders/${edhrecSlug}`, label: "EDHREC", style: { background: "oklch(72% 0.115 82 / 0.1)", border: "1px solid oklch(72% 0.115 82 / 0.4)", color: "oklch(76% 0.115 82)", boxShadow: "0 0 18px oklch(72% 0.115 82 / 0.08)" } },
            { href: commander.scryfall_uri, label: "Scryfall", style: { background: "oklch(47% 0.24 292 / 0.1)", border: "1px solid oklch(47% 0.24 292 / 0.38)", color: "oklch(76% 0.18 295)", boxShadow: "0 0 18px oklch(47% 0.24 292 / 0.08)" } },
            ...(commander.purchase_uris?.cardmarket
              ? [{ href: commander.purchase_uris.cardmarket, label: "Cardmarket", style: { background: "oklch(48% 0.16 240 / 0.1)", border: "1px solid oklch(48% 0.16 240 / 0.38)", color: "oklch(68% 0.16 240)", boxShadow: "0 0 18px oklch(48% 0.16 240 / 0.07)" } }]
              : []),
            ...(commander.purchase_uris?.tcgplayer
              ? [{ href: commander.purchase_uris.tcgplayer, label: "TCGPlayer", style: { background: "oklch(55% 0.18 145 / 0.1)", border: "1px solid oklch(55% 0.18 145 / 0.35)", color: "oklch(70% 0.18 145)", boxShadow: "0 0 18px oklch(55% 0.18 145 / 0.06)" } }]
              : []),
          ].map(({ href, label, style }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel={(label === "TCGPlayer" || label === "Cardmarket") ? "noopener noreferrer sponsored" : "noopener noreferrer"}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
              style={{ fontFamily: "var(--font-raleway)", ...style }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              {label}
            </a>
          ))}
        </motion.div>
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HistoryStrip — recent rolls shown in idle state, click to re-reveal
// ─────────────────────────────────────────────────────────────────────────────
function HistoryStrip({ history, onLoad }: { history: CommanderEntry[]; onLoad: (e: CommanderEntry) => void }) {
  if (history.length === 0) return null
  return (
    <motion.div
      className="w-full max-w-xs px-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4 }}
    >
      <p
        className="text-[0.58rem] tracking-[0.28em] uppercase mb-2.5 text-center"
        style={{ color: "oklch(30% 0.006 285)", fontFamily: "var(--font-cinzel)" }}
      >
        Recent Rolls
      </p>
      <div className="flex gap-2.5 overflow-x-auto py-2 justify-center" style={{ scrollbarWidth: "none" }}>
        {history.map((entry) => {
          const img = getCardImage(entry.commander)
          return (
            <motion.button
              key={entry.commander.id}
              onClick={() => onLoad(entry)}
              title={entry.commander.name}
              aria-label={`Re-view ${entry.commander.name}`}
              className="relative flex-shrink-0 rounded-lg overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/40"
              style={{ width: 68, border: "1px solid oklch(100% 0 0 / 0.1)" }}
              whileHover={{ scale: 1.1, y: 4, transition: { type: "spring", stiffness: 380, damping: 22 } }}
              whileTap={{ scale: 0.92 }}
            >
              {img ? (
                <Image src={img} alt={entry.commander.name} width={68} height={95} className="w-full h-auto block" />
              ) : (
                <div style={{ width: 68, height: 95, background: "oklch(11% 0.009 285)" }} />
              )}
              {entry.partner && (
                <div className="absolute bottom-0.5 right-0.5 rounded overflow-hidden" style={{ width: 22, height: 31, border: "1px solid oklch(100% 0 0 / 0.3)" }}>
                  <Image src={getCardImage(entry.partner)} alt={entry.partner.name} width={22} height={31} className="w-full h-auto block" />
                </div>
              )}
            </motion.button>
          )
        })}
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar — Command Zone: saved commanders, slides in from right
// ─────────────────────────────────────────────────────────────────────────────
function Sidebar({
  open,
  onClose,
  saved,
  onLoad,
  onRemove,
}: {
  open: boolean
  onClose: () => void
  saved: CommanderEntry[]
  onLoad: (entry: CommanderEntry) => void
  onRemove: (id: string) => void
}) {
  // Escape key to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
            style={{ background: "oklch(7.5% 0.009 285 / 0.72)" }}
          />

          {/* Panel */}
          <motion.aside
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label="Command Zone — saved commanders"
            className="fixed right-0 top-0 bottom-0 z-50 flex flex-col"
            style={{
              width: "min(320px, 88vw)",
              background: "oklch(10% 0.009 285)",
              borderLeft: "1px solid oklch(72% 0.115 82 / 0.1)",
              boxShadow: "-24px 0 80px oklch(7.5% 0.009 285 / 0.6)",
            }}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.8 }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 flex-shrink-0"
              style={{ borderBottom: "1px solid oklch(100% 0 0 / 0.06)" }}
            >
              <div className="flex items-center gap-2.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="oklch(72% 0.115 82)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
                <span
                  className="text-xs font-semibold tracking-[0.2em] uppercase"
                  style={{ fontFamily: "var(--font-cinzel)", color: "oklch(72% 0.115 82)" }}
                >
                  Command Zone
                </span>
                {saved.length > 0 && (
                  <span
                    className="px-1.5 py-px rounded-full text-[0.55rem] font-bold leading-none"
                    style={{ background: "oklch(72% 0.115 82 / 0.15)", color: "oklch(65% 0.09 82)", fontFamily: "var(--font-cinzel)" }}
                  >
                    {saved.length}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Close Command Zone"
                autoFocus
                className="flex items-center justify-center rounded-full cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 transition-opacity hover:opacity-60"
                style={{ width: 44, height: 44, color: "oklch(48% 0.006 285)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "oklch(22% 0.006 285) transparent" }}>
              {saved.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-5 px-8 text-center" style={{ minHeight: 260 }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="oklch(28% 0.006 285)" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                  </svg>
                  <p style={{ fontFamily: "var(--font-raleway)", fontSize: "0.78rem", color: "oklch(38% 0.006 285)", lineHeight: 1.65 }}>
                    Your Command Zone is empty.<br />
                    Spin to find your first commander.
                  </p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {saved.map((entry) => {
                    const img = getCardImage(entry.commander)
                    const colors = MANA_COLORS.filter((c) => entry.commander.color_identity.includes(c.key))
                    return (
                      <motion.div
                        key={entry.commander.id}
                        layout
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20, transition: { duration: 0.15 } }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer group"
                        style={{ borderBottom: "1px solid oklch(100% 0 0 / 0.04)" }}
                        onClick={() => onLoad(entry)}
                        whileHover={{ backgroundColor: "oklch(72% 0.115 82 / 0.04)" }}
                      >
                        {/* Card thumbnail */}
                        {img && (
                          <div className="flex-shrink-0 rounded-lg overflow-hidden" style={{ width: 46, height: 64, border: "1px solid oklch(100% 0 0 / 0.12)" }}>
                            <Image src={img} alt={entry.commander.name} width={46} height={64} className="w-full h-auto" />
                          </div>
                        )}

                        {/* Name + partner + color badges */}
                        <div className="flex-1 min-w-0">
                          <p
                            className="leading-tight truncate"
                            style={{ fontFamily: "var(--font-cinzel)", fontSize: "0.7rem", fontWeight: 600, color: "oklch(72% 0.115 82)" }}
                          >
                            {entry.commander.name}
                          </p>
                          {entry.partner && (
                            <p className="truncate mt-0.5" style={{ fontFamily: "var(--font-raleway)", fontSize: "0.58rem", color: "oklch(42% 0.006 285)" }}>
                              + {entry.partner.name}
                            </p>
                          )}
                          {colors.length > 0 && (
                            <div className="flex gap-1 mt-1.5">
                              {colors.map((c) => (
                                <div
                                  key={c.key}
                                  className="relative w-4 h-4 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                                  style={{ backgroundColor: c.hex, border: `1px solid ${c.hex}` }}
                                  title={c.label}
                                >
                                  <div className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle at 35% 28%, rgba(255,255,255,0.3) 0%, transparent 55%)" }} />
                                  <span style={{ fontFamily: "var(--font-cinzel)", color: c.textDark ? "oklch(8% 0.009 285)" : "oklch(97% 0.005 285)", fontSize: "0.38rem", position: "relative", zIndex: 1 }}>
                                    {c.key}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Remove */}
                        <button
                          onClick={(e) => { e.stopPropagation(); onRemove(entry.commander.id) }}
                          aria-label={`Remove ${entry.commander.name}`}
                          className="flex-shrink-0 flex items-center justify-center rounded-full cursor-pointer focus-visible:outline-none transition-colors hover:text-red-400/70 focus-visible:text-red-400/70"
                          style={{ width: 44, height: 44, color: "oklch(38% 0.006 285)" }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page — state machine: idle → spinning → revealed
// ─────────────────────────────────────────────────────────────────────────────
export default function Page() {
  const [appState, setAppState] = useState<AppState>("idle")
  const [selectedColors, setSelectedColors] = useState<Set<ColorKey>>(new Set())
  const [colorlessActive, setColorlessActive] = useState(false)
  // Dev-only: force partner or background commanders for testing the split panel
  const [spinMode, setSpinMode] = useState<"duo" | "origin" | null>(null)
  const [commander, setCommander] = useState<ScryfallCard | null>(null)
  const [partnerCard, setPartnerCard] = useState<ScryfallCard | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [saved, setSaved] = useState<CommanderEntry[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pendingRarity, setPendingRarity] = useState<RarityTier | null>(null)
  const [history, setHistory] = useState<CommanderEntry[]>([])

  useEffect(() => { setSaved(getSaved()) }, [])

  // Load a shared commander from ?c= URL param on mount
  useEffect(() => {
    const cid = new URLSearchParams(window.location.search).get("c")
    if (!cid) return
    fetchCommanderById(cid)
      .then((card) => {
        setCommander(card)
        setAppState("revealed")
        window.history.replaceState({}, "", window.location.pathname)
      })
      .catch(() => {})
  }, [])

  // Keep a rolling history of the last 8 revealed commanders (including partner)
  useEffect(() => {
    if (!commander || appState !== "revealed") return
    setHistory((prev) => {
      if (prev[0]?.commander.id === commander.id) {
        if (prev[0].partner?.id === partnerCard?.id) return prev
        return [{ ...prev[0], partner: partnerCard }, ...prev.slice(1)]
      }
      return [{ commander, partner: partnerCard }, ...prev].slice(0, 8)
    })
  }, [commander, appState, partnerCard])

  const isSaved = commander ? saved.some((e) => e.commander.id === commander.id) : false

  const toggleColor = useCallback((key: ColorKey) => {
    setColorlessActive(false)
    setSelectedColors((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  const toggleColorless = useCallback(() => {
    setColorlessActive((prev) => {
      if (!prev) setSelectedColors(new Set())
      return !prev
    })
  }, [])

  // Colorless is incompatible with Partner / Background modes
  useEffect(() => {
    if (colorlessActive && spinMode !== null) setSpinMode(null)
  }, [colorlessActive, spinMode])

  const handleSpin = useCallback(async () => {
    if (appState !== "idle") return
    const spinStart = Date.now()
    setFetchError(null)
    setCommander(null)
    setPendingRarity(null)
    setAppState("spinning")

    const colors = colorlessActive ? ["c"] : Array.from(selectedColors)
    let card: ScryfallCard
    try {
      if (spinMode === "duo") {
        card = await fetchRandomDuoCommander(colors)
      } else if (spinMode === "origin") {
        card = await fetchRandomOriginCommander(colors)
      } else {
        card = await fetchRandomCommander(colors)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ""
      const noResults = msg.includes("404")
      setFetchError(
        noResults
          ? "No commanders found for this color combination. Try fewer colors or none."
          : "Could not reach Scryfall. Check your connection and try again."
      )
      setAppState("idle")
      return
    }

    // Card known — fire rank fetch immediately so glow can update mid-spin
    const slug = getEdhrecSlug(card)
    fetch(`/api/tags?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (
          data !== null && typeof data === "object" &&
          "rank" in data && typeof (data as { rank: unknown }).rank === "number"
        ) {
          setPendingRarity(getRarityTier((data as { rank: number }).rank))
        }
      })
      .catch(() => {})

    // Wait for remaining spin time
    const elapsed = Date.now() - spinStart
    await new Promise((r) => setTimeout(r, Math.max(600, SPIN_DURATION_MS - elapsed)))

    setCommander(card)
    setAppState("revealed")
  }, [appState, selectedColors, spinMode])

  const handleSpinAgain = useCallback(() => {
    setAppState("idle")
    setCommander(null)
    setPartnerCard(null)
    setFetchError(null)
    setPendingRarity(null)
  }, [])

  const handleSave = useCallback(() => {
    if (!commander) return
    setSaved(addSaved({ commander, partner: partnerCard }))
  }, [commander, partnerCard])

  const handleRemoveSaved = useCallback((id: string) => {
    setSaved(removeSaved(id))
  }, [])

  const handleLoadCommander = useCallback((entry: CommanderEntry) => {
    setCommander(entry.commander)
    setPartnerCard(entry.partner)
    setFetchError(null)
    setAppState("revealed")
    setSidebarOpen(false)
    setPendingRarity(null)
  }, [])

  const handleLoadFromHistory = useCallback((entry: CommanderEntry) => {
    setCommander(entry.commander)
    setPartnerCard(entry.partner)
    setFetchError(null)
    setAppState("revealed")
    setPendingRarity(null)
  }, [])

  const colorKeys = Array.from(selectedColors) as ColorKey[]
  const theme = getColorTheme(colorKeys)

  return (
    <main className="relative min-h-dvh flex flex-col overflow-hidden">
      {/* ── Background blobs + color theme overlay ── */}
      <div className="fixed inset-0 -z-10" aria-hidden="true">
        {theme.overlay !== "none" && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: theme.overlay, transition: "background 1.4s ease" }}
          />
        )}
        <AmbientBlob color={theme.blobs[0]} style={{ left: "6%",  top: "10%",   width: 480, height: 480 }} delay={0} />
        <AmbientBlob color={theme.blobs[1]} style={{ right: "4%", top: "26%",   width: 360, height: 360 }} delay={5} />
        <AmbientBlob color={theme.blobs[2]} style={{ left: "20%", bottom: "6%", width: 400, height: 400 }} delay={9} />

        {/* Spin glow — omnidirectional rarity burst; lives here to escape any overflow clipping */}
        <AnimatePresence>
          {appState === "spinning" && (
            <SpinGlow
              key="spin-glow"
              rgb={pendingRarity ? RARITY[pendingRarity].rgb : "210,215,235"}
            />
          )}
        </AnimatePresence>
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
          <div className="h-px w-12" style={{ background: "linear-gradient(to right, transparent, oklch(50% 0.08 82 / 0.4))" }} />
          <span style={{ color: "oklch(38% 0.006 285)", fontSize: "0.6rem", letterSpacing: "0.3em", fontFamily: "var(--font-raleway)" }}>
            SPIN · DISCOVER · BUILD
          </span>
          <div className="h-px w-12" style={{ background: "linear-gradient(to left, transparent, oklch(50% 0.08 82 / 0.4))" }} />
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
          {/* Divider */}
          <div className="self-stretch w-px mx-1" style={{ background: "oklch(100% 0 0 / 0.1)" }} />
          {/* Colorless orb */}
          <ManaOrb
            color={{ key: "C", label: "Colorless", hex: "#8e8ea8", glow: "rgba(142,142,168,0.6)", textDark: false }}
            active={colorlessActive}
            onToggle={toggleColorless}
          />
        </motion.div>

        <AnimatePresence>
          {(selectedColors.size > 0 || colorlessActive) && (
            <motion.p
              className="mt-2 text-xs tracking-wide"
              style={{ color: "oklch(45% 0.006 285)", fontFamily: "var(--font-raleway)" }}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              {colorlessActive
                ? "Colorless commanders only"
                : `${getColorComboName(Array.from(selectedColors))} commanders only`}
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
              <HistoryStrip history={history} onLoad={handleLoadFromHistory} />

              {/* ── Mode selector ── */}
              <div
                className="flex rounded-full p-0.5 gap-0.5"
                style={{ background: "oklch(11% 0.009 285)", border: "1px solid oklch(100% 0 0 / 0.07)" }}
              >
                {([
                  { value: null,     icon: "✦", label: "Normal" },
                  { value: "duo",    icon: "⚔", label: "Partner" },
                  { value: "origin", icon: "📖", label: "Background" },
                ] as const).map(({ value, icon, label }) => {
                  const active = spinMode === value
                  const disabled = colorlessActive && value !== null
                  return (
                    <button
                      key={String(value)}
                      onClick={() => !disabled && setSpinMode(value)}
                      disabled={disabled}
                      className="px-3 py-1.5 rounded-full text-xs tracking-wide transition-all duration-200"
                      style={{
                        fontFamily: "var(--font-cinzel)",
                        cursor: disabled ? "not-allowed" : "pointer",
                        background: active ? "oklch(72% 0.115 82 / 0.15)" : "transparent",
                        color: disabled ? "oklch(25% 0.006 285)" : active ? "var(--gold)" : "oklch(38% 0.006 285)",
                        boxShadow: active ? "0 0 12px oklch(72% 0.115 82 / 0.2)" : "none",
                        border: active ? "1px solid oklch(72% 0.115 82 / 0.35)" : "1px solid transparent",
                        opacity: disabled ? 0.4 : 1,
                      }}
                    >
                      {icon} {label}
                    </button>
                  )
                })}
              </div>
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
              <SlotMachine rarity={pendingRarity} />
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
                initialRarity={pendingRarity}
                colorIdentity={colorlessActive ? ["c"] : Array.from(selectedColors)}
                partnerCard={partnerCard}
                onPartnerChange={setPartnerCard}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Footer ── */}
      <footer
        className="py-5 text-center text-xs tracking-wide leading-relaxed"
        style={{ color: "oklch(32% 0.005 285)", fontFamily: "var(--font-raleway)" }}
      >
        Magic: The Gathering is ©Wizards of the Coast LLC · Not affiliated with WotC · Card data from{" "}
        <a
          href="https://scryfall.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:opacity-80 transition-opacity"
        >
          Scryfall
        </a>
      </footer>

      {/* ── Book button — fixed top-right ── */}
      <motion.button
        onClick={() => setSidebarOpen(true)}
        aria-label={`Open Command Zone (${saved.length} saved)`}
        className="fixed z-30 flex items-center justify-center rounded-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/30"
        style={{
          top: "max(1rem, env(safe-area-inset-top))",
          right: "max(1rem, env(safe-area-inset-right))",
          width: 44,
          height: 44,
          background: "oklch(11% 0.009 285)",
          border: "1px solid oklch(72% 0.115 82 / 0.22)",
        }}
        whileHover={{ scale: 1.1, borderColor: "oklch(72% 0.115 82 / 0.5)" }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", stiffness: 360, damping: 20 }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="oklch(72% 0.115 82)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
        </svg>
        {saved.length > 0 && (
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center rounded-full font-bold leading-none"
            style={{
              width: 17,
              height: 17,
              fontSize: "0.5rem",
              background: "oklch(72% 0.115 82)",
              color: "oklch(10% 0.02 82)",
              fontFamily: "var(--font-cinzel)",
            }}
          >
            {saved.length}
          </span>
        )}
      </motion.button>

      {/* ── Sidebar ── */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        saved={saved}
        onLoad={handleLoadCommander}
        onRemove={handleRemoveSaved}
      />
    </main>
  )
}
