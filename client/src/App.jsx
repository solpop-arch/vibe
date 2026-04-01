import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import * as api from './api'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Maps non-Latin key values to their Latin equivalents.
// Add entries here to support additional keyboard layouts/languages.
const KEY_ALIASES = {
  // Korean (2-set standard) → Latin
  'ㅂ': 'q', 'ㅈ': 'w', 'ㄷ': 'e', 'ㄱ': 'r', 'ㅅ': 't',
  'ㅛ': 'y', 'ㅕ': 'u', 'ㅑ': 'i', 'ㅐ': 'o', 'ㅔ': 'p',
  'ㅁ': 'a', 'ㄴ': 's', 'ㅇ': 'd', 'ㄹ': 'f', 'ㅎ': 'g',
  'ㅗ': 'h', 'ㅓ': 'j', 'ㅏ': 'k', 'ㅣ': 'l',
  'ㅋ': 'z', 'ㅌ': 'x', 'ㅊ': 'c', 'ㅍ': 'v',
  'ㅠ': 'b', 'ㅜ': 'n', 'ㅡ': 'm',
  '₩': '`',
}
const resolveKey = (key) => KEY_ALIASES[key] ?? key

// Hoisted to module level so ReactMarkdown gets a stable reference across renders
const MARKDOWN_COMPONENTS = {
  h1: ({children}) => <h1 style={{ color: '#e0e0e0', borderBottom: '1px solid #333', paddingBottom: '8px', marginBottom: '16px' }}>{children}</h1>,
  h2: ({children}) => <h2 style={{ color: '#e0e0e0', borderBottom: '1px solid #333', paddingBottom: '6px', marginTop: '24px', marginBottom: '12px' }}>{children}</h2>,
  h3: ({children}) => <h3 style={{ color: '#e0e0e0', marginTop: '20px', marginBottom: '8px' }}>{children}</h3>,
  p: ({children}) => <p style={{ marginBottom: '12px' }}>{children}</p>,
  code: ({children, className, node}) => {
    const isBlock = node?.position?.start?.line !== node?.position?.end?.line || !!className;
    return isBlock
      ? <SyntaxHighlighter language={className?.replace('language-', '') || 'text'} style={vscDarkPlus} customStyle={{ borderRadius: '6px', fontSize: '12px', marginBottom: '12px' }}>{String(children).replace(/\n$/, '')}</SyntaxHighlighter>
      : <code style={{ background: '#2d2d2d', padding: '2px 6px', borderRadius: '3px', color: '#f8c555', fontSize: '12px' }}>{children}</code>;
  },
  a: ({href, children}) => <a href={href} style={{ color: '#00bcd4' }} target="_blank" rel="noreferrer">{children}</a>,
  ul: ({children}) => <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>{children}</ul>,
  ol: ({children}) => <ol style={{ paddingLeft: '20px', marginBottom: '12px' }}>{children}</ol>,
  li: ({children}) => <li style={{ marginBottom: '4px' }}>{children}</li>,
  blockquote: ({children}) => <blockquote style={{ borderLeft: '3px solid #00bcd4', paddingLeft: '12px', margin: '0 0 12px 0', color: '#999' }}>{children}</blockquote>,
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '20px 0' }} />,
  strong: ({children}) => <strong style={{ color: '#e0e0e0' }}>{children}</strong>,
  table: ({children}) => <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '16px', fontSize: '13px' }}>{children}</table>,
  thead: ({children}) => <thead style={{ borderBottom: '1px solid #444' }}>{children}</thead>,
  th: ({children}) => <th style={{ padding: '6px 12px', textAlign: 'left', color: '#e0e0e0', fontWeight: '600', whiteSpace: 'nowrap' }}>{children}</th>,
  td: ({children}) => <td style={{ padding: '6px 12px', borderBottom: '1px solid #2a2a2a', color: '#ccc' }}>{children}</td>,
  tr: ({children}) => <tr>{children}</tr>,
}

const MarkdownView = ({ content }) => (
  <div style={{ color: '#ccc', lineHeight: '1.7', fontSize: '13px' }}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
      {content}
    </ReactMarkdown>
  </div>
)

