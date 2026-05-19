import { ImageResponse } from "next/og"

export const runtime = "edge"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0d0a12",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "serif",
          position: "relative",
        }}
      >
        {/* Radial glow */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse 70% 80% at 50% 50%, rgba(212,175,55,0.18) 0%, transparent 65%)",
          }}
        />
        {/* Diamond icon */}
        <div style={{ fontSize: 72, color: "#d4af37", marginBottom: 16, lineHeight: 1 }}>◆</div>
        {/* Title */}
        <div
          style={{
            fontSize: 78,
            fontWeight: 900,
            color: "#d4af37",
            letterSpacing: 10,
            textTransform: "uppercase",
            textAlign: "center",
            lineHeight: 1.1,
          }}
        >
          Random EDH
        </div>
        {/* Subtitle */}
        <div
          style={{
            fontSize: 30,
            color: "#7a5e20",
            letterSpacing: 14,
            textTransform: "uppercase",
            marginTop: 14,
          }}
        >
          Commander Generator
        </div>
        {/* Tagline */}
        <div style={{ fontSize: 20, color: "#4a3820", marginTop: 28, letterSpacing: 2 }}>
          Spin the slot machine · Discover your commander · Build your deck
        </div>
        {/* Color pips */}
        <div style={{ display: "flex", gap: 18, marginTop: 40 }}>
          {(["#f0e8d0", "#4a90d9", "#9b72d4", "#e05252", "#3db87a"] as const).map((c) => (
            <div
              key={c}
              style={{
                width: 38, height: 38, borderRadius: "50%", background: c,
                boxShadow: `0 0 20px ${c}99`,
              }}
            />
          ))}
        </div>
      </div>
    ),
    { ...size }
  )
}
