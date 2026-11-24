import { useState, useCallback } from 'react'
import { SECTION_LABEL, DIVIDER, FONT_MONO } from '../constants'

const OPEN_KEY = 'vibe-dashboard-open'  // ids of sections the user expanded

export function loadOpen() { try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY))) } catch { return new Set() } }
function saveOpen(set) { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...set])) } catch { /* private mode */ } }

// Section with a clickable label. `summary` stays visible while collapsed so a closed
// section still says what is inside (e.g. "Broken 3 · Orphan 5").
export function CollapsibleSection({ id, label, summary, defaultOpen = false, divider = true, children }) {
  const [open, setOpen] = useState(() => {
    const saved = loadOpen()
    return saved.has(id) ? true : saved.has('-' + id) ? false : defaultOpen
  })
  const toggle = useCallback(() => {
    setOpen(prev => {
      const next = !prev
      const saved = loadOpen()
      saved.delete(id); saved.delete('-' + id)
      saved.add(next ? id : '-' + id)
      saveOpen(saved)
      return next
    })
  }, [id])
  return (
    <>
      {divider && <hr style={DIVIDER} />}
      <div>
        <button onClick={toggle} aria-expanded={open}
          style={{ ...SECTION_LABEL, marginBottom: open ? '8px' : 0, display:'flex', alignItems:'center', gap:'8px', width:'100%', background:'none', border:'none', padding:0, cursor:'pointer', textAlign:'left' }}>
          <span style={{ fontSize:'8px', opacity:0.5, display:'inline-block', transform: open ? 'rotate(0)' : 'rotate(-90deg)', transition:'transform 150ms' }}>▼</span>
          <span>{label}</span>
          {summary && <span style={{ fontFamily:FONT_MONO, textTransform:'none', letterSpacing:0, fontSize:'11px' }}>{summary}</span>}
        </button>
        {open && children}
      </div>
    </>
  )
}
