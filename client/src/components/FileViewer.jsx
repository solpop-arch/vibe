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
import { resolveKey, LINE_HEIGHT_PX, EDIT_PADDING_PX, LINE_NUM_WIDTH, FONT_MONO, FONT_UI, EXT_TO_DISPLAY, HIGHLIGHT_SIZE_LIMIT } from '../constants'

const NavBtn = ({ onClick, enabled, title, label, glyph }) => (
  <button onClick={onClick} disabled={!enabled} title={title} aria-label={label}
    onMouseEnter={e => { if (enabled) e.currentTarget.style.color = 'var(--accent)' }}
    onMouseLeave={e => { if (enabled) e.currentTarget.style.color = 'var(--muted)' }}
    style={{ background:'none', border:'none', color: enabled ? 'var(--muted)' : 'var(--border)', cursor: enabled ? 'pointer' : 'default', fontSize:'18px', lineHeight:1, padding:'0 6px', opacity: enabled ? 1 : 0.35, fontFamily: FONT_UI, transition:'color 150ms' }}>
    {glyph}
  </button>
)

const FileViewer = ({
  selectedFile, content, isEditing, editContent, isDirty, isMd, isDark,
  onEditContentChange, onEnterEdit, onExitEdit, onSave,
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0)
  const [copied, setCopied] = useState(false)
  const [wrapEnabled, setWrapEnabled] = useState(false)
  const textareaRef       = useRef(null)
  const lineNumbersRef    = useRef(null)
  const searchInputRef    = useRef(null)
  const listRef           = useRef(null)
  const scrollContainerRef = useRef(null)
  const pendingScrollRef  = useRef(null)
  const lastViewScrollRef = useRef(null)  // { type:'code', line } | { type:'md', ratio }
  const ext = selectedFile?.name.split('.').pop()?.toLowerCase() ?? ''
  const langBadge = EXT_TO_DISPLAY[ext] || ext || '—'

  const handleTextareaScroll = useCallback((e) => {
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop
  }, [])

  const [mdMatchCount, setMdMatchCount] = useState(0)
  const [brokenHrefs, setBrokenHrefs] = useState(null)
  const [mdZoom, setMdZoom] = useState(() => {
    const n = parseFloat(localStorage.getItem('vibe-md-zoom'))
    return Number.isFinite(n) && n >= 0.5 && n <= 3 ? n : 1
  })
  useEffect(() => { localStorage.setItem('vibe-md-zoom', String(mdZoom)) }, [mdZoom])

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

  const searchMatches = useMemo(() => {
    if (!searchQuery || !content || isMd) return []
    const q = searchQuery.toLowerCase()
    const lines = content.split('\n')
    const matches = []
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) matches.push(i)
    }
    return matches
  }, [searchQuery, content, isMd])

  const totalMatches = isMd ? mdMatchCount : searchMatches.length

  useEffect(() => {
    if (totalMatches === 0) setCurrentMatchIdx(0)
    else if (currentMatchIdx >= totalMatches) setCurrentMatchIdx(0)
  }, [totalMatches])

  useEffect(() => {
    if (isMd) return
    if (searchMatches.length > 0 && listRef.current) {
      listRef.current.scrollToRow({ index: searchMatches[currentMatchIdx], align: 'center' })
    }
  }, [currentMatchIdx, searchMatches, isMd])

  const searchNext = useCallback(() => {
    if (totalMatches === 0) return
    setCurrentMatchIdx(i => (i + 1) % totalMatches)
  }, [totalMatches])

  const searchPrev = useCallback(() => {
    if (totalMatches === 0) return
    setCurrentMatchIdx(i => (i - 1 + totalMatches) % totalMatches)
  }, [totalMatches])

  const openSearch = useCallback(() => {
    setSearchOpen(true)
    setTimeout(() => searchInputRef.current?.focus(), 0)
  }, [])

  // Expose openSearch to parent via ref
  useEffect(() => {
    if (openSearchRef) openSearchRef.current = openSearch
  }, [openSearchRef, openSearch])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setCurrentMatchIdx(0)
  }, [])

  // Expose "close if open" so the parent's Esc path can swallow before closing the file
  useEffect(() => {
    if (!closeSearchRef) return
    closeSearchRef.current = () => {
      if (!searchOpen) return false
      closeSearch()
      return true
    }
  }, [closeSearchRef, searchOpen, closeSearch])

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
          el.scrollTop = Math.max(0, last.line * LINE_HEIGHT_PX)
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

  // Cmd +/- zoom for markdown preview. Cmd+0 resets.
  const mdZoomActive = isMd && !diffMode && (!isEditing || mdTab === 'preview')
  useEffect(() => {
    if (!mdZoomActive) return
    const handle = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        setMdZoom(z => Math.min(3, Math.round((z + 0.1) * 100) / 100))
      } else if (e.key === '-') {
        e.preventDefault()
        setMdZoom(z => Math.max(0.5, Math.round((z - 0.1) * 100) / 100))
      } else if (e.key === '0') {
        e.preventDefault()
        setMdZoom(1)
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [mdZoomActive])

  const handleTextareaKeyDown = useCallback((e) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const s = e.target.selectionStart, end = e.target.selectionEnd
      onEditContentChange(editContent.slice(0, s) + '  ' + editContent.slice(end))
      requestAnimationFrame(() => { if (textareaRef.current) { textareaRef.current.selectionStart = s + 2; textareaRef.current.selectionEnd = s + 2 } })
    } else if ((e.metaKey || e.ctrlKey) && resolveKey(e.key) === 's') { e.preventDefault(); onSave() }
    else if (e.altKey && resolveKey(e.key) === 'z') { e.preventDefault(); setWrapEnabled(w => !w) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onExitEdit() }
  }, [editContent, onEditContentChange, onSave, onExitEdit])

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
  const lineNumbersText = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => String(i + 1)).join('\n'),
    [lineCount]
  )
  const syntaxStyle     = isDark ? vscDarkPlus : oneLight

  useEffect(() => {
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = 0
  }, [selectedFile, isEditing])

  const searchMatchSet = useMemo(() => new Set(searchMatches), [searchMatches])
  const currentMatchLine = searchMatches.length > 0 ? searchMatches[currentMatchIdx] : -1

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
      {/* Header */}
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
              <button key={tab} onClick={() => setMdTab(tab)} style={{ background:'none', border:'none', padding:'4px 12px', fontSize:'12px', cursor:'pointer', color: mdTab === tab ? 'var(--accent)' : 'var(--muted)', borderBottom: mdTab === tab ? '2px solid var(--accent)' : '2px solid transparent', fontFamily:FONT_UI }}>
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
              <button onClick={onExitEdit} style={{ background:'none', border:'1px solid var(--border)', color:'var(--muted)', cursor:'pointer', fontSize:'11px', padding:'2px 8px', borderRadius:'4px', fontFamily:FONT_UI }}>View</button>
            </>
          ) : diffMode ? (
            <>
              <button onClick={() => setDiffSideBySide(p => !p)} title="Shift+D"
                style={{ background: diffSideBySide ? 'var(--accent-sub)' : 'none', border:`1px solid ${diffSideBySide ? 'var(--accent)' : 'var(--border)'}`, color: diffSideBySide ? 'var(--accent)' : 'var(--muted)', cursor:'pointer', fontSize:'11px', padding:'2px 8px', borderRadius:'4px', fontFamily:FONT_UI }}>
                {diffSideBySide ? 'Split' : 'Inline'}
              </button>
              <button onClick={onExitDiff} style={{ background:'none', border:'1px solid var(--border)', color:'var(--muted)', cursor:'pointer', fontSize:'11px', padding:'2px 8px', borderRadius:'4px', fontFamily:FONT_UI }}>V View</button>
            </>
          ) : (
            <>
              <button onClick={copyAll} title="Copy all"
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

      {/* Search bar */}
      {searchOpen && canSearch && (
        <div style={{ height:'32px', minHeight:'32px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 16px', gap:'8px', flexShrink:0, background:'var(--surface-2)' }}>
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setCurrentMatchIdx(0) }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? searchPrev() : searchNext() }
              else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                e.nativeEvent.stopImmediatePropagation()
                closeSearch()
              }
            }}
            placeholder="Search…"
            spellCheck={false}
            style={{ flex:'0 1 240px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'4px', padding:'4px 8px', fontSize:'12px', fontFamily:FONT_MONO, color:'var(--text)', outline:'none' }}
          />
          <span style={{ fontSize:'11px', color:'var(--muted)', fontFamily:FONT_MONO, minWidth:'48px' }}>
            {searchQuery ? `${totalMatches > 0 ? currentMatchIdx + 1 : 0}/${totalMatches}` : ''}
          </span>
          <button onClick={searchPrev} disabled={totalMatches === 0} style={{ background:'none', border:'none', color: totalMatches > 0 ? 'var(--text)' : 'var(--muted)', cursor:'pointer', fontSize:'12px', padding:'4px 6px', lineHeight:1 }}>&#x25B2;</button>
          <button onClick={searchNext} disabled={totalMatches === 0} style={{ background:'none', border:'none', color: totalMatches > 0 ? 'var(--text)' : 'var(--muted)', cursor:'pointer', fontSize:'12px', padding:'4px 6px', lineHeight:1 }}>&#x25BC;</button>
          <button onClick={closeSearch} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'14px', padding:'4px 6px', lineHeight:1 }}>&times;</button>
        </div>
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
            <div style={{ display:'flex', flex:1, overflow:'hidden', minHeight:0 }}>
              <pre ref={lineNumbersRef} style={{
                margin: 0,
                padding: `${EDIT_PADDING_PX}px 12px 0 0`,
                width: LINE_NUM_WIDTH,
                flexShrink: 0,
                overflow: 'hidden',
                borderRight: '1px solid var(--border)',
                background: 'var(--surface)',
                fontFamily: FONT_MONO,
                fontSize: '12.5px',
                lineHeight: `${LINE_HEIGHT_PX}px`,
                color: 'var(--border)',
                textAlign: 'right',
                userSelect: 'none',
                whiteSpace: 'pre',
              }}>{lineNumbersText}</pre>
              <textarea ref={textareaRef} value={editContent} onChange={e => onEditContentChange(e.target.value)} onKeyDown={handleTextareaKeyDown}
                onScroll={handleTextareaScroll}
                spellCheck={false}
                wrap={wrapEnabled ? 'soft' : 'off'}
                style={{ flex:1, background:'var(--surface)', color:'var(--text)', border:'none', outline:'none', resize:'none', padding:`${EDIT_PADDING_PX}px`, fontFamily:FONT_MONO, fontSize:'12.5px', lineHeight:`${LINE_HEIGHT_PX}px`, letterSpacing:'0.01em', whiteSpace: wrapEnabled ? 'pre-wrap' : 'pre', wordBreak: wrapEnabled ? 'break-all' : undefined }} />
            </div>
          ) : showPreviewPane ? (
            <MarkdownView content={editContent} isDark={isDark} fileDirPath={fileDirPath} rootPath={rootPath} onLinkOpen={onLinkOpen} brokenHrefs={brokenHrefs} zoom={mdZoom} />
          ) : isMd ? (
            <>
              <MarkdownView content={content} isDark={isDark} fileDirPath={fileDirPath} rootPath={rootPath} onLinkOpen={onLinkOpen} brokenHrefs={brokenHrefs}
                searchQuery={searchOpen ? searchQuery : ''} currentMatchIdx={currentMatchIdx} onMatchesFound={setMdMatchCount} zoom={mdZoom} />
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
