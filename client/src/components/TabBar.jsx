import { useRef, useEffect } from 'react'
import { FONT_UI, FONT_MONO } from '../constants'

export default function TabBar({ tabs, activeId, onSelect, onClose }) {
  const scrollRef = useRef(null)
  const activeRef = useRef(null)

  useEffect(() => {
    if (activeRef.current) activeRef.current.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId])

  if (tabs.length === 0) return null

  return (
    <div ref={scrollRef} style={{
      display:'flex', alignItems:'stretch',
      height:'30px', minHeight:'30px',
      borderBottom:'1px solid var(--border)',
      background:'var(--bg)',
      overflowX:'auto', overflowY:'hidden',
      flexShrink:0,
    }}>
      {tabs.map(tab => {
        const isActive = tab.id === activeId
        const dirty = tab.isEditing && tab.editContent !== tab.content
        return (
          <div
            key={tab.id}
            ref={isActive ? activeRef : null}
            onClick={() => onSelect(tab.id)}
            onMouseDown={e => { if (e.button === 1) { e.preventDefault(); onClose(tab.id) } }}
            title={tab.file.path}
            style={{
              display:'flex', alignItems:'center', gap:'6px',
              padding:'0 10px 0 12px',
              borderRight:'1px solid var(--border)',
              background: isActive ? 'var(--surface)' : 'transparent',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              cursor:'pointer',
              minWidth:'80px', maxWidth:'220px',
              flexShrink:0,
              transition:'background 120ms',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface-2)' }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{
              fontFamily: FONT_UI, fontSize:'12px',
              color: isActive ? 'var(--text)' : 'var(--muted)',
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
              flex:1,
            }}>
              {tab.file.name}{dirty ? ' *' : ''}
            </span>
            <button
              onClick={e => { e.stopPropagation(); onClose(tab.id) }}
              title="Close (⌘W)"
              aria-label="Close tab"
              style={{
                background:'none', border:'none',
                color:'var(--muted)', cursor:'pointer',
                fontSize:'14px', lineHeight:1,
                padding:'0 2px', borderRadius:'3px',
                width:'18px', height:'18px',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontFamily: FONT_MONO,
                flexShrink:0,
              }}
              onMouseEnter={e => { e.currentTarget.style.background='var(--border)'; e.currentTarget.style.color='var(--text)' }}
              onMouseLeave={e => { e.currentTarget.style.background='none'; e.currentTarget.style.color='var(--muted)' }}
            >×</button>
          </div>
        )
      })}
    </div>
  )
}
