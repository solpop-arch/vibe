import { getIcon, getIndent, gitBadgeFor, gitStateLabel, FONT_MONO, FONT_SERIF, FONT_UI } from '../constants'

const ExplorerRow = ({ item, isActive, highlight, isExpanded, isChanged, dirtyDirs, gitFiles, onSelect, onHoverChange }) => {
  const padL = getIndent(item.depth)
  const icon = getIcon(item.name)
  return (
      <div
        draggable={!item.isDirectory}
        onDragStart={e => { e.dataTransfer.setData('text/plain', item.path); e.dataTransfer.effectAllowed = 'copy' }}
        onClick={onSelect}
        onMouseEnter={() => onHoverChange(item.path)}
        onMouseLeave={() => onHoverChange(null)}
        style={{
          display:'flex', alignItems:'center', gap:'10px',
          padding: `3px 16px 3px ${padL}px`,
          cursor:'pointer', userSelect:'none', position:'relative',
          whiteSpace:'nowrap', overflow:'hidden',
          background: highlight ? 'var(--surface-2)' : 'transparent',
          borderLeft: highlight ? '2px solid var(--accent)' : '2px solid transparent',
          transition:'background 75ms, border-color 75ms',
        }}
      >
        {isActive && (
          <span style={{ position:'absolute', left:'5px', top:'50%', transform:'translateY(-50%)', width:'5px', height:'5px', borderRadius:'50%', background:'var(--accent)' }} />
        )}

        {item.isDirectory ? (
          <span style={{ fontSize:'13px', color:'var(--text)', width:'14px', flexShrink:0, display:'inline-block', textAlign:'center', transition:'transform 150ms', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
        ) : (
          <span style={{ fontSize:'11px', color:'var(--muted)', width:'14px', flexShrink:0, textAlign:'center', fontStyle:'normal' }}>{icon.ch}</span>
        )}

        <span style={{
          overflow:'hidden', textOverflow:'ellipsis', flex:1,
          fontFamily: item.isDirectory ? FONT_SERIF : FONT_UI,
          fontStyle: item.isDirectory ? 'italic' : 'normal',
          fontSize: item.isDirectory ? '14px' : '13px',
          fontWeight: 400, lineHeight: item.isDirectory ? '1.4' : '1.5',
          color: isActive ? 'var(--accent)' : 'var(--text)',
        }}>
          {item.name}{item.isDirectory ? '/' : ''}
        </span>

        {(() => {
          // File: direct git state. Directory: bubble up if collapsed and has dirty descendants.
          let badge = null
          let title = ''
          if (item.isDirectory) {
            const dirState = !isExpanded ? dirtyDirs?.get(item.path) : undefined
            if (dirState) {
              badge = gitBadgeFor(dirState)
              title = 'contains changes'
            }
          } else {
            const gitState = gitFiles?.get(item.path)
            badge = gitBadgeFor(gitState)
            title = gitStateLabel(gitState)
          }
          if (!badge) return null
          return (
            <span title={title} style={{ fontFamily:FONT_MONO, fontSize:'12px', color:badge.color, flexShrink:0, width:'12px', textAlign:'center', lineHeight:1 }}>
              {badge.glyph}
            </span>
          )
        })()}

        {isChanged && (
          <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', background:'var(--accent-sub)', color:'var(--accent)', fontSize:'10px', padding:'1px 6px', borderRadius:'4px', flexShrink:0, animation:'badge-pulse 2s ease-in-out infinite', border:'1px solid color-mix(in srgb, var(--accent) 25%, transparent)' }}>
            <span style={{ width:'4px', height:'4px', borderRadius:'50%', background:'var(--accent)' }} />
          </span>
        )}
      </div>
  )
}

export default ExplorerRow
