import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { List as VirtualList } from 'react-window'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { oneLight }    from 'react-syntax-highlighter/dist/esm/styles/prism'
import * as api from '../api'
import CodeRow from './CodeRow'
import PlainCodeRow from './PlainCodeRow'
import DiffView from './DiffView'
import MarkdownView from './MarkdownView'
import BacklinksPanel from './BacklinksPanel'
import ViewerHeader from './ViewerHeader'
import ViewerSearchBar from './ViewerSearchBar'
import EditPane from './EditPane'
import { usePersistedZoom } from '../hooks/usePersistedZoom'
import { useFileSearch } from '../hooks/useFileSearch'
import { resolveKey, LINE_HEIGHT_PX, FONT_MONO, EXT_TO_DISPLAY, HIGHLIGHT_SIZE_LIMIT } from '../constants'

const FileViewer = ({
  selectedFile, content, isEditing, editContent, isDirty, isMd, isDark,
  onEditContentChange, onEnterEdit, onExitEdit, onSave, onViewTaskToggle,
  isFocused, onFocus, onClose, innerRef,
  gitDirty, diffMode, onEnterDiff, onExitDiff,
  externallyChanged, onReload, openSearchRef, closeSearchRef,
  rootPath, onLinkOpen,
  onBack, onForward, canBack, canForward,
  initialScroll, onScrollChange, loading,
}) => {
  const [mdTab, setMdTab] = useState('edit')
  const [diffData, setDiffData] = useState(null)
  const [diffError, setDiffError] = useState('')
  const [diffSideBySide, setDiffSideBySide] = useState(false)
  const [copied, setCopied] = useState(false)
  const [wrapEnabled, setWrapEnabled] = useState(true)
  const textareaRef        = useRef(null)
  const listRef            = useRef(null)
  const scrollContainerRef = useRef(null)
  const pendingScrollRef   = useRef(null)
  const lastViewScrollRef  = useRef(null)  // { type:'code', line } | { type:'md', ratio }
  const ext = selectedFile?.name.split('.').pop()?.toLowerCase() ?? ''
  const langBadge = EXT_TO_DISPLAY[ext] || ext || '—'

  const [brokenHrefs, setBrokenHrefs] = useState(null)

  const search = useFileSearch({ content, isMd, listRef, openSearchRef, closeSearchRef })
  const {
    searchOpen, searchQuery, setSearchQuery, currentMatchIdx, setCurrentMatchIdx, setMdMatchCount,
    totalMatches, searchInputRef, searchNext, searchPrev, closeSearch, searchMatchSet, currentMatchLine,
  } = search

  // Cmd +/- zoom for markdown preview (Cmd+0 resets).
  const mdZoomActive = isMd && !diffMode && (!isEditing || mdTab === 'preview')
  const mdZoom = usePersistedZoom('vibe-md-zoom', mdZoomActive)
  // Cmd +/- zoom for the edit textarea. Mutually exclusive with mdZoomActive —
  // the markdown preview pane is never the edit pane.
  const editZoomActive = isEditing && (!isMd || mdTab === 'edit')
  const editZoom = usePersistedZoom('vibe-edit-zoom', editZoomActive)
  // Read at edit-entry time only — keeps the scroll-restore effect off editZoom's deps.
  const editZoomRef = useRef(editZoom)
  editZoomRef.current = editZoom

  useEffect(() => {
    if (!selectedFile?.path || !isMd) { setBrokenHrefs(null); return }
    let cancelled = false
    const load = () => {
      api.getOutgoingLinks(selectedFile.path).then(list => {
        if (cancelled) return
        const set = new Set()
        for (const l of list || []) {
          if (!l.isExternal && l.target === null && l.rawHref) set.add(l.rawHref)
        }
        setBrokenHrefs(set)
      }).catch(() => { if (!cancelled) setBrokenHrefs(null) })
    }
    load()
    const unlistenPromises = [api.onLinkIndexReady(load), api.onFileChanged(load)]
    return () => {
      cancelled = true
      unlistenPromises.forEach(p => p.then(fn => fn && fn()).catch(() => {}))
    }
  }, [selectedFile?.path, isMd])

  const copyAll = useCallback(() => {
    if (!content) return
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [content])

  useEffect(() => {
    setMdTab('edit'); setDiffData(null); setDiffError(''); setDiffSideBySide(false); closeSearch()
    lastViewScrollRef.current = null
    pendingScrollRef.current = initialScroll ?? { type: 'top' }
  }, [selectedFile])

  useEffect(() => {
    if (!pendingScrollRef.current || !selectedFile || !content) return
    if (isEditing || diffMode) return
    const pending = pendingScrollRef.current
    pendingScrollRef.current = null
    const apply = () => {
      if (isMd) {
        const el = scrollContainerRef.current
        if (!el) return
        if (pending.type === 'md') {
          const denom = el.scrollHeight - el.clientHeight
          el.scrollTop = denom > 0 ? Math.round(pending.ratio * denom) : 0
        } else {
          el.scrollTop = 0
        }
      } else {
        if (!listRef.current) return
        const idx = pending.type === 'code' ? pending.line : 0
        listRef.current.scrollToRow({ index: idx, align: 'start' })
      }
    }
    // Markdown needs an extra frame — content mounts then scrollHeight resolves.
    if (isMd) requestAnimationFrame(() => requestAnimationFrame(apply))
    else requestAnimationFrame(apply)
  }, [content, selectedFile, isMd, isEditing, diffMode])

  // Order matters: scrollTop MUST be set before focus. focus() triggers the browser's
  // auto-scroll-to-caret which otherwise clobbers our target. preventScroll is a
  // second guard against that.
  useEffect(() => {
    if (!isEditing) return
    const last = lastViewScrollRef.current
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      if (last) {
        if (last.type === 'code') {
          el.scrollTop = Math.max(0, last.line * LINE_HEIGHT_PX * editZoomRef.current)
        } else if (last.type === 'md') {
          const denom = el.scrollHeight - el.clientHeight
          if (denom > 0) el.scrollTop = Math.max(0, Math.round(last.ratio * denom))
        }
      }
      el.focus({ preventScroll: true })
    })
  }, [isEditing])

  const handleMdScroll = useCallback((e) => {
    const el = e.currentTarget
    const denom = el.scrollHeight - el.clientHeight
    const ratio = denom > 0 ? Math.max(0, Math.min(1, el.scrollTop / denom)) : 0
    const data = { type: 'md', ratio }
    lastViewScrollRef.current = data
    onScrollChange?.(data)
  }, [onScrollChange])

  const handleRowsRendered = useCallback(({ startIndex }) => {
    const data = { type: 'code', line: startIndex }
    lastViewScrollRef.current = data
    onScrollChange?.(data)
  }, [onScrollChange])

  // Fetch diff when entering diff mode (or when file re-changes while already in diff).
  useEffect(() => {
    if (!diffMode || !selectedFile) return
    let cancelled = false
    setDiffError('')
    api.gitDiff(selectedFile.path)
      .then(d => { if (!cancelled) setDiffData(d) })
      .catch(err => { if (!cancelled) { setDiffError(String(err?.message ?? err)); setDiffData(null) } })
    return () => { cancelled = true }
  }, [diffMode, selectedFile, content])

  // Diff-only shortcuts stay inside FileViewer (no timing issue — viewer already focused)
  useEffect(() => {
    if (!isFocused || isEditing || !diffMode) return
    const handle = (e) => {
      const k = resolveKey(e.key)
      if (e.shiftKey && k === 'd') { e.preventDefault(); setDiffSideBySide(p => !p) }
      else if (k === 'v' || k === 'd') { e.preventDefault(); onExitDiff() }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [isFocused, isEditing, diffMode, onExitDiff])
  // Enter/E/D shortcuts are handled in the global keydown handler (App level) to avoid focus-transition timing issues

  useEffect(() => {
    if (!isEditing || !isMd) return
    const handle = (e) => {
      if ((e.metaKey || e.ctrlKey) && resolveKey(e.key) === 'p') { e.preventDefault(); setMdTab(p => p === 'edit' ? 'preview' : 'edit') }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [isEditing, isMd])

  const toggleWrap = useCallback(() => setWrapEnabled(w => !w), [])
  const toggleSideBySide = useCallback(() => setDiffSideBySide(p => !p), [])
  const handleSearchQueryChange = useCallback((v) => { setSearchQuery(v); setCurrentMatchIdx(0) }, [setSearchQuery, setCurrentMatchIdx])

  const fileDirPath     = selectedFile?.path?.substring(0, selectedFile?.path?.lastIndexOf('/'))
  const showDiff        = !!selectedFile && diffMode && !isEditing
  const showEditPane    = isEditing && (!isMd || mdTab === 'edit')
  const showPreviewPane = isEditing && isMd && mdTab === 'preview'
  const isCodeView      = !!selectedFile && !isMd && !showEditPane && !showPreviewPane && !showDiff
  const canSearch       = !!selectedFile && !showEditPane && !showPreviewPane && !showDiff
  const isFlexLayout    = showEditPane || isCodeView || showDiff
  const activeContent   = isEditing ? editContent : content
  const lineCount       = useMemo(() => {
    let n = 1
    for (let i = 0; i < activeContent.length; i++) if (activeContent[i] === '\n') n++
    return n
  }, [activeContent])
  const syntaxStyle     = isDark ? vscDarkPlus : oneLight

  // Large files skip syntax highlighting — prism's whole-content tokenization would block the UI.
  const skipHighlight = !isMd && !isEditing && content.length > HIGHLIGHT_SIZE_LIMIT
  const plainLines = useMemo(() => skipHighlight ? content.split('\n') : null, [skipHighlight, content])

  const codeRenderer = useCallback(({ rows, stylesheet, useInlineStyles }) => (
    <VirtualList
      listRef={listRef}
      rowCount={rows.length}
      rowHeight={LINE_HEIGHT_PX}
      rowProps={{ rows, stylesheet, useInlineStyles, searchMatchSet, currentMatchLine }}
      rowComponent={CodeRow}
      overscanCount={5}
      onRowsRendered={handleRowsRendered}
      style={{ overflowX: 'auto' }}
    />
  ), [searchMatchSet, currentMatchLine, handleRowsRendered])

  return (
    <div ref={innerRef} tabIndex={0} onFocus={onFocus} style={{ display:'flex', flexDirection:'column', height:'100%', outline:'none', background:'var(--surface)' }}>
      <ViewerHeader
        selectedFile={selectedFile} langBadge={langBadge} skipHighlight={skipHighlight}
        isDirty={isDirty} isEditing={isEditing} isMd={isMd} mdTab={mdTab} onMdTabChange={setMdTab}
        externallyChanged={externallyChanged} onReload={onReload}
        diffMode={diffMode} diffSideBySide={diffSideBySide} onToggleSideBySide={toggleSideBySide}
        gitDirty={gitDirty} onEnterDiff={onEnterDiff} onExitDiff={onExitDiff}
        onEnterEdit={onEnterEdit} onExitEdit={onExitEdit} onSave={onSave}
        copied={copied} onCopy={copyAll} lineCount={lineCount} onClose={onClose}
        onBack={onBack} onForward={onForward} canBack={canBack} canForward={canForward}
      />

      {searchOpen && canSearch && (
        <ViewerSearchBar
          inputRef={searchInputRef} query={searchQuery} onQueryChange={handleSearchQueryChange}
          currentMatchIdx={currentMatchIdx} totalMatches={totalMatches}
          onNext={searchNext} onPrev={searchPrev} onClose={closeSearch}
        />
      )}

      {/* Content — code viewer & edit pane fill via flex; markdown flows in scroll container. */}
      <div ref={scrollContainerRef} data-scroll-container onScroll={isMd && !isEditing ? handleMdScroll : undefined} style={{ flex:1, overflow: isFlexLayout ? 'hidden' : 'auto', padding: isFlexLayout ? '0' : isMd ? '24px 32px' : '0', display: isFlexLayout ? 'flex' : 'block', flexDirection:'column', minHeight:0 }}>
        {selectedFile && (
          loading && !content ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', fontSize:'11px', fontFamily:FONT_MONO, letterSpacing:'0.08em', textTransform:'uppercase' }}>loading…</div>
          ) : showDiff ? (
            diffError ? <div style={{ padding:'24px', color:'var(--error)', fontFamily:FONT_MONO, fontSize:'12px', whiteSpace:'pre-wrap' }}>Diff failed: {diffError}</div>
            : !diffData ? <div style={{ padding:'24px', color:'var(--muted)', fontSize:'12px' }}>Loading diff…</div>
            : <DiffView diff={diffData} sideBySide={diffSideBySide} />
          ) : showEditPane ? (
            <EditPane
              textareaRef={textareaRef} editContent={editContent} isMd={isMd} editZoom={editZoom}
              wrapEnabled={wrapEnabled} resetKey={selectedFile}
              onEditContentChange={onEditContentChange} onSave={onSave} onExitEdit={onExitEdit} onToggleWrap={toggleWrap}
            />
          ) : showPreviewPane ? (
            <MarkdownView content={editContent} isDark={isDark} fileDirPath={fileDirPath} rootPath={rootPath} onLinkOpen={onLinkOpen} brokenHrefs={brokenHrefs} zoom={mdZoom} onTaskToggle={onEditContentChange} onActivateEdit={() => setMdTab('edit')} />
          ) : isMd ? (
            <>
              <MarkdownView content={content} isDark={isDark} fileDirPath={fileDirPath} rootPath={rootPath} onLinkOpen={onLinkOpen} brokenHrefs={brokenHrefs}
                searchQuery={searchOpen ? searchQuery : ''} currentMatchIdx={currentMatchIdx} onMatchesFound={setMdMatchCount} zoom={mdZoom} onTaskToggle={onViewTaskToggle} onActivateEdit={onEnterEdit} />
              <BacklinksPanel path={selectedFile?.path} rootPath={rootPath} onLinkOpen={onLinkOpen} />
            </>
          ) : skipHighlight ? (
            <VirtualList
              listRef={listRef}
              rowCount={plainLines.length}
              rowHeight={LINE_HEIGHT_PX}
              rowProps={{ lines: plainLines, searchMatchSet, currentMatchLine }}
              rowComponent={PlainCodeRow}
              overscanCount={5}
              onRowsRendered={handleRowsRendered}
              style={{ overflowX: 'auto', flex: 1, minHeight: 0 }}
            />
          ) : (
            <SyntaxHighlighter
              language={ext || 'text'}
              style={syntaxStyle}
              wrapLines
              renderer={codeRenderer}
              PreTag="div"
              CodeTag="div"
              customStyle={{ margin:0, padding:0, background:'transparent', display:'flex', flexDirection:'column', flex:1, minHeight:0 }}
              codeTagProps={{ style: { display:'flex', flexDirection:'column', flex:1, minHeight:0 } }}
            >
              {content}
            </SyntaxHighlighter>
          )
        )}
      </div>
    </div>
  )
}

export default FileViewer
