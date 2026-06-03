import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import * as api from '../api'
import { resolveKey, getIcon, getIndent, gitBadgeFor, gitStateLabel, GIT_STATE_RANK, FONT_MONO, FONT_SERIF, FONT_UI } from '../constants'

const FileExplorer = ({ onFileSelect, isFocused, onFocus, innerRef, onAtRootChange, refreshKey, activeFilePath, changedFiles, gitFiles, gitInfo }) => {
  const [rootItems, setRootItems]           = useState([])
  const [expandedDirs, setExpandedDirs]     = useState(new Set())
  const [childrenCache, setChildrenCache]   = useState({})
  const [selectedIndex, setSelectedIndex]   = useState(0)
  const [naming, setNaming]                 = useState({ active:false, type:'', value:'', oldPath:'', parentPath:'' })
  const [hoveredPath, setHoveredPath]       = useState(null)
  const rootPathRef = useRef('')
  const inputRef    = useRef(null)

  // Flat list of currently visible items (with depth info)
  const visibleItems = useMemo(() => {
    const result = []
    const walk = (items, depth) => {
      for (const item of items) {
        result.push({ ...item, depth })
        if (item.isDirectory && expandedDirs.has(item.path)) {
          walk(childrenCache[item.path] || [], depth + 1)
        }
      }
    }
    walk(rootItems, 0)
    return result
  }, [rootItems, expandedDirs, childrenCache])

  // Clamp selection when tree collapses
  useEffect(() => {
    if (selectedIndex >= visibleItems.length && visibleItems.length > 0) {
      setSelectedIndex(visibleItems.length - 1)
    }
  }, [visibleItems.length, selectedIndex])

  // Reveal file in explorer: expand all parent dirs and select it
  useEffect(() => {
    if (!activeFilePath || !rootPathRef.current) return
    const root = rootPathRef.current
    if (!activeFilePath.startsWith(root)) return
    const rel = activeFilePath.slice(root.length + 1)
    const parts = rel.split('/')
    if (parts.length <= 1) return // root-level file, no dirs to expand
    const dirsToExpand = []
    for (let i = 0; i < parts.length - 1; i++) {
      dirsToExpand.push(root + '/' + parts.slice(0, i + 1).join('/'))
    }
    // Fetch children for dirs not yet cached, then expand all
    const fetchAndExpand = async () => {
      for (const dir of dirsToExpand) {
        if (!childrenCache[dir]) {
          try {
            const data = await api.listFiles(dir)
            setChildrenCache(prev => ({ ...prev, [dir]: data.items || [] }))
          } catch (_) {}
        }
      }
      setExpandedDirs(prev => {
        const n = new Set(prev)
        dirsToExpand.forEach(d => n.add(d))
        return n
      })
    }
    fetchAndExpand()
  }, [activeFilePath]) // eslint-disable-line

  // Scroll to active file after tree expansion
  useEffect(() => {
    if (!activeFilePath) return
    const idx = visibleItems.findIndex(v => v.path === activeFilePath)
    if (idx >= 0) setSelectedIndex(idx)
  }, [activeFilePath, visibleItems])

  // Bubble up: map of directory abs paths → 'new'|'changed' (changed wins over new).
  const dirtyDirs = useMemo(() => {
    const map = new Map()  // path → git state (highest priority wins)
    const root = rootPathRef.current
    if (!gitFiles || gitFiles.size === 0) return map
    for (const [absPath, state] of gitFiles.entries()) {
      let cur = absPath
      const lastSlash = cur.lastIndexOf('/')
      if (lastSlash < 0) continue
      cur = cur.slice(0, lastSlash)
      while (cur && cur !== root) {
        const prev = map.get(cur)
        const prevPri = prev !== undefined ? (GIT_STATE_RANK[prev] ?? Infinity) : Infinity
        const curPri  = GIT_STATE_RANK[state] ?? Infinity
        if (curPri < prevPri) map.set(cur, state)
        else if (prevPri === 0) break  // already at highest priority (deleted)
        const s = cur.lastIndexOf('/')
        if (s < 0) break
        cur = cur.slice(0, s)
      }
    }
    return map
  }, [gitFiles])

  // Fetch root
  const fetchRoot = useCallback(async () => {
    try {
      const data = await api.listFiles('')
      if (data.currentPath) rootPathRef.current = data.currentPath
      setRootItems(data.items || [])
      onAtRootChange(true)
    } catch (err) { console.error('Failed to fetch root:', err) }
  }, [onAtRootChange])

  useEffect(() => { fetchRoot() }, [fetchRoot])

  // Refresh on file changes
  useEffect(() => {
    if (refreshKey === 0) return
    const refresh = async () => {
      try {
        const data = await api.listFiles('')
        setRootItems(data.items || [])
        // Re-fetch open dirs
        const updates = {}
        await Promise.all(
          [...expandedDirs].map(async (dirPath) => {
            try {
              const sub = await api.listFiles(dirPath)
              updates[dirPath] = sub.items || []
            } catch (_) {}
          })
        )
        if (Object.keys(updates).length > 0) {
          setChildrenCache(prev => ({ ...prev, ...updates }))
        }
      } catch (_) {}
    }
    refresh()
  }, [refreshKey]) // eslint-disable-line

  // Toggle dir expand/collapse
  const toggleDir = useCallback(async (dirPath) => {
    if (expandedDirs.has(dirPath)) {
      setExpandedDirs(prev => { const n = new Set(prev); n.delete(dirPath); return n })
    } else {
      if (!childrenCache[dirPath]) {
        try {
          const data = await api.listFiles(dirPath)
          setChildrenCache(prev => ({ ...prev, [dirPath]: data.items || [] }))
        } catch (_) {}
      }
      setExpandedDirs(prev => new Set([...prev, dirPath]))
    }
  }, [expandedDirs, childrenCache])

  // Focus + initial selection on open. naming.value intentionally excluded — re-running
  // setSelectionRange on each keystroke would wipe typed input.
  useEffect(() => {
    if (naming.active && inputRef.current) {
      inputRef.current.focus()
      if (naming.type === 'rename') {
        const dot = naming.value.lastIndexOf('.')
        inputRef.current.setSelectionRange(0, dot > 0 ? dot : naming.value.length)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naming.active, naming.type])

  const handleNamingSubmit = async (e) => {
    e.preventDefault()
    if (!naming.value) { setNaming({ active:false }); return }
    try {
      if (naming.type === 'file' || naming.type === 'dir') {
        await api.createItem(naming.parentPath + '/' + naming.value, naming.type === 'dir')
        // Refresh parent in cache
        if (naming.parentPath !== rootPathRef.current) {
          const data = await api.listFiles(naming.parentPath)
          setChildrenCache(prev => ({ ...prev, [naming.parentPath]: data.items || [] }))
        } else {
          fetchRoot()
        }
      } else if (naming.type === 'rename') {
        const parentPath = naming.oldPath.substring(0, naming.oldPath.lastIndexOf('/'))
        await api.renameItem(naming.oldPath, parentPath + '/' + naming.value)
        if (parentPath !== rootPathRef.current) {
          const data = await api.listFiles(parentPath)
          setChildrenCache(prev => ({ ...prev, [parentPath]: data.items || [] }))
        } else {
          fetchRoot()
        }
      }
      setNaming({ active:false })
    } catch (err) { console.error('Action failed:', err) }
  }

  const handleDelete = useCallback(async () => {
    const item = visibleItems[selectedIndex]
    if (!item) return
    if (!window.confirm(`Delete ${item.name}?`)) return
    try {
      await api.deleteItem(item.path)
      // Only close viewer if the deleted file was the one being viewed
      if (activeFilePath === item.path) onFileSelect(null)
      const parentPath = item.path.substring(0, item.path.lastIndexOf('/'))
      if (parentPath !== rootPathRef.current) {
        const data = await api.listFiles(parentPath)
        setChildrenCache(prev => ({ ...prev, [parentPath]: data.items || [] }))
      } else {
        fetchRoot()
      }
      // Move selection up if we were at the end
      if (selectedIndex >= visibleItems.length - 1) setSelectedIndex(Math.max(0, selectedIndex - 1))
    } catch (err) { console.error('Delete failed:', err) }
  }, [visibleItems, selectedIndex, onFileSelect, fetchRoot, activeFilePath])

  const copyPath = useCallback(() => {
    const item = visibleItems[selectedIndex]
    if (!item) return
    navigator.clipboard.writeText(item.path)
  }, [visibleItems, selectedIndex])

  // Keyboard handling
  useEffect(() => {
    if (!isFocused || naming.active) return
    const handle = (e) => {
      const key = resolveKey(e.key)
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(p => Math.min(visibleItems.length - 1, p + 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(p => Math.max(0, p - 1)) }
      else if (e.key === 'Enter') {
        e.preventDefault()
        const item = visibleItems[selectedIndex]
        if (item) { if (item.isDirectory) toggleDir(item.path); else onFileSelect(item) }
      }
      else if (e.key === 'Backspace' && !e.metaKey) {
        // Collapse parent directory
        e.preventDefault()
        const item = visibleItems[selectedIndex]
        if (!item) return
        const parentPath = item.path.substring(0, item.path.lastIndexOf('/'))
        if (parentPath && parentPath !== rootPathRef.current && expandedDirs.has(parentPath)) {
          const pIdx = visibleItems.findIndex(v => v.path === parentPath)
          if (pIdx >= 0) setSelectedIndex(pIdx)
          setExpandedDirs(prev => { const n = new Set(prev); n.delete(parentPath); return n })
        }
      }
      else if (key === 'a' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        const item = visibleItems[selectedIndex]
        let parentPath = rootPathRef.current
        if (item) {
          if (item.isDirectory) {
            parentPath = item.path
            if (!expandedDirs.has(item.path)) toggleDir(item.path)
          } else {
            parentPath = item.path.substring(0, item.path.lastIndexOf('/'))
          }
        }
        setNaming({ active:true, type: e.shiftKey ? 'dir' : 'file', value:'', oldPath:'', parentPath })
      }
      else if (key === 'r' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        const item = visibleItems[selectedIndex]
        if (item) setNaming({ active:true, type:'rename', value:item.name, oldPath:item.path, parentPath:'' })
      }
      else if (key === 'd' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); handleDelete() }
      else if (key === 'c' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); copyPath() }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [isFocused, naming.active, visibleItems, selectedIndex, toggleDir, onFileSelect, expandedDirs, handleDelete, copyPath])

  const renderInput = (depth) => (
    <form onSubmit={handleNamingSubmit} style={{ padding:`4px 16px 4px ${getIndent(depth)}px` }}>
      <input
        ref={inputRef}
        value={naming.value}
        onChange={e => setNaming(prev => ({ ...prev, value:e.target.value }))}
        onBlur={() => setNaming({ active:false })}
        onKeyDown={e => { if (e.key === 'Escape') setNaming({ active:false }) }}
        style={{ width:'100%', background:'var(--surface)', border:'1px solid var(--accent)', color:'var(--text)', fontSize:'13px', padding:'1px 6px', borderRadius:'4px', outline:'none', fontFamily:FONT_UI }}
      />
    </form>
  )

  return (
    <div ref={innerRef} tabIndex={0} onFocus={onFocus} style={{ display:'flex', flexDirection:'column', height:'100%', outline:'none', background:'var(--bg)' }}>
      {/* Header — actions revealed on hover only */}
      <div
        className="explorer-header"
        style={{ padding:'10px 16px 6px', fontSize:'10px', fontWeight:500, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.08em', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}
      >
        <span>Explorer</span>
        <div className="explorer-actions" style={{ display:'flex', gap:'14px' }}>
          {[['New file (A)', 'file', 'new file'], ['New folder (Shift+A)', 'dir', 'new folder']].map(([title, type, label]) => (
            <button key={type} title={title}
              onClick={() => setNaming({ active:true, type, value:'', oldPath:'', parentPath: rootPathRef.current })}
              onMouseEnter={e => { e.currentTarget.style.color='var(--text)' }}
              onMouseLeave={e => { e.currentTarget.style.color='var(--muted)' }}
              style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', padding:0, fontFamily:FONT_SERIF, fontStyle:'italic', fontSize:'13px', letterSpacing:'0', textTransform:'none', lineHeight:1, transition:'color 150ms' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Git status line — hidden entirely when not a repo */}
      {gitInfo?.isRepo && (
        <div style={{ padding:'0 16px 8px', fontSize:'11px', fontFamily:FONT_MONO, color:'var(--muted)', display:'flex', alignItems:'center', gap:'8px', flexShrink:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          <span style={{ color:'var(--text)' }} title="Current branch">⎇ {gitInfo.branch || '(detached)'}</span>
          {gitInfo.dirtyCount > 0 ? (
            <span style={{ color:'var(--accent)' }}>● {gitInfo.dirtyCount}</span>
          ) : (
            <span style={{ color:'var(--muted)' }}>clean</span>
          )}
        </div>
      )}

      {/* Tree */}
      <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', paddingBottom:'16px' }}>
        {/* New item input at top if creating in root and nothing selected */}
        {naming.active && (naming.type === 'file' || naming.type === 'dir') && naming.parentPath === rootPathRef.current && renderInput(0)}

        {visibleItems.map((item, idx) => {
          const isActive   = item.path === activeFilePath
          const isSelected = idx === selectedIndex && isFocused
          const isHovered  = hoveredPath === item.path
          const isChanged  = changedFiles?.has(item.path)
          const isExpanded = item.isDirectory && expandedDirs.has(item.path)
          const highlight  = isSelected || isHovered
          const padL       = getIndent(item.depth)
          const icon       = getIcon(item.name)

          return (
            <div key={item.path}>
              {naming.active && naming.type === 'rename' && idx === selectedIndex ? (
                renderInput(item.depth)
              ) : (
                <div
                  draggable={!item.isDirectory}
                  onDragStart={e => { e.dataTransfer.setData('text/plain', item.path); e.dataTransfer.effectAllowed = 'copy' }}
                  onClick={() => { setSelectedIndex(idx); if (item.isDirectory) toggleDir(item.path); else onFileSelect(item) }}
                  onMouseEnter={() => setHoveredPath(item.path)}
                  onMouseLeave={() => setHoveredPath(null)}
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
              )}

              {naming.active && (naming.type === 'file' || naming.type === 'dir') && naming.parentPath === item.path && idx === selectedIndex && renderInput(item.depth + 1)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default FileExplorer
