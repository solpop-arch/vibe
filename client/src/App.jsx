import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getVersion } from '@tauri-apps/api/app'
import * as api from './api'
import FileExplorer from './components/FileExplorer'
import FileViewer from './components/FileViewer'
import TabBar from './components/TabBar'
import ProjectDashboard from './components/Dashboard'
import NoRootScreen, { ProjectDropdown } from './components/NoRootScreen'
import {
  resolveKey, formatReadError, FONT_MONO, FONT_SERIF, FONT_UI,
  DOC_EXTENSIONS, DOC_FOLDERS, EXT_TO_LANG, LANG_COLORS,
  RECENT_CHANGES_LIMIT, isHiddenFile, basenameOf, makeRecentEntry,
  loadProjects, addProject,
  SHORTCUTS_VIEWER_VIEW, SHORTCUTS_VIEWER_VIEW_DIRTY, SHORTCUTS_VIEWER_DIFF,
  SHORTCUTS_VIEWER_EDIT, SHORTCUTS_VIEWER_EDIT_MD, SHORTCUTS_EXPLORER,
} from './constants'

// ── Sidebar resize ────────────────────────────────────────────────────────────
const SIDEBAR_DEFAULT_WIDTH = 220
const SIDEBAR_MIN_WIDTH     = 180
const SIDEBAR_MAX_CAP       = 480

function clampSidebarWidth(w) {
  const vwMax = Math.floor(window.innerWidth * 0.6)
  const max   = Math.min(SIDEBAR_MAX_CAP, vwMax)
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(max, w))
}

function loadSidebarWidth() {
  const raw = parseInt(localStorage.getItem('vibe-sidebar-width') || '', 10)
  return clampSidebarWidth(Number.isFinite(raw) ? raw : SIDEBAR_DEFAULT_WIDTH)
}