const FileExplorer = ({ onFileSelect, isFocused, onFocus, innerRef, onAtRootChange, refreshKey }) => {
  const [files, setFiles] = useState([])
  const [currentPath, setCurrentPath] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [naming, setNaming] = useState({ active: false, type: '', value: '', oldPath: '' })
  const rootPath = useRef('')
  const inputRef = useRef(null)

  const fetchFiles = useCallback(async (path = '', selectName = null) => {
    try {
      const data = await api.listFiles(path)
      if (data.currentPath) {
        if (!rootPath.current) rootPath.current = data.currentPath
        setCurrentPath(data.currentPath)
        onAtRootChange(data.currentPath === rootPath.current)
      }
      const newFiles = data.items || []
      setFiles(newFiles)
      if (selectName) {
        const idx = newFiles.findIndex(f => f.name === selectName)
        if (idx !== -1) setSelectedIndex(idx)
      } else {
        setSelectedIndex(0)
      }
    } catch (err) {
      console.error('Failed to fetch files:', err)
    }
  }, [onAtRootChange])

  useEffect(() => { fetchFiles() }, [fetchFiles])

  // Re-fetch when file watcher triggers a refresh
  useEffect(() => {
    if (refreshKey > 0) fetchFiles(currentPath)
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (naming.active && inputRef.current) {
      inputRef.current.focus()
      // Select filename part for rename
      if (naming.type === 'rename') {
        const dotIndex = naming.value.lastIndexOf('.')
        inputRef.current.setSelectionRange(0, dotIndex > 0 ? dotIndex : naming.value.length)
      }
    }
  }, [naming.active, naming.type, naming.value])

  const handleNamingSubmit = async (e) => {
    e.preventDefault()
    if (!naming.value) { setNaming({ active: false }); return; }
    
    try {
      if (naming.type === 'file' || naming.type === 'dir') {
        await api.createItem(currentPath + '/' + naming.value, naming.type === 'dir')
      } else if (naming.type === 'rename') {
        await api.renameItem(naming.oldPath, currentPath + '/' + naming.value)
      } else {
        return
      }
      const newName = naming.value
      setNaming({ active: false })
      fetchFiles(currentPath, newName)
    } catch (err) { console.error('Action failed:', err) }
  }

  const handleDelete = async () => {
    const file = files[selectedIndex]
    if (!file) return
    if (!window.confirm(`Delete ${file.name}?`)) return
    
    try {
      await api.deleteItem(file.path)
      onFileSelect(null)
      fetchFiles(currentPath)
    } catch (err) { console.error('Delete failed:', err) }
  }

  const copyPath = () => {
    const file = files[selectedIndex]
    if (!file) return
    const relPath = file.path.replace(rootPath.current + '/', '').replace(rootPath.current, '.')
    navigator.clipboard.writeText(relPath)
  }

  useEffect(() => {
    if (!isFocused || naming.active) return;
    const handleKeyDown = (e) => {
      const key = resolveKey(e.key).toLowerCase() // Normalize to lowercase
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(files.length - 1, prev + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const file = files[selectedIndex];
        if (file) {
          if (file.isDirectory) fetchFiles(file.path);
          else onFileSelect(file);
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        if (currentPath === rootPath.current) return;
        fetchFiles(currentPath + '/..');
      } else if (key === 'a') {
        e.preventDefault();
        setNaming({ active: true, type: e.shiftKey ? 'dir' : 'file', value: '', oldPath: '' });
      } else if (key === 'r') {
        e.preventDefault();
        const file = files[selectedIndex];
        if (file) setNaming({ active: true, type: 'rename', value: file.name, oldPath: file.path });
      } else if (e.key === 'Delete' || (e.metaKey && e.key === 'Backspace')) {
        e.preventDefault();
        handleDelete();
      } else if (key === 'c') {
        e.preventDefault();
        copyPath();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocused, files, selectedIndex, fetchFiles, onFileSelect, currentPath, naming.active, handleDelete]);

  const renderNamingInput = () => (
    <form onSubmit={handleNamingSubmit} style={{ padding: '4px 8px' }}>
      <input
        ref={inputRef}
        value={naming.value}
        onChange={e => setNaming({ ...naming, value: e.target.value })}
        onBlur={() => setNaming({ active: false })}
        onKeyDown={e => { if (e.key === 'Escape') setNaming({ active: false }) }}
        style={{
          width: '100%', background: '#222', border: '1px solid #00bcd4', color: '#fff',
          fontSize: '12px', padding: '2px 4px', borderRadius: '2px', outline: 'none'
        }}
      />
    </form>
  )

  return (
    <div
      ref={innerRef} tabIndex={0} onFocus={onFocus}
      style={{
        padding: '10px', color: '#ccc', fontSize: '13px', height: '100%', overflowY: 'auto',
        border: isFocused ? '1px solid #00bcd4' : '1px solid transparent',
        boxSizing: 'border-box', transition: 'border 0.2s', outline: 'none'
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '10px', color: '#00bcd4', fontSize: '12px' }}>Project</div>
      
      {/* New Item Input at Top */}
      {naming.active && (naming.type === 'file' || naming.type === 'dir') && renderNamingInput()}

      {files.map((file, idx) => (
        <div key={file.path}>
          {naming.active && naming.type === 'rename' && idx === selectedIndex ? (
            renderNamingInput()
          ) : (
            <div
              onClick={() => { setSelectedIndex(idx); if (file.isDirectory) fetchFiles(file.path); else onFileSelect(file); }}
              style={{
                padding: '4px 8px', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px',
                backgroundColor: idx === selectedIndex && isFocused ? '#333' : 'transparent',
                color: idx === selectedIndex && isFocused ? '#00bcd4' : '#ccc'
              }}
            >
              <span>{file.isDirectory ? '📁' : '📄'}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Footer shortcut definitions (static arrays hoisted to module level) ──────
const SHORTCUTS_VIEWER_VIEW = [
  ['E',      'Edit'],
  ['Enter',  'Fullscreen'],
  ['Esc',    'Close'],
]

const SHORTCUTS_VIEWER_FULLSCREEN = [
  ['E',          'Edit'],
  ['Enter / Esc', 'Exit fullscreen'],
]

const SHORTCUTS_VIEWER_EDIT = [
  ['Tab',    'Indent'],
  ['Ctrl+S', 'Save'],
  ['Esc',    'Exit edit'],
]

const SHORTCUTS_VIEWER_EDIT_MD = [
  ['Tab',    'Indent'],
  ['Ctrl+P', 'Edit/Preview'],
  ['Ctrl+S', 'Save'],
  ['Esc',    'Exit edit'],
]

const FileViewer = ({
  selectedFile, content, isEditing, editContent, isDirty, isMd,
  onEditContentChange, onEnterEdit, onExitEdit, onSave,
  isFocused, onFocus, onClose, onToggleFullscreen, innerRef
}) => {
  const [mdTab, setMdTab] = useState('edit')
  const textareaRef = useRef(null)
  const lineNumbersRef = useRef(null)
  const ext = selectedFile?.name.split('.').pop() ?? ''

  useEffect(() => { setMdTab('edit') }, [selectedFile])

  useEffect(() => {
    if (isEditing && textareaRef.current) textareaRef.current.focus()
  }, [isEditing])

  // View mode keyboard shortcuts
  useEffect(() => {
    if (!isFocused || isEditing) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onToggleFullscreen(); }
      if (resolveKey(e.key) === 'e') { e.preventDefault(); onEnterEdit(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocused, isEditing, onToggleFullscreen, onEnterEdit]);

  // Edit mode keyboard shortcuts (active regardless of which tab is shown)
  useEffect(() => {
    if (!isEditing || !isMd) return;
    const handleKeyDown = (e) => {
      if (e.ctrlKey && resolveKey(e.key) === 'p') {
        e.preventDefault();
        setMdTab(prev => prev === 'edit' ? 'preview' : 'edit');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, isMd]);

  const handleTextareaKeyDown = useCallback((e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = e.target.selectionStart;
      const end = e.target.selectionEnd;
      onEditContentChange(editContent.slice(0, s) + '  ' + editContent.slice(end));
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = s + 2;
          textareaRef.current.selectionEnd = s + 2;
        }
      });
    } else if (e.ctrlKey && resolveKey(e.key) === 's') {
      e.preventDefault();
      onSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onExitEdit();
    }
  }, [editContent, onEditContentChange, onSave, onExitEdit]);

  const showEditPane = isEditing && (!isMd || mdTab === 'edit');
  const showPreviewPane = isEditing && isMd && mdTab === 'preview';

  return (
    <div
      ref={innerRef} tabIndex={0} onFocus={onFocus}
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        border: isFocused ? '1px solid #00bcd4' : '1px solid transparent',
        boxSizing: 'border-box', transition: 'border 0.2s', outline: 'none',
        backgroundColor: '#1e1e1e'
      }}
    >
      {/* Header */}
      <div style={{
        padding: '10px 15px', color: '#00bcd4', fontSize: '13px', fontWeight: 'bold',
        borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: '8px',
        flexShrink: 0
      }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedFile?.name}{isDirty ? ' ●' : ''}
        </span>

        {/* Markdown edit/preview tabs */}
        {isEditing && isMd && (
          <div style={{ display: 'flex', gap: '2px', background: '#2a2a2a', borderRadius: '4px', padding: '2px' }}>
            {['edit', 'preview'].map(tab => (
              <button key={tab} onClick={() => setMdTab(tab)} style={{
                background: mdTab === tab ? '#3a3a3a' : 'transparent',
                border: 'none', color: mdTab === tab ? '#00bcd4' : '#555',
                cursor: 'pointer', fontSize: '11px', padding: '2px 8px', borderRadius: '3px'
              }}>{tab === 'edit' ? 'Edit' : 'Preview'}</button>
            ))}
          </div>
        )}

        {isEditing ? (
          <>
            <button onClick={onSave} disabled={!isDirty} style={{
              background: isDirty ? '#1a3a1a' : 'transparent',
              border: `1px solid ${isDirty ? '#4caf50' : '#333'}`,
              color: isDirty ? '#4caf50' : '#444',
              cursor: isDirty ? 'pointer' : 'default',
              fontSize: '11px', padding: '3px 10px', borderRadius: '4px'
            }}>Save</button>
            <button onClick={onExitEdit} style={{
              background: 'transparent', border: '1px solid #444', color: '#aaa',
              cursor: 'pointer', fontSize: '11px', padding: '3px 10px', borderRadius: '4px'
            }}>View</button>
          </>
        ) : (
          <button onClick={onEnterEdit} style={{
            background: 'transparent', border: '1px solid #00bcd4', color: '#00bcd4',
            cursor: 'pointer', fontSize: '11px', padding: '3px 10px', borderRadius: '4px'
          }}>Edit</button>
        )}

        <button onClick={onClose} style={{
          background: 'transparent', border: 'none', color: '#666',
          cursor: 'pointer', fontSize: '16px', lineHeight: '1', padding: '0 5px'
        }}>&times;</button>
      </div>

      {/* Content */}
      <div style={{
        flex: 1, overflow: showEditPane ? 'hidden' : 'auto',
        padding: showEditPane ? '0' : '15px',
        display: showEditPane ? 'flex' : 'block', flexDirection: 'column'
      }}>
        {selectedFile && (
          showEditPane ? (
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Line number gutter */}
              <div
                ref={lineNumbersRef}
                style={{
                  padding: '15px 10px 15px 12px', background: '#1e1e1e', color: '#444',
                  fontSize: '13px', lineHeight: '1.5', fontFamily: 'MesloLGS NF, monospace',
                  textAlign: 'right', userSelect: 'none', overflowY: 'hidden',
                  flexShrink: 0, borderRight: '1px solid #2a2a2a', minWidth: '40px'
                }}
              >
                {editContent.split('\n').map((_, i) => <div key={i}>{i + 1}</div>)}
              </div>
              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={e => onEditContentChange(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                onScroll={e => { if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = e.target.scrollTop }}
                spellCheck={false}
                style={{
                  flex: 1, background: '#1e1e1e', color: '#d4d4d4',
                  border: 'none', outline: 'none', resize: 'none',
                  padding: '15px', boxSizing: 'border-box',
                  fontFamily: 'MesloLGS NF, monospace', fontSize: '13px', lineHeight: '1.5'
                }}
              />
            </div>
          ) : showPreviewPane ? (
            <MarkdownView content={editContent} />
          ) : isMd ? (
            <MarkdownView content={content} />
          ) : (
            <SyntaxHighlighter
              language={ext || 'text'}
              style={vscDarkPlus}
              showLineNumbers={true}
              lineNumberStyle={{ color: '#444', fontSize: '12px', minWidth: '2.5em' }}
              customStyle={{ margin: 0, padding: 0, background: 'transparent', fontSize: '13px' }}
            >
              {content}
            </SyntaxHighlighter>
          )
        )}
      </div>
    </div>
  )
}

function App() {
  const explorerRef = useRef(null)
  const viewerRef = useRef(null)

  // Refs for stale closure access
  const selectedFileRef = useRef(null)
  const viewerFullscreenRef = useRef(false)
  const isEditingRef = useRef(false)
  const editContentRef = useRef('')
  const fileContentRef = useRef('')
  const requireCleanRef = useRef(null)
  const handleEscapeKeyRef = useRef(null)

  const [rootReady, setRootReady] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileContent, setFileContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [pendingAction, setPendingAction] = useState(null)
  const [activeFocus, setActiveFocus] = useState('explorer')
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [viewerFullscreen, setViewerFullscreen] = useState(false)
  const [explorerAtRoot, setExplorerAtRoot] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  // Keep refs current on every render (synchronous, no useEffect lag)
  selectedFileRef.current = selectedFile
  viewerFullscreenRef.current = viewerFullscreen
  isEditingRef.current = isEditing
  editContentRef.current = editContent
  fileContentRef.current = fileContent

  const isDirty = isEditing && editContent !== fileContent

  // Load content when selected file changes
  useEffect(() => {
    if (!selectedFile || selectedFile.isDirectory) { setFileContent(''); return; }
    setIsEditing(false);
    setEditContent('');
    api.readFile(selectedFile.path)
      .then(d => setFileContent(d.content || ''))
      .catch(() => setFileContent('Error loading file content.'));
  }, [selectedFile])

  const handleFocusChange = useCallback((target) => {
    setActiveFocus(target);
    setTimeout(() => {
      if (target === 'explorer' && explorerRef.current) explorerRef.current.focus();
      else if (target === 'viewer' && viewerRef.current) viewerRef.current.focus();
    }, 10);
  }, []);

  const saveFile = useCallback(async () => {
    if (!selectedFileRef.current) return;
    const content = editContentRef.current;
    try {
      await api.writeFile(selectedFileRef.current.path, content);
      setFileContent(content);
    } catch (e) { console.error('Save failed:', e); }
  }, []);

  const executeAction = useCallback((action) => {
    setPendingAction(null);
    setIsEditing(false);
    switch (action.type) {
      case 'close':
        setSelectedFile(null);
        setFileContent('');
        setViewerFullscreen(false);
        handleFocusChange('explorer');
        break;
      case 'changeFile':
        setSelectedFile(action.file);
        handleFocusChange('viewer');
        break;
      case 'exitEdit':
        break;
      default:
        console.warn('Unknown action type:', action.type);
    }
  }, [handleFocusChange]);

  const requireClean = useCallback((action) => {
    const dirty = isEditingRef.current && editContentRef.current !== fileContentRef.current;
    if (dirty) setPendingAction(action);
    else executeAction(action);
  }, [executeAction]);

  // Keep function refs current for stale closures
  requireCleanRef.current = requireClean;

  const toggleViewerFullscreen = useCallback(() => {
    setViewerFullscreen(prev => !prev);
  }, []);

  const handleFileSelect = useCallback((file) => requireClean({ type: 'changeFile', file }), [requireClean]);

  const toggleSidebar = useCallback(() => {
    setSidebarVisible(prev => !prev);
  }, []);

  const enterEditMode = useCallback(() => {
    setEditContent(fileContentRef.current);
    setIsEditing(true);
  }, []);

  const exitEditMode = useCallback(() => requireClean({ type: 'exitEdit' }), [requireClean]);
  const closeViewer = useCallback(() => requireClean({ type: 'close' }), [requireClean]);
  const focusExplorer = useCallback(() => setActiveFocus('explorer'), []);
  const focusViewer = useCallback(() => setActiveFocus('viewer'), []);

  const handleUnsavedSave = useCallback(async () => {
    const action = pendingAction;
    await saveFile();
    executeAction(action);
  }, [saveFile, pendingAction, executeAction]);

  const handleUnsavedDiscard = useCallback(() => {
    executeAction(pendingAction);
  }, [pendingAction, executeAction]);

  // Shared Escape handler — used by both terminal key handler and global keydown
  const handleEscapeKey = () => {
    if (isEditingRef.current) { requireCleanRef.current({ type: 'exitEdit' }); return; }
    if (viewerFullscreenRef.current) { setViewerFullscreen(false); return; }
    if (selectedFileRef.current) { requireCleanRef.current({ type: 'close' }); return; }
    handleFocusChange('explorer');
  };
  handleEscapeKeyRef.current = handleEscapeKey;

  // Check if root is set (via CLI arg) or prompt to pick folder
  useEffect(() => {
    api.getRoot()
      .then(() => setRootReady(true))
      .catch(() => setRootReady(false))
  }, [])

  // File watcher: auto-refresh on file changes
  useEffect(() => {
    const unlistenRef = { current: null }
    let unmounted = false
    api.onFileChanged((payload) => {
      setRefreshKey(k => k + 1)
      if (selectedFileRef.current && payload.paths?.includes(selectedFileRef.current.path)) {
        if (!isEditingRef.current) {
          api.readFile(selectedFileRef.current.path)
            .then(d => setFileContent(d.content || ''))
            .catch(() => {})
        }
      }
    }).then(fn => {
      if (unmounted) fn()
      else unlistenRef.current = fn
    })
    return () => { unmounted = true; unlistenRef.current?.() }
  }, [])

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const key = resolveKey(e.key);
      if (e.ctrlKey && key === 'b') { e.preventDefault(); toggleSidebar(); }
      else if (e.key === 'Escape') { e.preventDefault(); handleEscapeKeyRef.current(); }
    };
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [toggleSidebar])

  const isMd = selectedFile?.name.split('.').pop() === 'md'

  const footerShortcuts = useMemo(() => {
    if (activeFocus === 'viewer') {
      if (isEditing) return isMd ? SHORTCUTS_VIEWER_EDIT_MD : SHORTCUTS_VIEWER_EDIT
      if (viewerFullscreen) return SHORTCUTS_VIEWER_FULLSCREEN
      return SHORTCUTS_VIEWER_VIEW
    }
    return [
      ['↑↓',                       'Navigate'],
      ...(!explorerAtRoot ? [['⌫', 'Parent dir']] : []),
      ['A/Shift+A',                'New File/Dir'],
      ['R',                        'Rename'],
      ['Del',                      'Delete'],
      ['C',                        'Copy path'],
      ['Ctrl+B',                   'Sidebar'],
      ['Enter',                    'Open'],
    ]
  }, [activeFocus, isEditing, isMd, viewerFullscreen, explorerAtRoot])

  const lineCount = useMemo(() => {
    if (!selectedFile || selectedFile.isDirectory) return null
    return (isEditing ? editContent : fileContent).split('\n').length
  }, [selectedFile, isEditing, editContent, fileContent])

  const handlePickFolder = async () => {
    const path = await api.pickFolder()
    if (path) {
      await api.setRoot(path)
      setRootReady(true)
    }
  }

  if (!rootReady) {
    return (
      <div style={{
        width: '100%', height: '100vh', backgroundColor: '#1a1a1a',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '20px'
      }}>
        <h1 style={{ color: '#e0e0e0', fontSize: '24px', fontWeight: '300' }}>vibe</h1>
        <p style={{ color: '#666', fontSize: '14px' }}>프로젝트 폴더를 선택하세요</p>
        <button onClick={handlePickFolder} style={{
          background: '#1a3a3a', border: '1px solid #00bcd4', color: '#00bcd4',
          cursor: 'pointer', padding: '10px 24px', borderRadius: '6px', fontSize: '14px'
        }}>폴더 열기...</button>
        <p style={{ color: '#444', fontSize: '12px', marginTop: '20px' }}>
          또는 CLI에서: <code style={{ color: '#555' }}>vibe /path/to/project</code>
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100vh', backgroundColor: '#1a1a1a', overflow: 'hidden' }}>

      {/* Unsaved changes prompt */}
      {pendingAction && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: '#252525', border: '1px solid #444', borderRadius: '8px',
            padding: '24px 32px', textAlign: 'center', minWidth: '280px'
          }}>
            <p style={{ marginBottom: '20px', color: '#e0e0e0', fontSize: '14px' }}>저장하지 않은 변경사항이 있습니다.</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button onClick={handleUnsavedSave} style={{
                background: '#1a3a1a', border: '1px solid #4caf50', color: '#4caf50',
                cursor: 'pointer', padding: '6px 16px', borderRadius: '4px', fontSize: '13px'
              }}>저장</button>
              <button onClick={handleUnsavedDiscard} style={{
                background: '#3a1a1a', border: '1px solid #f44336', color: '#f44336',
                cursor: 'pointer', padding: '6px 16px', borderRadius: '4px', fontSize: '13px'
              }}>버리기</button>
              <button onClick={() => setPendingAction(null)} style={{
                background: '#2a2a2a', border: '1px solid #555', color: '#aaa',
                cursor: 'pointer', padding: '6px 16px', borderRadius: '4px', fontSize: '13px'
              }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* Main row: sidebar + content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{
          width: sidebarVisible ? '250px' : '0px', opacity: sidebarVisible ? 1 : 0,
          visibility: sidebarVisible ? 'visible' : 'hidden', display: 'flex', flexDirection: 'column',
          borderRight: sidebarVisible ? '1px solid #333' : 'none', flexShrink: 0,
          backgroundColor: '#1a1a1a', transition: 'width 0.3s ease-in-out, opacity 0.2s ease-in-out'
        }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <FileExplorer
              innerRef={explorerRef}
              onFocus={focusExplorer}
              onFileSelect={handleFileSelect}
              isFocused={activeFocus === 'explorer'}
              onAtRootChange={setExplorerAtRoot}
              refreshKey={refreshKey}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', backgroundColor: '#1e1e1e' }}>
          {selectedFile && (
            <div style={{ flex: viewerFullscreen ? '0 0 100%' : 1, minWidth: viewerFullscreen ? '100%' : '40%', borderRight: '1px solid #333', overflow: 'hidden' }}>
              <FileViewer
                innerRef={viewerRef}
                onFocus={focusViewer}
                onClose={closeViewer}
                onToggleFullscreen={toggleViewerFullscreen}
                onEnterEdit={enterEditMode}
                onExitEdit={exitEditMode}
                onSave={saveFile}
                onEditContentChange={setEditContent}
                selectedFile={selectedFile}
                content={fileContent}
                isEditing={isEditing}
                editContent={editContent}
                isDirty={isDirty}
                isMd={isMd}
                isFocused={activeFocus === 'viewer'}
              />
            </div>
          )}

          {/* Viewer takes full remaining space when no terminal */}
          {!selectedFile && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: '14px' }}>
              Select a file to view
            </div>
          )}
        </div>

      </div>

      {/* Footer */}
      <div style={{
        height: '22px', backgroundColor: '#161616', borderTop: '1px solid #2a2a2a',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px', flexShrink: 0
      }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          {footerShortcuts.map(([key, desc]) => (
            <span key={key} style={{ fontSize: '11px', color: '#555' }}>
              <span style={{ color: '#777', fontWeight: '500' }}>{key}</span>{' '}{desc}
            </span>
          ))}
        </div>
        {activeFocus === 'viewer' && lineCount !== null && (
          <span style={{ fontSize: '11px', color: '#555' }}>{lineCount} lines</span>
        )}
      </div>

    </div>
  )
}

export default App
