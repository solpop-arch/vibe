import { FONT_MONO, SECTION_LABEL, EXT_TO_LANG, LANG_COLORS, formatAge, gitBadgeFor, gitStateLabel } from '../constants'

export const CHANGED_LIMIT = 12
const basename = (p) => p.split('/').pop()
const relFrom = (abs, root) => (root && abs.startsWith(root + '/') ? abs.slice(root.length + 1) : abs)

// Dirty git files, newest first. Time comes from the live watcher list when present,
// else from the last full scan; deleted files have no time and sort last.
export function buildChangedList(gitInfo, recentChanges, fileTimes) {
  const live = new Map((recentChanges || []).map(r => [r.path, r.time]))
  const items = []
  for (const [path, state] of gitInfo?.filesByAbs ?? []) {
    items.push({ path, name: basename(path), state, time: live.get(path) ?? fileTimes?.get(path) ?? 0 })
  }
  items.sort((a, b) => b.time - a.time || a.path.localeCompare(b.path))
  return items
}

const rowStyle = { display:'flex', alignItems:'center', gap:'8px', padding:'5px 8px' }
const ageStyle = { fontFamily:FONT_MONO, fontSize:'10px', color:'var(--muted)', flexShrink:0 }

// Leading block of the dashboard: what changed since the last commit. Falls back to
// "recently modified" files when there is no git repo or the tree is clean.
export default function ChangedFiles({ gitInfo, recentChanges, fileTimes, onFileOpen, rootPath }) {
  const changed = gitInfo?.isRepo ? buildChangedList(gitInfo, recentChanges, fileTimes) : []
  const drag = (path) => (e) => { e.dataTransfer.setData('text/plain', path); e.dataTransfer.effectAllowed = 'copy' }

  if (changed.length > 0) {
    const shown = changed.slice(0, CHANGED_LIMIT)
    return (
      <div>
        <div style={SECTION_LABEL}>Changed ({changed.length})</div>
        <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
          {shown.map(item => {
            const badge = gitBadgeFor(item.state)
            const gone = item.state === 'deleted'
            const dir = relFrom(item.path, rootPath).split('/').slice(0, -1).join('/')
            return (
              <div key={item.path} className={gone ? undefined : 'dash-row'}
                onClick={gone ? undefined : () => onFileOpen({ path: item.path, name: item.name, isDirectory: false })}
                draggable={!gone} onDragStart={gone ? undefined : drag(item.path)}
                style={{ ...rowStyle, cursor: gone ? 'default' : 'pointer', opacity: gone ? 0.6 : 1 }}>
                {badge && <span title={gitStateLabel(item.state)} style={{ fontFamily:FONT_MONO, fontSize:'12px', color:badge.color, flexShrink:0, width:'12px', textAlign:'center', lineHeight:1 }}>{badge.glyph}</span>}
                <span style={{ fontSize:'13px', color:'var(--text)', textDecoration: gone ? 'line-through' : 'none', whiteSpace:'nowrap' }}>{item.name}</span>
                {dir && <span style={{ fontFamily:FONT_MONO, fontSize:'11px', color:'var(--muted)', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{dir}/</span>}
                {!dir && <span style={{ flex:1 }} />}
                {item.time > 0 && <span style={ageStyle}>{formatAge(item.time)}</span>}
              </div>
            )
          })}
          {changed.length > shown.length && (
            <div style={{ ...rowStyle, fontFamily:FONT_MONO, fontSize:'11px', color:'var(--muted)' }}>+{changed.length - shown.length} more</div>
          )}
        </div>
      </div>
    )
  }

  if (!recentChanges || recentChanges.length === 0) return null
  return (
    <div>
      <div style={SECTION_LABEL}>Recently modified</div>
      <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
        {recentChanges.map((item, i) => {
          const ext = item.name.split('.').pop()?.toLowerCase() || ''
          const dotColor = LANG_COLORS[EXT_TO_LANG[ext] || 'Other'] || LANG_COLORS.Other
          return (
            <div key={item.path + i} className="dash-row" onClick={() => onFileOpen(item)} draggable onDragStart={drag(item.path)}
              style={{ ...rowStyle, cursor:'pointer' }}>
              <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:dotColor, flexShrink:0 }} />
              <span style={{ fontSize:'13px', color:'var(--text)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</span>
              <span style={ageStyle}>{formatAge(item.time)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
