import { FONT_MONO, FONT_UI } from '../constants'

const NavBtn = ({ onClick, enabled, title, label, glyph }) => (
  <button onClick={onClick} disabled={!enabled} title={title} aria-label={label}
    onMouseEnter={e => { if (enabled) e.currentTarget.style.color = 'var(--accent)' }}
    onMouseLeave={e => { if (enabled) e.currentTarget.style.color = 'var(--muted)' }}
    style={{ background:'none', border:'none', color: enabled ? 'var(--muted)' : 'var(--border)', cursor: enabled ? 'pointer' : 'default', fontSize:'18px', lineHeight:1, padding:'0 6px', opacity: enabled ? 1 : 0.35, fontFamily: FONT_UI, transition:'color 150ms' }}>
    {glyph}
  </button>
)

const ViewerHeader = ({
  selectedFile, langBadge, skipHighlight, isDirty, isEditing, isMd, mdTab, onMdTabChange,
  externallyChanged, onReload, diffMode, diffSideBySide, onToggleSideBySide,
  gitDirty, onEnterDiff, onExitDiff, onEnterEdit, onExitEdit, onSave,
  copied, onCopy, lineCount, onClose, onBack, onForward, canBack, canForward,
}) => (
  <>
  <div style={{ height:'34px', minHeight:'34px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 16px', gap:'16px', flexShrink:0 }}>
    <div style={{ display:'flex', alignItems:'center', gap:'2px', flexShrink:0, marginRight:'-8px' }}>
      <NavBtn onClick={onBack}    enabled={canBack}    title="Back (⌘[ or ⌘←)"    label="Back"    glyph="‹" />
      <NavBtn onClick={onForward} enabled={canForward} title="Forward (⌘] or ⌘→)" label="Forward" glyph="›" />
    </div>
    <span style={{ fontSize:'13px', fontWeight:500, color: isDirty ? 'var(--accent)' : 'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', transition:'color 150ms' }}>
      {selectedFile?.name}{isDirty ? ' *' : ''}
    </span>
    <span style={{ fontSize:'10px', color:'var(--muted)', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'4px', padding:'1px 6px', fontFamily:FONT_MONO, flexShrink:0 }}>{langBadge}</span>
    {skipHighlight && (
      <span title="Syntax highlighting disabled for files over 1MB" style={{ fontSize:'10px', color:'var(--muted)', fontFamily:FONT_MONO, flexShrink:0, opacity:0.6 }}>plain</span>
    )}

    {isEditing && isMd && (
      <div style={{ display:'flex' }}>
        {['edit','preview'].map(tab => (
          <button key={tab} onClick={() => onMdTabChange(tab)} style={{ background:'none', border:'none', padding:'4px 12px', fontSize:'12px', cursor:'pointer', color: mdTab === tab ? 'var(--accent)' : 'var(--muted)', borderBottom: mdTab === tab ? '2px solid var(--accent)' : '2px solid transparent', fontFamily:FONT_UI }}>
            {tab === 'edit' ? 'Edit' : 'Preview'}
          </button>
        ))}
      </div>
    )}

    {externallyChanged && (
      <span onClick={onReload} title="Press L to reload" style={{ fontSize:'10px', color:'var(--warning, #b8860b)', background:'var(--warning-sub, #fdf6e3)', padding:'1px 6px', borderRadius:'4px', cursor:'pointer', flexShrink:0, fontFamily:FONT_UI }}>
        changed externally
      </span>
    )}

    <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'8px' }}>
      {isEditing ? (
        <>
          <button onClick={onSave} disabled={!isDirty} style={{ background: isDirty ? 'var(--accent-sub)' : 'transparent', border:`1px solid ${isDirty ? 'var(--accent)' : 'var(--border)'}`, color: isDirty ? 'var(--accent)' : 'var(--muted)', cursor: isDirty ? 'pointer' : 'default', fontSize:'11px', padding:'2px 8px', borderRadius:'4px', fontFamily:FONT_UI }}>Save</button>
          <button onClick={onExitEdit} style={{ background:'none', border:'1px solid var(--border)', color:'var(--muted)', cursor:'pointer', fontSize:'11px', padding:'2px 8px', borderRadius:'4px', fontFamily:FONT_UI }}>Exit</button>
        </>
      ) : diffMode ? (
        <>
          <button onClick={() => onToggleSideBySide()} title="Shift+D"
            style={{ background: diffSideBySide ? 'var(--accent-sub)' : 'none', border:`1px solid ${diffSideBySide ? 'var(--accent)' : 'var(--border)'}`, color: diffSideBySide ? 'var(--accent)' : 'var(--muted)', cursor:'pointer', fontSize:'11px', padding:'2px 8px', borderRadius:'4px', fontFamily:FONT_UI }}>
            {diffSideBySide ? 'Split' : 'Inline'}
          </button>
          <button onClick={onExitDiff} style={{ background:'none', border:'1px solid var(--border)', color:'var(--muted)', cursor:'pointer', fontSize:'11px', padding:'2px 8px', borderRadius:'4px', fontFamily:FONT_UI }}>V View</button>
        </>
      ) : (
        <>
          <button onClick={onCopy} title="Copy all"
            onMouseEnter={e => { e.currentTarget.style.background='var(--surface-2)'; e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.color='var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.background='none'; e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--muted)' }}
            style={{ background:'none', border:'1px solid var(--border)', color: copied ? 'var(--accent)' : 'var(--muted)', cursor:'pointer', fontSize:'11px', padding:'2px 8px', borderRadius:'4px', fontFamily:FONT_UI, transition:'all 150ms' }}>{copied ? 'Copied' : 'Copy'}</button>
          {gitDirty && (
            <button onClick={onEnterDiff} title="D Diff"
              onMouseEnter={e => { e.currentTarget.style.background='var(--surface-2)'; e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.color='var(--text)' }}
              onMouseLeave={e => { e.currentTarget.style.background='none'; e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--muted)' }}
              style={{ background:'none', border:'1px solid var(--border)', color:'var(--muted)', cursor:'pointer', fontSize:'11px', padding:'2px 8px', borderRadius:'4px', fontFamily:FONT_UI, transition:'all 150ms' }}>D Diff</button>
          )}
          <button onClick={onEnterEdit}
            onMouseEnter={e => { e.currentTarget.style.background='var(--surface-2)'; e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.color='var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.background='none'; e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--muted)' }}
            style={{ background:'none', border:'1px solid var(--border)', color:'var(--muted)', cursor:'pointer', fontSize:'11px', padding:'2px 8px', borderRadius:'4px', fontFamily:FONT_UI, transition:'all 150ms' }}>E Edit</button>
        </>
      )}
      <span style={{ fontFamily:FONT_MONO, fontSize:'11px', color:'var(--muted)', minWidth:'52px', textAlign:'right' }}>{lineCount} lines</span>
      <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'16px', lineHeight:1, padding:'0 2px' }}>&times;</button>
    </div>
  </div>
  </>
)

export default ViewerHeader
