import type { Metadata } from "next"
import { Cinzel, Raleway } from "next/font/google"
import "./globals.css"

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
  variable: "--font-cinzel",
  display: "swap",
})

const raleway = Raleway({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-raleway",
  display: "swap",
})

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://random-edh-commander-generator.vercel.app")

export const metadata: Metadata = {
  title: {
    default: "Random EDH Commander Generator",
    template: "%s · Random EDH",
  },
  description:
    "Spin the slot machine and discover your next Magic: The Gathering Commander. Filter by color identity, explore rarity tiers, and build your deck.",
  keywords: [
    "MTG commander generator", "random EDH commander", "Magic the Gathering commander picker",
    "EDH deck builder", "random commander MTG", "commander roulette", "MTG random card",
  ],
  metadataBase: new URL(SITE_URL),
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Random EDH Commander Generator",
    title: "Random EDH Commander Generator",
    description: "Spin the slot machine · Discover your next MTG Commander · Filter by color identity",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Random EDH Commander Generator" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Random EDH Commander Generator",
    description: "Spin the slot machine and discover your next MTG Commander 🎰",
    images: ["/opengraph-image"],
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  verification: {
    google: "kWhhjhePmb7OcS-MljPiJ1i3fQMkERU12fxj_15ENrs",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${cinzel.variable} ${raleway.variable}`}>
      <head>
        <meta name="theme-color" content="#0d0a12" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Random EDH" />
        <link rel="apple-touch-icon" href="/icon" />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
