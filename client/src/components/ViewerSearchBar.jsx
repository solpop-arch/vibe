import { FONT_MONO } from '../constants'

const ViewerSearchBar = ({ inputRef, query, onQueryChange, currentMatchIdx, totalMatches, onNext, onPrev, onClose }) => (
    <div style={{ height:'32px', minHeight:'32px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 16px', gap:'8px', flexShrink:0, background:'var(--surface-2)' }}>
      <input
        ref={inputRef}
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? onPrev() : onNext() }
          else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            e.nativeEvent.stopImmediatePropagation()
            onClose()
          }
        }}
        placeholder="Search…"
        spellCheck={false}
        style={{ flex:'0 1 240px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'4px', padding:'4px 8px', fontSize:'12px', fontFamily:FONT_MONO, color:'var(--text)', outline:'none' }}
      />
      <span style={{ fontSize:'11px', color:'var(--muted)', fontFamily:FONT_MONO, minWidth:'48px' }}>
        {query ? `${totalMatches > 0 ? currentMatchIdx + 1 : 0}/${totalMatches}` : ''}
      </span>
      <button onClick={onPrev} disabled={totalMatches === 0} style={{ background:'none', border:'none', color: totalMatches > 0 ? 'var(--text)' : 'var(--muted)', cursor:'pointer', fontSize:'12px', padding:'4px 6px', lineHeight:1 }}>&#x25B2;</button>
      <button onClick={onNext} disabled={totalMatches === 0} style={{ background:'none', border:'none', color: totalMatches > 0 ? 'var(--text)' : 'var(--muted)', cursor:'pointer', fontSize:'12px', padding:'4px 6px', lineHeight:1 }}>&#x25BC;</button>
      <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'14px', padding:'4px 6px', lineHeight:1 }}>&times;</button>
    </div>
)

export default ViewerSearchBar