// ── About modal ───────────────────────────────────────────────────────────────
function AboutModal({ onClose }) {
  const [version, setVersion] = useState('')
  useEffect(() => { getVersion().then(setVersion) }, [])
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'36px 40px', width:'320px', display:'flex', flexDirection:'column', gap:'16px', boxShadow:'0 16px 48px rgba(0,0,0,0.2)' }}>
        <div>
          <div className="vibe-logo" style={{ fontSize:'28px', fontWeight:400 }}>vibe<span className="vibe-logo-dot">.</span></div>
          <div style={{ fontFamily:FONT_MONO, fontSize:'11px', color:'var(--muted)', marginTop:'4px' }}>{version ? `v${version}` : ''}</div>
        </div>
        <div style={{ fontSize:'13px', color:'var(--muted)', lineHeight:1.6 }}>
          AI CLI와 함께 쓰는 문서 편집기.
        </div>
        <div style={{ height:'1px', background:'var(--border)' }} />
        <div style={{ fontSize:'11px', color:'var(--muted)', lineHeight:2 }}>
          <div style={{ fontWeight:500, marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.08em', fontSize:'10px' }}>Git badges</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
            {[['var(--success)','added'],['#4DA8A4','untracked'],['var(--warning)','modified'],['var(--error)','deleted'],['#7B9FD4','renamed']].map(([color, label]) => (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <span style={{ fontFamily:FONT_MONO, fontSize:'12px', color, flexShrink:0 }}>●</span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ height:'1px', background:'var(--border)' }} />
        <div style={{ fontFamily:FONT_MONO, fontSize:'11px', color:'var(--muted)', lineHeight:1.8 }}>
          Tauri v2 · Rust · React + Vite
        </div>
        <a href="https://github.com/solpop-arch/vibe" target="_blank" rel="noreferrer"
          style={{ fontFamily:FONT_MONO, fontSize:'11px', color:'var(--accent)', textDecoration:'none' }}>
          github.com/solpop-arch/vibe ↗
        </a>
        <button onClick={onClose}
          onMouseEnter={e => { e.currentTarget.style.background='var(--surface-2)' }}
          onMouseLeave={e => { e.currentTarget.style.background='none' }}
          style={{ background:'none', border:'1px solid var(--border)', color:'var(--muted)', borderRadius:'6px', padding:'6px', fontSize:'12px', cursor:'pointer', transition:'background 150ms', marginTop:'4px' }}>
          Close
        </button>
      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  const explorerRef = useRef(null)
  const viewerRef   = useRef(null)

  const selectedFileRef    = useRef(null)
  const isEditingRef       = useRef(false)
  const editContentRef     = useRef('')
  const fileContentRef     = useRef('')
  const rootPathRef        = useRef('')
  const requireCleanRef    = useRef(null)
  const handleEscapeKeyRef = useRef(null)
  const handleViewerKeyRef = useRef(null)
  const openSearchRef      = useRef(null)
  const closeSearchRef     = useRef(null)
  const externallyChangedRef = useRef(false)
  const activeFocusRef     = useRef('explorer')

  const [rootReady, setRootReady]               = useState(false)
  const [tabs, setTabs]                         = useState([])
  const [activeId, setActiveId]                 = useState(null)
  const [pendingAction, setPendingAction]       = useState(null)
  const [activeFocus, setActiveFocus]           = useState('explorer')
  const [sidebarVisible, setSidebarVisible]     = useState(true)
  const [sidebarWidth, setSidebarWidth]         = useState(() => loadSidebarWidth())
  const [isResizing, setIsResizing]             = useState(false)
  const [explorerAtRoot, setExplorerAtRoot]     = useState(true)
  const [refreshKey, setRefreshKey]             = useState(0)
  const [theme, setTheme]                       = useState(() => localStorage.getItem('vibe-theme') || 'light')
  const [aboutOpen, setAboutOpen]               = useState(false)
  const [rootPath, setRootPath]                 = useState('')
  const [changedFiles, setChangedFiles]         = useState(new Set())
  const [recentChanges, setRecentChanges]       = useState([])
  const [dashboardData, setDashboardData]       = useState(null)
  const [brokenLinks, setBrokenLinks]           = useState([])
  const [orphanDocs, setOrphanDocs]             = useState([])
  const [graphData, setGraphData]               = useState(null)
  const [projects, setProjects]                 = useState(() => loadProjects())
  const [gitInfo, setGitInfo]                   = useState({ isRepo: false, branch: null, filesByAbs: new Map(), dirtyCount: 0 })
  const [refreshing, setRefreshing]             = useState(false)
  const [justRefreshed, setJustRefreshed]       = useState(false)
  const navScrollsByTabRef                      = useRef(new Map())
  const goBackRef                               = useRef(null)
  const goForwardRef                            = useRef(null)
  const gitRefetchTimerRef                      = useRef(null)
  const dashboardRefetchTimerRef                = useRef(null)
  const activeIdRef                             = useRef(null)
  const tabsRef                                 = useRef([])
  const handleCloseTabRef                       = useRef(null)
  const switchTabRelativeRef                    = useRef(null)
  activeIdRef.current = activeId
  tabsRef.current = tabs

  const active                                  = tabs.find(t => t.id === activeId) || null
  const selectedFile        = active?.file ?? null
  const fileContent         = active?.content ?? ''
  const isEditing           = active?.isEditing ?? false
  const editContent         = active?.editContent ?? ''
  const externallyChanged   = active?.externallyChanged ?? false
  const diffMode            = active?.diffMode ?? false
  const nav                 = active?.nav ?? { stack: [], index: -1 }
  const fileLoading         = active?.loading ?? false
  const navRef              = useRef(nav)
  navRef.current = nav

  const updateActiveTab = useCallback((partial) => {
    setTabs(ts => ts.map(t => t.id === activeIdRef.current ? { ...t, ...(typeof partial === 'function' ? partial(t) : partial) } : t))
  }, [])
  const updateTabById = useCallback((id, partial) => {
    setTabs(ts => ts.map(t => t.id === id ? { ...t, ...(typeof partial === 'function' ? partial(t) : partial) } : t))
  }, [])
  const setSelectedFile      = useCallback((file) => updateActiveTab({ file }), [updateActiveTab])
  const setFileContent       = useCallback((v) => updateActiveTab(t => ({ content: typeof v === 'function' ? v(t.content) : v })), [updateActiveTab])
  const setIsEditing         = useCallback((v) => updateActiveTab(t => ({ isEditing: typeof v === 'function' ? v(t.isEditing) : v })), [updateActiveTab])
  const setEditContent       = useCallback((v) => updateActiveTab(t => ({ editContent: typeof v === 'function' ? v(t.editContent) : v })), [updateActiveTab])
  const setExternallyChanged = useCallback((v) => updateActiveTab(t => ({ externallyChanged: typeof v === 'function' ? v(t.externallyChanged) : v })), [updateActiveTab])
  const setDiffMode          = useCallback((v) => updateActiveTab(t => ({ diffMode: typeof v === 'function' ? v(t.diffMode) : v })), [updateActiveTab])
  const setNav               = useCallback((v) => updateActiveTab(t => ({ nav: typeof v === 'function' ? v(t.nav) : v })), [updateActiveTab])
  const setFileLoading       = useCallback((v) => updateActiveTab(t => ({ loading: typeof v === 'function' ? v(t.loading) : v })), [updateActiveTab])

  const getNavScrolls = useCallback((id) => {
    let arr = navScrollsByTabRef.current.get(id)
    if (!arr) { arr = []; navScrollsByTabRef.current.set(id, arr) }
    return arr
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : '')
    localStorage.setItem('vibe-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('vibe-sidebar-width', String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    const onResize = () => setSidebarWidth(w => clampSidebarWidth(w))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const startSidebarResize = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebarWidth
    setIsResizing(true)
    let frame = 0
    let nextW = startW
    const onMove = (ev) => {
      nextW = clampSidebarWidth(startW + (ev.clientX - startX))
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          setSidebarWidth(nextW)
        })
      }
    }
    const onUp = () => {
      if (frame) cancelAnimationFrame(frame)
      setIsResizing(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  const resetSidebarWidth = useCallback(() => {
    setSidebarWidth(clampSidebarWidth(SIDEBAR_DEFAULT_WIDTH))
  }, [])

  const isDark = theme === 'dark'

  selectedFileRef.current     = selectedFile
  isEditingRef.current        = isEditing
  editContentRef.current      = editContent
  fileContentRef.current      = fileContent
  rootPathRef.current         = rootPath
  externallyChangedRef.current = externallyChanged
  activeFocusRef.current       = activeFocus

  const isDirty = isEditing && editContent !== fileContent

  const makeTabId = () => `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  const fetchIntoTab = useCallback((id, file) => {
    api.readFile(file.path)
      .then(d => updateTabById(id, { content: d.content || '', loading: false }))
      .catch(err => updateTabById(id, { content: formatReadError(err), loading: false }))
  }, [updateTabById])

  // Replace active tab's file. navStrategy: {type:'append'} | {type:'history', newIndex} | {type:'reset'}
  const replaceActiveFile = useCallback((file, navStrategy) => {
    const id = activeIdRef.current
    if (!id) return
    setTabs(ts => ts.map(t => {
      if (t.id !== id) return t
      let newNav = t.nav
      if (navStrategy?.type === 'append') {
        const truncated = t.nav.stack.slice(0, t.nav.index + 1)
        const scrolls = navScrollsByTabRef.current.get(id) || []
        navScrollsByTabRef.current.set(id, scrolls.slice(0, truncated.length))
        newNav = { stack: [...truncated, file], index: truncated.length }
      } else if (navStrategy?.type === 'history') {
        newNav = { ...t.nav, index: navStrategy.newIndex }
      } else if (navStrategy?.type === 'reset') {
        navScrollsByTabRef.current.set(id, [])
        newNav = { stack: [file], index: 0 }
      }
      return { ...t, file, content: '', isEditing: false, editContent: '', externallyChanged: false, diffMode: false, loading: true, nav: newNav }
    }))
    fetchIntoTab(id, file)
  }, [fetchIntoTab])

  const loadGitStatus = useCallback(async (rootAbs) => {
    try {
      const s = await api.gitStatus()
      setGitInfo(prev => {
        if (!s.isRepo) {
          if (!prev.isRepo) return prev
          return { isRepo: false, branch: null, filesByAbs: new Map(), dirtyCount: 0 }
        }
        const base = rootAbs || ''
        const filesByAbs = new Map()
        Object.entries(s.files || {}).forEach(([rel, state]) => {
          filesByAbs.set(base + '/' + rel, state)
        })
        // Short-circuit when nothing materially changed — avoids cascading re-renders
        if (
          prev.isRepo &&
          prev.branch === s.branch &&
          prev.filesByAbs.size === filesByAbs.size
        ) {
          let same = true
          for (const [k, v] of filesByAbs) {
            if (prev.filesByAbs.get(k) !== v) { same = false; break }
          }
          if (same) return prev
        }
        return { isRepo: true, branch: s.branch, filesByAbs, dirtyCount: filesByAbs.size }
      })
    } catch (e) { console.error('git_status failed:', e) }
  }, [])

  const scheduleGitRefetch = useCallback((rootAbs) => {
    if (gitRefetchTimerRef.current) clearTimeout(gitRefetchTimerRef.current)
    gitRefetchTimerRef.current = setTimeout(() => loadGitStatus(rootAbs), 200)
  }, [loadGitStatus])

  useEffect(() => () => {
    if (gitRefetchTimerRef.current) clearTimeout(gitRefetchTimerRef.current)
    if (dashboardRefetchTimerRef.current) clearTimeout(dashboardRefetchTimerRef.current)
  }, [])

  const loadDashboard = useCallback(async () => {
    try {
      const result = await api.listAllFiles()
      const rootPath_ = result.rootPath || ''
      const allFiles = (result.files || []).map(f => {
        const rel = f.path.startsWith(rootPath_) ? f.path.slice(rootPath_.length + 1) : f.name
        const slashIdx = rel.indexOf('/')
        const parentDir = slashIdx >= 0 ? rel.slice(0, slashIdx) : null
        return { ...f, parentDir, relDir: slashIdx >= 0 ? rel.slice(0, rel.lastIndexOf('/')) : null }
      })
      const totalFolders = result.totalFolders || 0
      const extCounts = {}, docs = []
      allFiles.forEach(file => {
        if (isHiddenFile(file)) return
        const ext = file.name.split('.').pop()?.toLowerCase() || ''
        extCounts[ext] = (extCounts[ext] || 0) + 1
        if (DOC_EXTENSIONS.has(ext)) docs.push(file)
        else if (file.relDir && DOC_FOLDERS.has(file.relDir.split('/')[0]?.toLowerCase())) docs.push(file)
      })
      const docsWithLines = await Promise.all(docs.map(async (doc) => {
        try {
          const d = await api.readFile(doc.path)
          const lines = (d.content || '').split('\n').length
          return { ...doc, lineCount: lines }
        } catch (_) { return { ...doc, lineCount: 0 } }
      }))
      const langCounts = {}
      Object.entries(extCounts).forEach(([ext, count]) => { const lang = EXT_TO_LANG[ext]; if (lang) langCounts[lang] = (langCounts[lang] || 0) + count })
      const totalLang = Object.values(langCounts).reduce((a, b) => a + b, 0) || 1
      const langStats = Object.entries(langCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name, pct: Math.round(count / totalLang * 100), color: LANG_COLORS[name] || LANG_COLORS.Other }))
      const recentFiles = allFiles
        .filter(f => f.modifiedMs && !isHiddenFile(f))
        .sort((a, b) => b.modifiedMs - a.modifiedMs)
        .slice(0, RECENT_CHANGES_LIMIT)
        .map(f => makeRecentEntry(f.path, f.modifiedMs))
      setRecentChanges(recentFiles)
      setDashboardData({ projectName: basenameOf(rootPath_) || 'project', projectPath: rootPath_, totalFiles: allFiles.length, totalFolders, langStats, docs: docsWithLines })
    } catch (e) { console.error('Dashboard load failed:', e) }
  }, [])

  const loadLinkHealth = useCallback(async () => {
    try {
      const [broken, orphans, graph] = await Promise.all([
        api.getBrokenLinks(),
        api.getOrphanDocs(),
        api.getGraphData(),
      ])
      setBrokenLinks(broken || [])
      setOrphanDocs(orphans || [])
      setGraphData(graph || null)
    } catch (e) { console.error('Link health load failed:', e) }
  }, [])

  const handleFocusChange = useCallback((target) => {
    setActiveFocus(target)
    setTimeout(() => {
      if (target === 'explorer' && explorerRef.current) explorerRef.current.focus()
      else if (target === 'viewer' && viewerRef.current) viewerRef.current.focus()
    }, 10)
  }, [])

  const saveFile = useCallback(async () => {
    if (!selectedFileRef.current) return
    try { await api.writeFile(selectedFileRef.current.path, editContentRef.current); setFileContent(editContentRef.current) }
    catch (e) { console.error('Save failed:', e) }
  }, [])

  // View-mode task-checkbox toggle: persist new content directly to the file.
  const saveContent = useCallback(async (newContent) => {
    if (!selectedFileRef.current) return
    try { await api.writeFile(selectedFileRef.current.path, newContent); setFileContent(newContent) }
    catch (e) { console.error('Save failed:', e) }
  }, [])

  const openOrSwitchToFile = useCallback((file) => {
    if (!file || file.isDirectory) return
    const existing = tabsRef.current.find(t => t.file?.path === file.path)
    if (existing) {
      setActiveId(existing.id)
      setChangedFiles(prev => { if (!prev.has(file.path)) return prev; const n = new Set(prev); n.delete(file.path); return n })
      handleFocusChange('viewer')
      return
    }
    const id = makeTabId()
    const newTab = {
      id, file,
      content: '', isEditing: false, editContent: '',
      externallyChanged: false, diffMode: false,
      nav: { stack: [file], index: 0 }, loading: true,
    }
    navScrollsByTabRef.current.set(id, [])
    setTabs(ts => [...ts, newTab])
    setActiveId(id)
    setChangedFiles(prev => { if (!prev.has(file.path)) return prev; const n = new Set(prev); n.delete(file.path); return n })
    handleFocusChange('viewer')
    fetchIntoTab(id, file)
  }, [handleFocusChange, fetchIntoTab])

  const closeTab = useCallback((id) => {
    const idx = tabsRef.current.findIndex(t => t.id === id)
    if (idx < 0) return
    const remaining = tabsRef.current.filter(t => t.id !== id)
    navScrollsByTabRef.current.delete(id)
    setTabs(remaining)
    if (id === activeIdRef.current) {
      if (remaining.length === 0) { setActiveId(null); handleFocusChange('explorer') }
      else {
        const next = remaining[Math.min(idx, remaining.length - 1)]
        setActiveId(next.id)
      }
    }
  }, [handleFocusChange])

  const executeAction = useCallback((action) => {
    setPendingAction(null)
    switch (action.type) {
      case 'close':
        closeTab(action.id ?? activeIdRef.current)
        break
      case 'changeFile':
        // Replaces ACTIVE tab's file in place (used by internal links + back/forward)
        if (action.fromHistory) {
          replaceActiveFile(action.file, { type: 'history', newIndex: action.newIndex })
        } else {
          replaceActiveFile(action.file, { type: 'append' })
        }
        setChangedFiles(prev => { if (!prev.has(action.file.path)) return prev; const n = new Set(prev); n.delete(action.file.path); return n })
        handleFocusChange('viewer')
        break
      case 'exitEdit':
        setIsEditing(false)
        if (externallyChangedRef.current) {
          setExternallyChanged(false)
          if (selectedFileRef.current) {
            const id = activeIdRef.current
            api.readFile(selectedFileRef.current.path)
              .then(d => updateTabById(id, { content: d.content || '' }))
              .catch(err => updateTabById(id, { content: formatReadError(err) }))
          }
        }
        break
      default: console.warn('Unknown action:', action.type)
    }
  }, [handleFocusChange, closeTab, replaceActiveFile, setIsEditing, setExternallyChanged, updateTabById])

  const requireClean = useCallback((action) => {
    if (isEditingRef.current && editContentRef.current !== fileContentRef.current) setPendingAction(action); else executeAction(action)
  }, [executeAction])
  requireCleanRef.current = requireClean

  const handleFileSelect       = useCallback((file) => openOrSwitchToFile(file), [openOrSwitchToFile])
  const handleLinkOpen         = useCallback((file) => requireClean({ type:'changeFile', file }), [requireClean])
  const handleScrollChange     = useCallback((data) => {
    const id = activeIdRef.current
    if (!id) return
    const idx = navRef.current.index
    if (idx < 0) return
    const arr = getNavScrolls(id)
    arr[idx] = data
  }, [getNavScrolls])
  const handleCloseTab         = useCallback((id) => {
    const t = tabsRef.current.find(x => x.id === id)
    if (!t) return
    const dirty = t.isEditing && t.editContent !== t.content
    if (dirty) { setActiveId(id); setPendingAction({ type:'close', id }); return }
    closeTab(id)
  }, [closeTab])
  const goBack                 = useCallback(() => {
    if (!selectedFileRef.current) return
    const { stack, index } = navRef.current
    if (index <= 0) return
    const newIdx = index - 1
    requireCleanRef.current({ type:'changeFile', file: stack[newIdx], fromHistory: true, newIndex: newIdx })
  }, [])
  const goForward              = useCallback(() => {
    if (!selectedFileRef.current) return
    const { stack, index } = navRef.current
    if (index >= stack.length - 1) return
    const newIdx = index + 1
    requireCleanRef.current({ type:'changeFile', file: stack[newIdx], fromHistory: true, newIndex: newIdx })
  }, [])
  const switchToTab            = useCallback((id) => {
    if (id === activeIdRef.current) return
    setActiveId(id)
    handleFocusChange('viewer')
  }, [handleFocusChange])
  const switchTabRelative      = useCallback((delta) => {
    const ts = tabsRef.current
    if (ts.length < 2) return
    const idx = ts.findIndex(t => t.id === activeIdRef.current)
    if (idx < 0) return
    const next = ts[(idx + delta + ts.length) % ts.length]
    setActiveId(next.id)
  }, [])
  goBackRef.current    = goBack
  goForwardRef.current = goForward
  handleCloseTabRef.current = handleCloseTab
  switchTabRelativeRef.current = switchTabRelative
  const toggleSidebar          = useCallback(() => setSidebarVisible(p => !p), [])
  const enterEditMode          = useCallback(() => { setDiffMode(false); setEditContent(fileContentRef.current); setIsEditing(true) }, [])
  const enterDiffMode          = useCallback(() => setDiffMode(true), [])
  const exitDiffMode           = useCallback(() => setDiffMode(false), [])
  const exitEditMode           = useCallback(() => requireClean({ type:'exitEdit' }), [requireClean])
  const closeViewer            = useCallback(() => requireClean({ type:'close' }), [requireClean])
  const focusExplorer          = useCallback(() => setActiveFocus('explorer'), [])
  const focusViewer            = useCallback(() => setActiveFocus('viewer'), [])
  const handleUnsavedSave      = useCallback(async () => { const a = pendingAction; await saveFile(); executeAction(a) }, [saveFile, pendingAction, executeAction])
  const handleUnsavedDiscard   = useCallback(() => executeAction(pendingAction), [pendingAction, executeAction])

  const handleEscapeKey = () => {
    if (aboutOpen) { setAboutOpen(false); return }
    if (closeSearchRef.current?.()) return
    if (isEditingRef.current) { requireCleanRef.current({ type:'exitEdit' }); return }
    if (selectedFileRef.current) { requireCleanRef.current({ type:'close' }); return }
    handleFocusChange('explorer')
  }
  handleEscapeKeyRef.current = handleEscapeKey

  const refreshAll = useCallback(async () => {
    setRefreshKey(k => k + 1)
    setRefreshing(true)
    setJustRefreshed(false)
    const minSpin = new Promise(r => setTimeout(r, 650))
    try { await Promise.all([loadDashboard(), loadGitStatus(rootPathRef.current), loadLinkHealth(), minSpin]) }
    finally { setRefreshing(false); setJustRefreshed(true); setTimeout(() => setJustRefreshed(false), 900) }
  }, [loadDashboard, loadGitStatus, loadLinkHealth])

  const reloadCurrentFile = useCallback(() => {
    if (!selectedFileRef.current) return
    const id = activeIdRef.current
    api.readFile(selectedFileRef.current.path)
      .then(d => updateTabById(id, { content: d.content || '', externallyChanged: false }))
      .catch(err => updateTabById(id, { content: formatReadError(err) }))
  }, [updateTabById])

  const handleViewerKey = (e) => {
    if (!selectedFileRef.current || isEditingRef.current) return false
    const t = e.target
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return false
    const k = resolveKey(e.key)
    if (k === 'e') { e.preventDefault(); setDiffMode(false); setEditContent(fileContentRef.current); setIsEditing(true); return true }
    if (k === 'd' && selectedFileRef.current && gitInfo.filesByAbs.has(selectedFileRef.current.path)) { e.preventDefault(); setDiffMode(true); return true }
    if (k === 'l' && externallyChangedRef.current) { e.preventDefault(); reloadCurrentFile(); return true }
    if (e.key === ' ') {
      e.preventDefault()
      // Find first actually scrollable element inside the viewer
      const findScrollable = (root) => {
        if (!root) return null
        for (const el of root.querySelectorAll('*')) {
          if (el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== 'hidden') return el
        }
        return root
      }
      const sc = findScrollable(viewerRef.current)
      if (sc) sc.scrollBy({ top: e.shiftKey ? -sc.clientHeight * 0.8 : sc.clientHeight * 0.8, behavior: 'smooth' })
      return true
    }
    return false
  }
  handleViewerKeyRef.current = handleViewerKey

  const switchProject = useCallback(async (path) => {
    await api.setRoot(path)
    setTabs([]); setActiveId(null)
    navScrollsByTabRef.current = new Map()
    setChangedFiles(new Set()); setRecentChanges([])
    setDashboardData(null)
    setBrokenLinks([]); setOrphanDocs([]); setGraphData(null)
    setGitInfo({ isRepo: false, branch: null, filesByAbs: new Map(), dirtyCount: 0 })
    setRootPath(path)
    getCurrentWindow().setTitle(`vibe. — ${basenameOf(path)}`)
    const list = addProject(path)
    setProjects(list)
    setRefreshKey(k => k + 1)
    setRootReady(true)
  }, [])

  useEffect(() => {
    api.getRoot().then(r => {
      if (r) { const list = addProject(r); setProjects(list); getCurrentWindow().setTitle(`vibe. — ${basenameOf(r)}`) }
      setRootReady(!!r); setRootPath(r || '')
    }).catch(() => setRootReady(false))
  }, [])
  useEffect(() => { if (rootReady) { loadDashboard(); loadGitStatus(rootPath); loadLinkHealth() } }, [rootReady, loadDashboard, loadGitStatus, loadLinkHealth, rootPath])

  useEffect(() => {
    const ref = { current: null }; let unmounted = false
    api.onLinkIndexReady(() => { loadLinkHealth() }).then(fn => { if (unmounted) fn(); else ref.current = fn })
    return () => { unmounted = true; ref.current?.() }
  }, [loadLinkHealth])

  useEffect(() => {
    const ref = { current: null }; let unmounted = false
    api.onFileChanged((payload) => {
      const allPaths = payload.paths || []
      const gitEvent = allPaths.some(p => p.includes('/.git/'))
      const paths = allPaths.filter(p => !p.includes('/.git/'))
      if (gitEvent) scheduleGitRefetch(rootPathRef.current)
      if (paths.length > 0) {
        setRefreshKey(k => k + 1)
        setChangedFiles(prev => { const n = new Set(prev); paths.forEach(p => n.add(p)); return n })
        // Immediately update recentChanges (all file types) for the watcher badge
        const now = Date.now()
        const filtered = paths.filter(p => !isHiddenFile({ name: basenameOf(p) }))
        if (filtered.length > 0) {
          const filteredSet = new Set(filtered)
          const newEntries = filtered.map(p => makeRecentEntry(p, now))
          setRecentChanges(prev => [...newEntries, ...prev.filter(e => !filteredSet.has(e.path))].slice(0, RECENT_CHANGES_LIMIT))
        }
        // Debounced dashboard refresh on file changes
        if (dashboardRefetchTimerRef.current) clearTimeout(dashboardRefetchTimerRef.current)
        dashboardRefetchTimerRef.current = setTimeout(() => { loadDashboard(); loadLinkHealth() }, 2000)
        // External change detection — update any open tab whose file changed
        const pathSet = new Set(paths)
        const activeId_ = activeIdRef.current
        for (const tab of tabsRef.current) {
          if (!tab.file || !pathSet.has(tab.file.path)) continue
          const isActive = tab.id === activeId_
          if (isActive && tab.isEditing) {
            updateTabById(tab.id, { externallyChanged: true })
          } else {
            api.readFile(tab.file.path)
              .then(d => updateTabById(tab.id, { content: d.content || '', externallyChanged: false }))
              .catch(err => updateTabById(tab.id, { content: formatReadError(err) }))
          }
        }
      }
    }).then(fn => { if (unmounted) fn(); else ref.current = fn })
    return () => { unmounted = true; ref.current?.() }
  }, [])

  useEffect(() => {
    const handle = (e) => {
      const key = resolveKey(e.key)
      const mod = e.metaKey || e.ctrlKey
      if (mod && key === 'b') { e.preventDefault(); toggleSidebar() }
      else if (mod && e.shiftKey && key === 'l') { e.preventDefault(); setTheme(t => t === 'dark' ? 'light' : 'dark') }
      else if (mod && key >= '1' && key <= '9') {
        const idx = parseInt(key) - 1
        if (idx < projects.length && projects[idx].path !== rootPath) { e.preventDefault(); switchProject(projects[idx].path) }
      }
      else if (e.key === '?' && !e.target?.matches('input,textarea,[contenteditable]')) { e.preventDefault(); setAboutOpen(a => !a) }
      else if (e.key === 'Escape') { e.preventDefault(); handleEscapeKeyRef.current() }
      else if (mod && key === 'r') { e.preventDefault(); refreshAll() }
      else if (mod && key === 'f' && activeFocusRef.current === 'viewer' && selectedFileRef.current && !isEditingRef.current) { e.preventDefault(); openSearchRef.current?.() }
      else if (mod && key === 'w') {
        // Tab-aware close: shut the active tab if one is open, otherwise quit the app.
        e.preventDefault()
        if (activeIdRef.current) handleCloseTabRef.current?.(activeIdRef.current)
        else getCurrentWindow().close()
      }
      else if (mod && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const t = e.target
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
        e.preventDefault()
        switchTabRelativeRef.current?.(e.key === 'ArrowLeft' ? -1 : 1)
      }
      else if (mod && (e.key === '[' || e.key === ']' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const t = e.target
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
        e.preventDefault()
        if (e.key === '[' || e.key === 'ArrowLeft') goBackRef.current?.(); else goForwardRef.current?.()
      }
      else if (activeFocusRef.current === 'viewer' && handleViewerKeyRef.current?.(e)) { /* handled */ }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [toggleSidebar, projects, rootPath, switchProject, refreshAll])

  const isMd = selectedFile?.name.split('.').pop() === 'md'
  const gitDirty = !!(selectedFile && gitInfo.filesByAbs.has(selectedFile.path))

  const footerShortcuts = useMemo(() => {
    if (activeFocus === 'viewer') {
      if (isEditing) return isMd ? SHORTCUTS_VIEWER_EDIT_MD : SHORTCUTS_VIEWER_EDIT
      if (diffMode) return SHORTCUTS_VIEWER_DIFF
      return gitDirty ? SHORTCUTS_VIEWER_VIEW_DIRTY : SHORTCUTS_VIEWER_VIEW
    }
    return SHORTCUTS_EXPLORER
  }, [activeFocus, isEditing, isMd, diffMode, gitDirty, selectedFile])

  const handlePickFolder = async () => {
    const path = await api.pickFolder()
    if (path) await switchProject(path)
  }

  if (!rootReady) {
    return <NoRootScreen projects={projects} onOpen={switchProject} onPick={handlePickFolder} onProjectsChange={setProjects} />
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', width:'100%', height:'100vh', background:'var(--bg)', overflow:'hidden' }}>

      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}

      {pendingAction && (
        <div style={{ position:'fixed', inset:0, background:'rgba(26,22,18,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'8px', padding:'24px 32px', textAlign:'center', minWidth:'280px', boxShadow:'0 8px 32px rgba(26,22,18,0.12)' }}>
            <p style={{ marginBottom:'20px', color:'var(--text)', fontSize:'14px' }}>저장하지 않은 변경사항이 있습니다.</p>
            <div style={{ display:'flex', gap:'8px', justifyContent:'center' }}>
              <button onClick={handleUnsavedSave} style={{ background:'var(--accent-sub)', border:'1px solid var(--accent)', color:'var(--accent)', cursor:'pointer', padding:'6px 16px', borderRadius:'4px', fontSize:'13px', fontFamily:FONT_UI }}>저장</button>
              <button onClick={handleUnsavedDiscard} style={{ background:'transparent', border:'1px solid var(--border)', color:'var(--muted)', cursor:'pointer', padding:'6px 16px', borderRadius:'4px', fontSize:'13px', fontFamily:FONT_UI }}>버리기</button>
              <button onClick={() => setPendingAction(null)} style={{ background:'transparent', border:'1px solid var(--border)', color:'var(--muted)', cursor:'pointer', padding:'6px 16px', borderRadius:'4px', fontSize:'13px', fontFamily:FONT_UI }}>취소</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        <div style={{ width: sidebarVisible ? `${sidebarWidth}px` : '0px', opacity: sidebarVisible ? 1 : 0, visibility: sidebarVisible ? 'visible' : 'hidden', display:'flex', flexDirection:'column', flexShrink:0, borderRight: sidebarVisible ? '1px solid var(--border)' : 'none', background:'var(--bg)', overflow:'hidden', transition: isResizing ? 'none' : 'width 0.25s ease-in-out, opacity 0.2s ease-in-out', userSelect:'none', WebkitUserSelect:'none' }}>
          <FileExplorer key={rootPath} innerRef={explorerRef} onFocus={focusExplorer} onFileSelect={handleFileSelect} isFocused={activeFocus === 'explorer'} onAtRootChange={setExplorerAtRoot} refreshKey={refreshKey} activeFilePath={selectedFile?.path} changedFiles={changedFiles} gitFiles={gitInfo.filesByAbs} gitInfo={gitInfo} />
        </div>

        {sidebarVisible && (
          <div
            onMouseDown={startSidebarResize}
            onDoubleClick={resetSidebarWidth}
            title="드래그하여 너비 조절 · 더블클릭 시 기본값"
            onMouseEnter={e => { if (!isResizing) e.currentTarget.style.background = 'var(--border)' }}
            onMouseLeave={e => { if (!isResizing) e.currentTarget.style.background = 'transparent' }}
            style={{
              position: 'relative',
              width: '8px', marginLeft: '-4px', marginRight: '-4px',
              cursor: 'col-resize', flexShrink: 0, zIndex: 5,
              background: isResizing ? 'var(--accent)' : 'transparent',
              transition: isResizing ? 'none' : 'background 150ms',
            }}
          />
        )}

        <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden', background:'var(--surface)' }}>
          {tabs.length > 0 && (
            <TabBar tabs={tabs} activeId={activeId} onSelect={switchToTab} onClose={handleCloseTab} />
          )}
          {selectedFile ? (
            <div style={{ flex:1, minWidth:'40%', overflow:'hidden' }}>
              <FileViewer key={activeId} innerRef={viewerRef} onFocus={focusViewer} onClose={closeViewer} onEnterEdit={enterEditMode} onExitEdit={exitEditMode} onSave={saveFile} onViewTaskToggle={saveContent} onEditContentChange={setEditContent} selectedFile={selectedFile} content={fileContent} isEditing={isEditing} editContent={editContent} isDirty={isDirty} isMd={isMd} isDark={isDark} isFocused={activeFocus === 'viewer'} gitDirty={gitDirty} diffMode={diffMode} onEnterDiff={enterDiffMode} onExitDiff={exitDiffMode} externallyChanged={externallyChanged} onReload={reloadCurrentFile} openSearchRef={openSearchRef} closeSearchRef={closeSearchRef} rootPath={rootPath} onLinkOpen={handleLinkOpen} onBack={goBack} onForward={goForward} canBack={nav.index > 0} canForward={nav.index >= 0 && nav.index < nav.stack.length - 1} initialScroll={getNavScrolls(activeId)[nav.index]} onScrollChange={handleScrollChange} loading={fileLoading} />
            </div>
          ) : (
            <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
              <ProjectDashboard data={dashboardData} recentChanges={recentChanges} brokenLinks={brokenLinks} orphanDocs={orphanDocs} graphData={graphData} onFileOpen={handleFileSelect} onRefresh={refreshAll} refreshing={refreshing} justRefreshed={justRefreshed} gitInfo={gitInfo} />
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ height:'22px', background:'var(--bg)', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', flexShrink:0 }}>
        <div style={{ display:'flex', gap:'14px', overflow:'hidden' }}>
          {footerShortcuts.map(([key, desc]) => {
            const m = key.match(/^([\u2318\u2325\u2303\u21e7]+)(.*)$/)
            return (
              <span key={key} style={{ display:'flex', alignItems:'center', gap:'3px', fontSize:'10.5px', color:'var(--muted)', whiteSpace:'nowrap' }}>
                <kbd style={{ fontFamily:FONT_MONO, fontSize:'10px', color:'var(--text)', fontStyle:'normal', display:'inline-flex', alignItems:'baseline' }}>
                  {m ? (<>
                    <span style={{ fontFamily:FONT_UI, fontSize:'11px', marginRight: m[2] ? '2px' : 0 }}>{m[1]}</span>
                    {m[2]}
                  </>) : key}
                </kbd> {desc}
              </span>
            )
          })}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
          {projects.length > 1 && (
            <ProjectDropdown projects={projects} currentPath={rootPath} onSelect={switchProject} />
          )}
          <button onClick={handlePickFolder} title="Add project"
            onMouseEnter={e => { e.currentTarget.style.background='var(--surface)'; e.currentTarget.style.color='var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.background='none'; e.currentTarget.style.color='var(--muted)' }}
            style={{ background:'none', border:'1px solid var(--border)', color:'var(--muted)', borderRadius:'4px', padding:'1px 6px', fontSize:'11px', cursor:'pointer', transition:'all 150ms' }}>+</button>
          <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="⌘⇧L"
            onMouseEnter={e => { e.currentTarget.style.background='var(--surface)'; e.currentTarget.style.color='var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.background='none'; e.currentTarget.style.color='var(--muted)' }}
            style={{ background:'none', border:'1px solid var(--border)', color:'var(--muted)', borderRadius:'4px', padding:'2px 8px', fontSize:'10px', cursor:'pointer', fontFamily:FONT_UI, transition:'all 150ms' }}>
            {isDark ? 'Light' : 'Dark'}
          </button>
          <button onClick={() => setAboutOpen(true)}
            onMouseEnter={e => { e.currentTarget.style.color='var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.color='var(--muted)' }}
            style={{ background:'none', border:'none', color:'var(--muted)', padding:'1px 4px', fontSize:'12px', cursor:'pointer', transition:'color 150ms' }}>
            ?
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
