import { ImageResponse } from "next/og"

export const size = { width: 32, height: 32 }
export const contentType = "image/png"

// Crown polygon: 4,24 8,13 12,19 16,9 20,19 24,13 28,24 (out of 32×32)
// Converted to percentages for clip-path
const CROWN = "polygon(12.5% 75%, 25% 40.6%, 37.5% 59.4%, 50% 28.1%, 62.5% 59.4%, 75% 40.6%, 87.5% 75%)"

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: "#0d0a12",
          borderRadius: 4,
          position: "relative",
          display: "flex",
          overflow: "hidden",
        }}
      >
        {/* Crown body */}
        <div style={{ position: "absolute", inset: 0, background: "#c9a227", clipPath: CROWN }} />

        {/* Base band */}
        <div style={{ position: "absolute", left: 4, top: 23, width: 24, height: 4, background: "#b8891a", borderRadius: 1 }} />

        {/* Center jewel — red */}
        <div style={{ position: "absolute", left: 14, top: 7.5, width: 4, height: 4, borderRadius: "50%", background: "#d44c2d" }} />

        {/* Left jewel — blue */}
        <div style={{ position: "absolute", left: 6.5, top: 11.5, width: 3, height: 3, borderRadius: "50%", background: "#0e68ab" }} />

        {/* Right jewel — green */}
        <div style={{ position: "absolute", left: 22.5, top: 11.5, width: 3, height: 3, borderRadius: "50%", background: "#00733e" }} />
      </div>
    ),
    { ...size }
  )
}
