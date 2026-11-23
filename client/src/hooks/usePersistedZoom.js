import { useState, useEffect } from 'react'

const MIN = 0.5
const MAX = 3
const STEP = 0.1
const round2 = (n) => Math.round(n * 100) / 100

const loadZoom = (storageKey) => {
  const n = parseFloat(localStorage.getItem(storageKey))
  return Number.isFinite(n) && n >= MIN && n <= MAX ? n : 1
}

// Zoom level persisted in localStorage. While `active`, Cmd/Ctrl +/= zooms in,
// Cmd/Ctrl - zooms out and Cmd/Ctrl 0 resets (clamped to 0.5–3).
export function usePersistedZoom(storageKey, active) {
  const [zoom, setZoom] = useState(() => loadZoom(storageKey))
  useEffect(() => { localStorage.setItem(storageKey, String(zoom)) }, [storageKey, zoom])

  useEffect(() => {
    if (!active) return
    const handle = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        setZoom(z => Math.min(MAX, round2(z + STEP)))
      } else if (e.key === '-') {
        e.preventDefault()
        setZoom(z => Math.max(MIN, round2(z - STEP)))
      } else if (e.key === '0') {
        e.preventDefault()
        setZoom(1)
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [active])

  return zoom
}
