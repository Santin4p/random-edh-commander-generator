import type { Metadata } from "next"
import { Cinzel, Raleway } from "next/font/google"
import "./globals.css"

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
  variable: "--font-cinzel",
  display: "swap",
})

// Raleway: elegant geometric sans — pairs with Cinzel's classical weight
const raleway = Raleway({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-raleway",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Random EDH Commander Generator",
  description:
    "Spin the roulette and discover your next Magic: The Gathering Commander. The ultimate random EDH commander picker.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${cinzel.variable} ${raleway.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
