import { memo, useState, useCallback, useMemo } from 'react'
import { FONT_MONO, FONT_SERIF, SECTION_LABEL, DIVIDER, getDocIcon, gitBadgeFor, gitStateLabel } from '../constants'
import GraphView from './GraphView'
import ChangedFiles from './ChangedFiles'
import LinkHealth from './LinkHealth'
import { subGroups } from '../docGroups'

const EXPANDED_KEY    = 'vibe-dashboard-expanded'  // folder groups the user opened (all start closed)
const CLOSED_SUBS_KEY = 'vibe-dashboard-closed-subs'  // sub-folders the user closed (open by default)
const PINNED_KEY      = 'vibe-dashboard-pinned'
const SUB_LABEL = { fontSize:'11px', fontWeight:600, color:'var(--text)', marginBottom:'8px', letterSpacing:'0.02em' }
function loadExpanded() { try { return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY))) } catch { return new Set() } }
function saveExpanded(set) { localStorage.setItem(EXPANDED_KEY, JSON.stringify([...set])) }
function loadClosedSubs() { try { return new Set(JSON.parse(localStorage.getItem(CLOSED_SUBS_KEY))) } catch { return new Set() } }
function saveClosedSubs(set) { localStorage.setItem(CLOSED_SUBS_KEY, JSON.stringify([...set])) }
function loadPinned()    { try { return new Set(JSON.parse(localStorage.getItem(PINNED_KEY)))    } catch { return new Set() } }
function savePinned(set) { localStorage.setItem(PINNED_KEY,    JSON.stringify([...set])) }

function DocItem({ doc, gitInfo, isPinned, onTogglePin, onFileOpen, age, hideDir }) {
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
        {doc.relDir && !hideDir && <div style={{ fontFamily:FONT_MONO, fontSize:'11px', color:'var(--muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{doc.relDir}/</div>}
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

function ProjectDashboard({ data, recentChanges, brokenLinks, orphanDocs, graphData, onFileOpen, onRefresh, refreshing, justRefreshed, gitInfo }) {
  const handleGraphNodeClick = useCallback((absPath) => {
    onFileOpen({ path: absPath, name: absPath.split('/').pop(), isDirectory: false })
  }, [onFileOpen])

  const [expanded, setExpanded] = useState(loadExpanded)
  const [pinned, setPinned] = useState(loadPinned)
  const [closedSubs, setClosedSubs] = useState(loadClosedSubs)
  const toggleSub = useCallback((key) => {
    setClosedSubs(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      saveClosedSubs(next)
      return next
    })
  }, [])

  const toggleGroup = useCallback((groupName) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(groupName) ? next.delete(groupName) : next.add(groupName)
      saveExpanded(next)
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
  // Group every doc under its top-level folder, newest first.
  const folderGroups = useMemo(() => {
    const map = new Map()
    for (const d of allDocs) {
      const key = d.parentDir || ''  // '' = project root
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(d)
    }
    const groups = [...map.entries()].map(([folder, items]) => {
      const sorted = items.sort((a, b) => (b.modifiedMs || 0) - (a.modifiedMs || 0))
      return { folder, items: sorted, total: sorted.length }
    })
    groups.sort((a, b) => a.folder === '' ? -1 : b.folder === '' ? 1 : a.folder.localeCompare(b.folder))
    return groups
  }, [allDocs])

  if (!data) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--muted)', fontSize:'13px' }}>Loading…</div>
  const { projectName, projectPath, totalFiles, fileTimes } = data
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

      <ChangedFiles gitInfo={gitInfo} recentChanges={recentChanges} fileTimes={fileTimes} onFileOpen={onFileOpen} rootPath={projectPath} />

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
              {pinnedDocs.length > 0 && <div style={SUB_LABEL}>By Folder</div>}
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                {folderGroups.map(group => {
                  const key = group.folder || '__root'
                  const label = group.folder === '' ? '(root)' : group.folder + '/'
                  const isCollapsed = !expanded.has(key)
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
                      {!isCollapsed && subGroups(group.items, group.folder).map(sub => {
                        const subClosed = sub.key !== '' && closedSubs.has(sub.key)
                        return (
                          <div key={sub.key || '__direct'} style={sub.key ? { paddingLeft:'12px' } : undefined}>
                            {sub.key !== '' && (
                              <div onClick={() => toggleSub(sub.key)}
                                onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                                onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
                                style={{ fontFamily:FONT_MONO, fontSize:'11px', color:'var(--muted)', margin:'6px 0 2px', paddingLeft:'4px', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px', transition:'color 100ms' }}>
                                <span style={{ fontSize:'8px', opacity:0.4, display:'inline-block', transform: subClosed ? 'rotate(-90deg)' : 'rotate(0)', transition:'transform 150ms' }}>▼</span>
                                {sub.label}
                                <span style={{ fontSize:'10px', opacity:0.6 }}>({sub.items.length})</span>
                              </div>
                            )}
                            {!subClosed && sub.items.map(doc => (
                              <DocItem key={doc.path} doc={doc} gitInfo={gitInfo} isPinned={pinned.has(doc.path)} onTogglePin={togglePin} onFileOpen={onFileOpen} hideDir />
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>

          </div>
        </div>
      )}

      <LinkHealth brokenLinks={brokenLinks} orphanDocs={orphanDocs} onFileOpen={onFileOpen} rootPath={projectPath} />

      {graphData && graphData.nodes.length > 1 && (
        <>
        <hr style={DIVIDER} />
        <div>
          <div style={SECTION_LABEL}>Link Graph ({graphData.nodes.length})</div>
          <div style={{ height:'360px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'8px', overflow:'hidden', position:'relative' }}>
            <GraphView data={graphData} onNodeClick={handleGraphNodeClick} />
          </div>
        </div>
        </>
      )}
    </div>
  )
}

export default memo(ProjectDashboard)
