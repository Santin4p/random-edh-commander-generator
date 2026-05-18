# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Random EDH Commander Generator** — a dark-fantasy slot-machine web app for Magic: The Gathering's Commander format. Users spin a roulette of cards and get a random legendary creature as their commander suggestion, with color-identity filtering and localStorage-based saving.

## Commands

```bash
npm run dev      # start dev server (localhost:3000)
npm run build    # production build
npm run lint     # ESLint
npm run start    # serve production build
```

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind v4** + **Framer Motion**
- **Scryfall API** — all card data; no API key required, free, CORS-open
- **localStorage** — persists saved commanders client-side; no backend or auth in v1

> ⚠️ This project uses Next.js 16 and Tailwind v4, which have breaking changes from earlier versions. Read `AGENTS.md` before writing any code.

## Architecture

```
app/
  layout.tsx        # root layout — fonts, metadata, global styles
  page.tsx          # home page — the slot machine UI lives here
  globals.css       # Tailwind base + CSS variables for the dark-fantasy theme
```

**Planned structure (build into this):**

```
app/
  page.tsx                    # main roulette page
  saved/page.tsx              # saved commanders list (localStorage)
lib/
  scryfall.ts                 # all Scryfall API calls (fetch wrappers)
  storage.ts                  # localStorage read/write for saved commanders
components/
  SlotMachine.tsx             # Framer Motion card carousel animation
  CommanderCard.tsx           # card reveal — image, abilities, action buttons
  ColorFilter.tsx             # WUBRG color identity selector
```

## Scryfall API

Base URL: `https://api.scryfall.com`

Key queries for this project:
- All commanders: `GET /cards/search?q=is%3Acommander&order=name`
- Filter by color identity: append `+color%3C%3DWUBRG` (replace with selected colors)
- Full docs: https://scryfall.com/docs/api

Scryfall paginates at 175 cards/page — use `has_more` + `next_page` to fetch all results. Cache the commander list in memory for the session to avoid repeat fetches.

## Key product decisions

- **Visual identity:** dark fantasy — dark backgrounds, display/serif typography, subtle particle effects
- **Mobile-first** responsive design
- **Slot machine animation:** horizontal card carousel (Framer Motion) that decelerates and stops on the selected commander
- **Color filter:** maps to Scryfall `color_identity` — multi-select WUBRG, no selection = any color
- **Commander reveal:** full card image + oracle text + two external links: EDHREC and Scryfall card page
- **Saving:** array of Scryfall card objects in `localStorage` key `saved_commanders`
- **No ads, no auth, no backend** in v1

## External links format

- EDHREC: `https://edhrec.com/commanders/[card-name-hyphenated]`
- Scryfall card page: use `card.scryfall_uri` from API response
