import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import * as api from '../api'
import ExplorerRow from './ExplorerRow'
import ExplorerNameInput from './ExplorerNameInput'
import { flattenVisible, computeDirtyDirs, ancestorDirs, parentPathOf } from '../explorerTree'
import { resolveKey, FONT_MONO, FONT_SERIF } from '../constants'

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
  const visibleItems = useMemo(
    () => flattenVisible(rootItems, expandedDirs, childrenCache),
    [rootItems, expandedDirs, childrenCache])

  // Clamp selection when tree collapses
  useEffect(() => {
    if (selectedIndex >= visibleItems.length && visibleItems.length > 0) {
      setSelectedIndex(visibleItems.length - 1)
    }
  }, [visibleItems.length, selectedIndex])

  // Reveal file in explorer: expand all parent dirs and select it
  useEffect(() => {
    if (!activeFilePath || !rootPathRef.current) return
    const dirsToExpand = ancestorDirs(rootPathRef.current, activeFilePath)
    if (dirsToExpand.length === 0) return // root-level file or outside root
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
  const dirtyDirs = useMemo(() => computeDirtyDirs(gitFiles, rootPathRef.current), [gitFiles])

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
        const parentPath = parentPathOf(naming.oldPath)
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
      const parentPath = parentPathOf(item.path)
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
        const parentPath = parentPathOf(item.path)
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
            parentPath = parentPathOf(item.path)
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

  const cancelNaming = () => setNaming({ active:false })
  const renderInput = (depth) => (
    <ExplorerNameInput
      inputRef={inputRef} depth={depth} value={naming.value}
      onChange={value => setNaming(prev => ({ ...prev, value }))}
      onSubmit={handleNamingSubmit} onCancel={cancelNaming}
    />
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

          return (
            <div key={item.path}>
              {naming.active && naming.type === 'rename' && idx === selectedIndex ? (
                renderInput(item.depth)
              ) : (
                <ExplorerRow
                  item={item} isActive={isActive} highlight={highlight} isExpanded={isExpanded} isChanged={isChanged}
                  dirtyDirs={dirtyDirs} gitFiles={gitFiles}
                  onSelect={() => { setSelectedIndex(idx); if (item.isDirectory) toggleDir(item.path); else onFileSelect(item) }}
                  onHoverChange={setHoveredPath}
                />
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
