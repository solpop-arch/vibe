import { useRef, useEffect, useCallback, useMemo } from 'react'
import { resolveKey, EDIT_FONT_PX, LINE_HEIGHT_PX, EDIT_PADDING_PX, LINE_NUM_WIDTH, FONT_MONO } from '../constants'
import { handleOutlineKey, continueList } from '../outline'

// Line-numbered textarea. The parent owns `textareaRef` (it restores scroll and focus
// when entering edit mode) and the wrap flag (survives leaving and re-entering edit).
const EditPane = ({
  textareaRef, editContent, isMd, editZoom, wrapEnabled, resetKey,
  onEditContentChange, onSave, onExitEdit, onToggleWrap,
}) => {
  const lineNumbersRef = useRef(null)

  const handleTextareaScroll = useCallback((e) => {
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop
  }, [])

  const handleTextareaKeyDown = useCallback((e) => {
    // Design Ref: §4 — markdown files get outliner keymaps (Tab/Shift+Tab/Cmd+Arrow).
    // The combo is fully owned (always preventDefault) so a no-op never falls through
    // to the plain insert-spaces path below.
    if (isMd) {
      const isOutlineCombo = e.key === 'Tab'
        || ((e.metaKey || e.ctrlKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))
      if (isOutlineCombo) {
        e.preventDefault()
        const ta = e.target
        const res = handleOutlineKey(editContent, ta.selectionStart, ta.selectionEnd, e)
        if (res) {
          onEditContentChange(res.content)
          requestAnimationFrame(() => {
            if (textareaRef.current) {
              textareaRef.current.selectionStart = res.selStart
              textareaRef.current.selectionEnd = res.selEnd
            }
          })
        }
        return
      }
      // Enter continues a list item onto the next line. Skip during IME
      // composition so a Korean Enter that commits Hangul is left alone.
      if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey
          && !e.nativeEvent?.isComposing && e.keyCode !== 229) {
        const ta = e.target
        const res = continueList(editContent, ta.selectionStart, ta.selectionEnd)
        if (res) {
          e.preventDefault()
          onEditContentChange(res.content)
          requestAnimationFrame(() => {
            if (textareaRef.current) {
              textareaRef.current.selectionStart = res.selStart
              textareaRef.current.selectionEnd = res.selEnd
            }
          })
          return
        }
      }
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const s = e.target.selectionStart, end = e.target.selectionEnd
      onEditContentChange(editContent.slice(0, s) + '  ' + editContent.slice(end))
      requestAnimationFrame(() => { if (textareaRef.current) { textareaRef.current.selectionStart = s + 2; textareaRef.current.selectionEnd = s + 2 } })
    } else if ((e.metaKey || e.ctrlKey) && resolveKey(e.key) === 's') { e.preventDefault(); onSave() }
    else if (e.altKey && resolveKey(e.key) === 'z') { e.preventDefault(); onToggleWrap() }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onExitEdit() }
  }, [isMd, editContent, onEditContentChange, onSave, onExitEdit, onToggleWrap, textareaRef])

  const lineNumbersText = useMemo(() => {
    let n = 1
    for (let i = 0; i < editContent.length; i++) if (editContent[i] === '\n') n++
    return Array.from({ length: n }, (_, i) => String(i + 1)).join('\n')
  }, [editContent])
  const editFontPx = EDIT_FONT_PX * editZoom
  const editLinePx = LINE_HEIGHT_PX * editZoom

  useEffect(() => {
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = 0
  }, [resetKey])

  return (
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
        fontSize: `${editFontPx}px`,
        lineHeight: `${editLinePx}px`,
        color: 'var(--border)',
        textAlign: 'right',
        userSelect: 'none',
        whiteSpace: 'pre',
      }}>{lineNumbersText}</pre>
      <textarea ref={textareaRef} value={editContent} onChange={e => onEditContentChange(e.target.value)} onKeyDown={handleTextareaKeyDown}
        onScroll={handleTextareaScroll}
        spellCheck={false}
        wrap={wrapEnabled ? 'soft' : 'off'}
        style={{ flex:1, background:'var(--surface)', color:'var(--text)', border:'none', outline:'none', resize:'none', padding:`${EDIT_PADDING_PX}px`, fontFamily:FONT_MONO, fontSize:`${editFontPx}px`, lineHeight:`${editLinePx}px`, letterSpacing:'0.01em', whiteSpace: wrapEnabled ? 'pre-wrap' : 'pre', wordBreak: wrapEnabled ? 'break-all' : undefined }} />
    </div>
  )
}

export default EditPane
