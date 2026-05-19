import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Random EDH Commander Generator",
    short_name: "Random EDH",
    description: "Spin the slot machine to discover your next Magic: The Gathering Commander",
    start_url: "/",
    display: "standalone",
    background_color: "#0d0a12",
    theme_color: "#0d0a12",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  }
}
