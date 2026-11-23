import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Newer Node versions ship an experimental global `localStorage` that shadows jsdom's
// and is unusable without --localstorage-file. Install a plain in-memory Storage instead.
if (typeof window !== 'undefined') {
  const makeStorage = () => {
    let m = new Map()
    return {
      getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
      setItem: (k, v) => { m.set(String(k), String(v)) },
      removeItem: (k) => { m.delete(String(k)) },
      clear: () => { m = new Map() },
      key: (i) => [...m.keys()][i] ?? null,
      get length() { return m.size },
    }
  }
  Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  Object.defineProperty(globalThis, 'localStorage', { value: window.localStorage, configurable: true })
}

afterEach(() => {
  cleanup()
  if (typeof localStorage !== 'undefined') localStorage.clear()
})
