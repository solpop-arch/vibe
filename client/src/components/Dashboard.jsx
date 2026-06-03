import { memo, useState, useCallback, useMemo } from 'react'
import { FONT_MONO, FONT_SERIF, FONT_UI, SECTION_LABEL, DIVIDER, EXT_TO_LANG, LANG_COLORS, formatAge, getDocIcon, gitBadgeFor, gitStateLabel } from '../constants'
import GraphView from './GraphView'

const COLLAPSED_KEY   = 'vibe-dashboard-collapsed'
const PINNED_KEY      = 'vibe-dashboard-pinned'
const RECENT_FILTER_KEY = 'vibe-recent-filter'  // 'all' | 'docs'
const DOCS_RECENT_LIMIT = 8  // docs shown in the "Recently Changed" subsection
const DOCS_PER_FOLDER   = 5  // most-recent docs shown per top-level folder
const SUB_LABEL = { fontSize:'11px', fontWeight:600, color:'var(--text)', marginBottom:'8px', letterSpacing:'0.02em' }
function loadCollapsed() { try { return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY))) } catch { return new Set() } }
function saveCollapsed(set) { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set])) }
function loadPinned()    { try { return new Set(JSON.parse(localStorage.getItem(PINNED_KEY)))    } catch { return new Set() } }
function savePinned(set) { localStorage.setItem(PINNED_KEY,    JSON.stringify([...set])) }

