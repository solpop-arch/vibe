import { FONT_MONO } from '../constants'
import { CollapsibleSection } from './DashboardSection'

export const LINK_HEALTH_LIMIT = 5
const relPathFrom = (abs, root) => (abs && root && abs.startsWith(root + '/') ? abs.slice(root.length + 1) : abs || '')
const open = (onFileOpen, path) => onFileOpen({ path, name: path.split('/').pop(), isDirectory: false })
const subLabel = { fontSize:'11px', fontWeight:600, color:'var(--text)', margin:'0 0 6px', letterSpacing:'0.02em' }
const more = (n) => n > 0 && <div style={{ fontFamily:FONT_MONO, fontSize:'11px', color:'var(--muted)', padding:'4px 8px' }}>+{n} more</div>

// Broken links + orphan docs in one collapsed block; the summary line is the whole
// story while everything is fine. Hidden entirely when both lists are empty.
export default function LinkHealth({ brokenLinks, orphanDocs, onFileOpen, rootPath }) {
  const broken = brokenLinks || []
  const orphans = orphanDocs || []
  if (broken.length === 0 && orphans.length === 0) return null
  const summary = [broken.length && `Broken ${broken.length}`, orphans.length && `Orphan ${orphans.length}`].filter(Boolean).join(' · ')
  return (
    <CollapsibleSection id="link-health" label="Link health" summary={summary}>
      <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
        {broken.length > 0 && (
          <div>
            <div style={subLabel}>Broken links</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
              {broken.slice(0, LINK_HEALTH_LIMIT).map((b, i) => (
                <div key={`${b.source}:${b.line}:${i}`} className="dash-row" onClick={() => open(onFileOpen, b.source)}
                  style={{ padding:'6px 8px', cursor:'pointer', borderLeft:'2px solid var(--error)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                    <span style={{ fontFamily:FONT_MONO, fontSize:'11.5px', color:'var(--accent)' }}>{relPathFrom(b.source, rootPath)}</span>
                    <span style={{ fontFamily:FONT_MONO, fontSize:'11px', color:'var(--muted)' }}>:{b.line}</span>
                    <span style={{ fontSize:'10px', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{b.kind}</span>
                  </div>
                  <div style={{ fontFamily:FONT_MONO, fontSize:'11.5px', color:'var(--error)', marginTop:'2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>→ {b.rawHref}</div>
                </div>
              ))}
              {more(broken.length - LINK_HEALTH_LIMIT)}
            </div>
          </div>
        )}
        {orphans.length > 0 && (
          <div>
            <div style={subLabel}>Orphan docs</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
              {orphans.slice(0, LINK_HEALTH_LIMIT).map(p => (
                <div key={p} className="dash-row dash-orphan" onClick={() => open(onFileOpen, p)}
                  style={{ fontFamily:FONT_MONO, fontSize:'12px', padding:'5px 8px', cursor:'pointer', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {relPathFrom(p, rootPath)}
                </div>
              ))}
              {more(orphans.length - LINK_HEALTH_LIMIT)}
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}
