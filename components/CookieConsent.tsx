"use client"

import { useState, useEffect } from "react"
import { GoogleAnalytics } from "@next/third-parties/google"
import { AnimatePresence, motion } from "framer-motion"

const STORAGE_KEY = "cookie_consent"
const GA_ID = "G-YC5WWRRPPY"

export default function CookieConsent() {
  const [consent, setConsent] = useState<"accepted" | "rejected" | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as "accepted" | "rejected" | null
    setConsent(stored)
  }, [])

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, "accepted")
    setConsent("accepted")
  }

  const reject = () => {
    localStorage.setItem(STORAGE_KEY, "rejected")
    setConsent("rejected")
  }

  return (
    <>
      {consent === "accepted" && <GoogleAnalytics gaId={GA_ID} />}

      <AnimatePresence>
        {consent === null && (
          <motion.div
            key="cookie-banner"
            role="dialog"
            aria-label="Cookie consent"
            className="fixed bottom-0 left-0 right-0 z-[60] px-4 pb-4 pt-0 flex justify-center"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
          >
            <div
              className="w-full max-w-xl rounded-2xl px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4"
              style={{
                background: "oklch(13% 0.009 285)",
                border: "1px solid oklch(72% 0.115 82 / 0.18)",
                boxShadow: "0 -4px 40px oklch(0% 0 0 / 0.5), 0 0 0 1px oklch(100% 0 0 / 0.04)",
              }}
            >
              <p
                className="flex-1 text-xs leading-relaxed"
                style={{ fontFamily: "var(--font-raleway)", color: "oklch(55% 0.006 285)" }}
              >
                Usamos cookies de análisis (Google Analytics) para entender cómo se usa la web y mejorarla.
                No se comparten datos personales.{" "}
              </p>

              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={reject}
                  className="px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors"
                  style={{
                    fontFamily: "var(--font-raleway)",
                    background: "transparent",
                    border: "1px solid oklch(100% 0 0 / 0.1)",
                    color: "oklch(38% 0.006 285)",
                  }}
                >
                  Rechazar
                </button>
                <button
                  onClick={accept}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all"
                  style={{
                    fontFamily: "var(--font-raleway)",
                    background: "oklch(72% 0.115 82 / 0.15)",
                    border: "1px solid oklch(72% 0.115 82 / 0.35)",
                    color: "var(--gold)",
                  }}
                >
                  Aceptar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