function DocItem({ doc, gitInfo, isPinned, onTogglePin, onFileOpen, age }) {
  const icon = getDocIcon(doc.name)
  const gitState = gitInfo?.filesByAbs?.get(doc.path)
  const badge = gitBadgeFor(gitState)
  return (
    <div
      className="dash-row dash-doc"
      onClick={() => onFileOpen(doc)}
      draggable onDragStart={e => { e.dataTransfer.setData('text/plain', doc.path); e.dataTransfer.effectAllowed = 'copy' }}
      style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 8px', cursor:'pointer' }}>
      <span style={{ fontSize:'14px', width:'20px', textAlign:'center', flexShrink:0, color:'var(--muted)' }}>{icon}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'13px', fontWeight:500, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.name}</div>
        {doc.relDir && <div style={{ fontFamily:FONT_MONO, fontSize:'11px', color:'var(--muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{doc.relDir}/</div>}
      </div>
      <button
        className={`dash-pin${isPinned ? ' pinned' : ''}`}
        onClick={e => { e.stopPropagation(); onTogglePin(doc.path) }}
        title={isPinned ? 'Unpin' : 'Pin'}
        style={{ background:'none', border:'none', cursor:'pointer', padding:'0 2px', fontSize:'11px', flexShrink:0, lineHeight:1 }}>
        {isPinned ? '◆' : '◇'}
      </button>
      {badge && (
        <span title={gitStateLabel(gitState)} style={{ fontFamily:FONT_MONO, fontSize:'12px', color:badge.color, flexShrink:0, width:'12px', textAlign:'center', lineHeight:1 }}>{badge.glyph}</span>
      )}
      {age && (
        <span style={{ fontFamily:FONT_MONO, fontSize:'10px', color:'var(--muted)', flexShrink:0 }}>{age}</span>
      )}
      {doc.lineCount > 0 && (
        <span style={{ fontFamily:FONT_MONO, fontSize:'10px', color:'var(--muted)', flexShrink:0 }}>{doc.lineCount} lines</span>
      )}
    </div>
  )
}

function relPathFrom(abs, root) {
  if (!abs) return ''
  if (root && abs.startsWith(root + '/')) return abs.slice(root.length + 1)
  return abs
}

function BrokenLinksSection({ items, onFileOpen, rootPath }) {
  if (!items || items.length === 0) return null
  return (
    <>
      <hr style={DIVIDER} />
      <div>
        <div style={SECTION_LABEL}>Broken Links ({items.length})</div>
        <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
          {items.map((b, i) => (
            <div
              key={`${b.source}:${b.line}:${i}`}
              className="dash-row"
              onClick={() => onFileOpen({ path: b.source, name: b.source.split('/').pop(), isDirectory: false })}
              style={{ padding:'6px 8px', cursor:'pointer', borderLeft:'2px solid var(--error)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                <span style={{ fontFamily:FONT_MONO, fontSize:'11.5px', color:'var(--accent)' }}>{relPathFrom(b.source, rootPath)}</span>
                <span style={{ fontFamily:FONT_MONO, fontSize:'11px', color:'var(--muted)' }}>:{b.line}</span>
                <span style={{ fontSize:'10px', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{b.kind}</span>
              </div>
              <div style={{ fontFamily:FONT_MONO, fontSize:'11.5px', color:'var(--error)', marginTop:'2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                → {b.rawHref}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function OrphanDocsSection({ paths, onFileOpen, rootPath }) {
  if (!paths || paths.length === 0) return null
  return (
    <div>
      <div style={SECTION_LABEL}>Orphan Docs ({paths.length})</div>
      <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
        {paths.map((p) => (
          <div
            key={p}
            className="dash-row dash-orphan"
            onClick={() => onFileOpen({ path: p, name: p.split('/').pop(), isDirectory: false })}
            style={{ fontFamily:FONT_MONO, fontSize:'12px', padding:'5px 8px', cursor:'pointer', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {relPathFrom(p, rootPath)}
          </div>
        ))}
      </div>
    </div>
  )
}

function ProjectDashboard({ data, recentChanges, brokenLinks, orphanDocs, graphData, onFileOpen, onRefresh, refreshing, justRefreshed, gitInfo }) {
  const handleGraphNodeClick = useCallback((absPath) => {
    onFileOpen({ path: absPath, name: absPath.split('/').pop(), isDirectory: false })
  }, [onFileOpen])

  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const [pinned, setPinned] = useState(loadPinned)
  const [recentFilter, setRecentFilter] = useState(() => localStorage.getItem(RECENT_FILTER_KEY) || 'all')

  const toggleGroup = useCallback((groupName) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(groupName) ? next.delete(groupName) : next.add(groupName)
      saveCollapsed(next)
      return next
    })
  }, [])

  const togglePin = useCallback((path) => {
    setPinned(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      savePinned(next)
      return next
    })
  }, [])

  const allDocs = useMemo(() => data?.docs ?? [], [data])
  const pinnedDocs = useMemo(() => allDocs.filter(d => pinned.has(d.path)), [allDocs, pinned])
  const recentDocs = useMemo(
    () => [...allDocs].sort((a, b) => (b.modifiedMs || 0) - (a.modifiedMs || 0)).slice(0, DOCS_RECENT_LIMIT),
    [allDocs]
  )
  // Group every doc under its top-level folder; each folder keeps only its most
  // recently changed docs, but reports its full doc count.
  const folderGroups = useMemo(() => {
    const map = new Map()
    for (const d of allDocs) {
      const key = d.parentDir || ''  // '' = project root
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(d)
    }
    const groups = [...map.entries()].map(([folder, items]) => {
      const sorted = items.sort((a, b) => (b.modifiedMs || 0) - (a.modifiedMs || 0))
      return { folder, items: sorted.slice(0, DOCS_PER_FOLDER), total: sorted.length }
    })
    groups.sort((a, b) => a.folder === '' ? -1 : b.folder === '' ? 1 : a.folder.localeCompare(b.folder))
    return groups
  }, [allDocs])

  if (!data) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--muted)', fontSize:'13px' }}>Loading…</div>
  const { projectName, projectPath, totalFiles, totalFolders, langStats } = data
  const totalDocs = allDocs.length

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflowY:'auto', padding:'32px 48px', gap:'32px', userSelect:'text', WebkitUserSelect:'text' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'16px' }}>
        <div style={{ minWidth:0 }}>
          <div className="vibe-logo" style={{ fontSize:'26px', fontWeight:400 }}>{projectName}</div>
          <div style={{ fontFamily:FONT_MONO, fontSize:'11px', color:'var(--muted)', marginTop:'4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{projectPath}</div>
          <div style={{ fontFamily:FONT_MONO, fontSize:'11px', color:'var(--muted)', marginTop:'6px', display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
            {gitInfo?.isRepo && (
              <span style={{ display:'inline-flex', alignItems:'center', gap:'8px' }}>
                <span style={{ color:'var(--text)' }}>⎇ {gitInfo.branch || '(detached)'}</span>
                {gitInfo.dirtyCount > 0 ? (
                  <span style={{ color:'var(--accent)' }}>~ {gitInfo.dirtyCount} changed</span>
                ) : (
                  <span>clean</span>
                )}
              </span>
            )}
            <span style={{ display:'inline-flex', alignItems:'center', gap:'8px' }}>
              <span><span style={{ color:'var(--text)' }}>{totalFiles}</span> files</span>
              <span style={{ opacity:0.4 }}>·</span>
              <span><span style={{ color:'var(--text)' }}>{totalFolders}</span> folders</span>
              <span style={{ opacity:0.4 }}>·</span>
              <span><span style={{ color:'var(--text)' }}>{langStats.length}</span> langs</span>
              <span style={{ opacity:0.4 }}>·</span>
              <span><span style={{ color:'var(--text)' }}>{totalDocs}</span> docs</span>
            </span>
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh"
          onMouseEnter={e => { if (!refreshing) e.currentTarget.style.background = 'var(--surface-2)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          style={{ background:'transparent', border:'1px solid var(--border)', color:'var(--muted)', cursor: refreshing ? 'default' : 'pointer', padding:'6px', borderRadius:'6px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'background 150ms ease-out' }}>
          {justRefreshed ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: refreshing ? 'spin 650ms linear infinite' : 'none' }}>
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8"/>
              <path d="M21 3v5h-5"/>
            </svg>
          )}
        </button>
      </div>

      <hr style={DIVIDER} />

      {langStats.length > 0 && (
        <div>
          <div style={SECTION_LABEL}>Languages</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            {langStats.map(l => (
              <div key={l.name} style={{ display:'grid', gridTemplateColumns:'70px 1fr 44px', alignItems:'center', gap:'8px' }}>
                <span style={{ fontFamily:FONT_MONO, fontSize:'12px', color:'var(--text)' }}>{l.name}</span>
                <div style={{ height:'5px', background:'var(--surface-2)', borderRadius:'99px', overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${l.pct}%`, background:l.color, borderRadius:'99px', transition:'width 0.6s ease-out' }} />
                </div>
                <span style={{ fontFamily:FONT_MONO, fontSize:'10px', color:'var(--muted)', textAlign:'right' }}>{l.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <hr style={DIVIDER} />

      {allDocs.length > 0 && (
        <div>
          <div style={SECTION_LABEL}>Documents</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>

            {pinnedDocs.length > 0 && (
              <div>
                <div style={SUB_LABEL}>Pinned</div>
                {pinnedDocs.map(doc => (
                  <DocItem key={doc.path} doc={doc} gitInfo={gitInfo} isPinned onTogglePin={togglePin} onFileOpen={onFileOpen} />
                ))}
              </div>
            )}

            <div>
              <div style={SUB_LABEL}>Recently Changed</div>
              {recentDocs.map(doc => (
                <DocItem key={doc.path} doc={doc} gitInfo={gitInfo} isPinned={pinned.has(doc.path)} onTogglePin={togglePin} onFileOpen={onFileOpen} age={doc.modifiedMs ? formatAge(doc.modifiedMs) : null} />
              ))}
            </div>

            <div>
              <div style={SUB_LABEL}>By Folder</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                {folderGroups.map(group => {
                  const key = group.folder || '__root'
                  const label = group.folder === '' ? '(root)' : group.folder + '/'
                  const isCollapsed = collapsed.has(key)
                  return (
                    <div key={key}>
                      <div onClick={() => toggleGroup(key)}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
                        style={{ fontFamily:FONT_SERIF, fontStyle:'italic', fontSize:'12px', color:'var(--muted)', marginBottom:'4px', paddingLeft:'4px', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px', transition:'color 100ms' }}>
                        <span style={{ fontSize:'8px', opacity:0.4, display:'inline-block', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)', transition:'transform 150ms' }}>▼</span>
                        {label}
                        <span style={{ fontSize:'10px', fontFamily:FONT_MONO, fontStyle:'normal', opacity:0.6 }}>({group.total})</span>
                      </div>
                      {!isCollapsed && group.items.map(doc => (
                        <DocItem key={doc.path} doc={doc} gitInfo={gitInfo} isPinned={pinned.has(doc.path)} onTogglePin={togglePin} onFileOpen={onFileOpen} />
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>

          </div>
        </div>
      )}

      {(recentChanges?.length > 0) && (
        <>
          <hr style={DIVIDER} />
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
              <div style={{ ...SECTION_LABEL, marginBottom:0 }}>Recently Changed</div>
              <div style={{ display:'flex', gap:'2px', marginLeft:'auto' }}>
                {['all', 'docs'].map(f => (
                  <button key={f} onClick={() => { setRecentFilter(f); localStorage.setItem(RECENT_FILTER_KEY, f) }}
                    style={{ fontFamily:FONT_UI, fontSize:'10px', padding:'1px 6px', borderRadius:'3px', border:'1px solid var(--border)', cursor:'pointer', background: recentFilter === f ? 'var(--accent-sub)' : 'transparent', color: recentFilter === f ? 'var(--accent)' : 'var(--muted)' }}>
                    {f === 'all' ? 'All' : 'Docs'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
              {recentChanges
                .filter(item => recentFilter === 'all' || item.name.endsWith('.md'))
                .map((item, i) => {
                  const ext = item.name.split('.').pop()?.toLowerCase() || ''
                  const lang = EXT_TO_LANG[ext] || 'Other'
                  const dotColor = LANG_COLORS[lang] || LANG_COLORS.Other
                  const gitState = gitInfo?.filesByAbs?.get(item.path)
                  const badge = gitBadgeFor(gitState)
                  return (
                    <div key={item.path + i} className="dash-row" onClick={() => onFileOpen(item)}
                      draggable onDragStart={e => { e.dataTransfer.setData('text/plain', item.path); e.dataTransfer.effectAllowed = 'copy' }}
                      style={{ display:'flex', alignItems:'center', gap:'8px', padding:'5px 8px', cursor:'pointer' }}>
                      <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:dotColor, flexShrink:0 }} />
                      <span style={{ fontSize:'13px', color:'var(--text)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</span>
                      {badge && <span title={gitStateLabel(gitState)} style={{ fontFamily:FONT_MONO, fontSize:'12px', color:badge.color, flexShrink:0 }}>{badge.glyph}</span>}
                      <span style={{ fontFamily:FONT_MONO, fontSize:'10px', color:'var(--muted)', flexShrink:0 }}>{formatAge(item.time)}</span>
                      {item.lineCount > 0 && <span style={{ fontFamily:FONT_MONO, fontSize:'10px', color:'var(--muted)', flexShrink:0 }}>{item.lineCount} lines</span>}
                    </div>
                  )
                })}
            </div>
          </div>
        </>
      )}

      <BrokenLinksSection items={brokenLinks} onFileOpen={onFileOpen} rootPath={data.projectPath} />

      <OrphanDocsSection paths={orphanDocs} onFileOpen={onFileOpen} rootPath={data.projectPath} />

      {graphData && graphData.nodes.length > 1 && (
        <div>
          <div style={SECTION_LABEL}>Link Graph ({graphData.nodes.length})</div>
          <div style={{ height:'360px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'8px', overflow:'hidden', position:'relative' }}>
            <GraphView data={graphData} onNodeClick={handleGraphNodeClick} />
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(ProjectDashboard)
