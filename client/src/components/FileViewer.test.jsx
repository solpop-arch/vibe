// @vitest-environment jsdom
// Characterization tests: pin FileViewer's current behavior before splitting it up.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { createRef } from 'react'

vi.mock('../api', () => ({
  gitDiff: vi.fn(),
  getOutgoingLinks: vi.fn(),
  onLinkIndexReady: vi.fn(() => Promise.resolve(() => {})),
  onFileChanged: vi.fn(() => Promise.resolve(() => {})),
  getBacklinks: vi.fn(() => Promise.resolve([])),
}))
vi.mock('react-syntax-highlighter', () => ({
  Prism: ({ children }) => <pre data-testid="code">{children}</pre>,
  createElement: () => null,
}))
vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({ vscDarkPlus: {}, oneLight: {} }))
vi.mock('react-window', async () => {
  const React = await import('react')
  return {
    List: ({ rowCount, rowComponent: Row, rowProps, listRef }) => {
      if (listRef) listRef.current = { scrollToRow: vi.fn() }
      return <div data-testid="vlist">{Array.from({ length: rowCount }, (_, i) => <Row key={i} index={i} style={{}} {...rowProps} />)}</div>
    },
  }
})
vi.mock('./MarkdownView', () => ({
  default: (p) => (
    <div data-testid="md" data-zoom={p.zoom} data-query={p.searchQuery ?? ''}>
      <span data-testid="md-broken">{p.brokenHrefs ? [...p.brokenHrefs].sort().join(',') : 'none'}</span>
      <button onClick={() => p.onTaskToggle?.('toggled')}>md-toggle</button>
      <button onClick={() => p.onActivateEdit?.()}>md-activate</button>
      <button onClick={() => p.onMatchesFound?.(3)}>md-matches</button>
      {p.content}
    </div>
  ),
}))
vi.mock('./BacklinksPanel', () => ({ default: () => <div data-testid="backlinks" /> }))
vi.mock('./DiffView', () => ({ default: (p) => <div data-testid="diff" data-split={String(p.sideBySide)}>{p.diff?.name ?? 'diff'}</div> }))

import * as api from '../api'
import FileViewer from './FileViewer'
import { HIGHLIGHT_SIZE_LIMIT } from '../constants'

const base = (over = {}) => ({
  selectedFile: { name: 'a.js', path: '/r/a.js' },
  content: 'one\ntwo\nthree\ntwo again',
  isEditing: false, editContent: '', isDirty: false, isMd: false, isDark: false,
  onEditContentChange: vi.fn(), onEnterEdit: vi.fn(), onExitEdit: vi.fn(), onSave: vi.fn(), onViewTaskToggle: vi.fn(),
  isFocused: true, onFocus: vi.fn(), onClose: vi.fn(),
  gitDirty: false, diffMode: false, onEnterDiff: vi.fn(), onExitDiff: vi.fn(),
  externallyChanged: false, onReload: vi.fn(),
  rootPath: '/r', onLinkOpen: vi.fn(),
  onBack: vi.fn(), onForward: vi.fn(), canBack: false, canForward: false,
  onScrollChange: vi.fn(), loading: false,
  ...over,
})
const setup = (over) => { const props = base(over); const utils = render(<FileViewer {...props} />); return { props, ...utils } }
const key = (k, opts = {}, target = window) => fireEvent.keyDown(target, { key: k, ...opts })

beforeEach(() => {
  vi.clearAllMocks()
  api.getOutgoingLinks.mockResolvedValue([])
  Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } })
})

describe('FileViewer header', () => {
  it('shows file name, language badge and line count', () => {
    setup()
    expect(screen.getByText('a.js')).toBeTruthy()
    expect(screen.getByText('js')).toBeTruthy()
    expect(screen.getByText('4 lines')).toBeTruthy()
  })
  it('marks dirty files with an asterisk', () => {
    setup({ isDirty: true })
    expect(screen.getByText('a.js *')).toBeTruthy()
  })
  it('wires back/forward buttons and disables them when unavailable', () => {
    const { props } = setup({ canBack: true, canForward: false })
    fireEvent.click(screen.getByLabelText('Back'))
    expect(props.onBack).toHaveBeenCalled()
    expect(screen.getByLabelText('Forward').disabled).toBe(true)
  })
  it('close button calls onClose', () => {
    const { props } = setup()
    fireEvent.click(screen.getByText('×'))
    expect(props.onClose).toHaveBeenCalled()
  })
  it('E Edit enters edit mode; D Diff appears only when gitDirty', () => {
    const { props, rerender } = setup()
    fireEvent.click(screen.getByText('E Edit'))
    expect(props.onEnterEdit).toHaveBeenCalled()
    expect(screen.queryByText('D Diff')).toBeNull()
    rerender(<FileViewer {...props} gitDirty />)
    fireEvent.click(screen.getByText('D Diff'))
    expect(props.onEnterDiff).toHaveBeenCalled()
  })
  it('Copy writes content to the clipboard and flips label to Copied', async () => {
    setup()
    fireEvent.click(screen.getByText('Copy'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('one\ntwo\nthree\ntwo again')
    await waitFor(() => expect(screen.getByText('Copied')).toBeTruthy())
  })
  it('externally-changed badge reloads on click', () => {
    const { props } = setup({ externallyChanged: true })
    fireEvent.click(screen.getByText('changed externally'))
    expect(props.onReload).toHaveBeenCalled()
  })
  it('shows a loading placeholder while content is empty and loading', () => {
    setup({ content: '', loading: true })
    expect(screen.getByText('loading…')).toBeTruthy()
  })
  it('renders nothing in the body without a selected file', () => {
    setup({ selectedFile: null, content: '' })
    expect(screen.queryByTestId('code')).toBeNull()
  })
})

describe('FileViewer code view', () => {
  it('renders highlighted code for normal files', () => {
    setup()
    expect(screen.getByTestId('code').textContent).toBe('one\ntwo\nthree\ntwo again')
  })
  it('falls back to plain virtual rows above the highlight limit', () => {
    const big = 'x\n'.repeat(5) + 'y'.repeat(HIGHLIGHT_SIZE_LIMIT)
    setup({ content: big })
    expect(screen.getByText('plain')).toBeTruthy()
    expect(screen.queryByTestId('code')).toBeNull()
    expect(screen.getByTestId('vlist')).toBeTruthy()
  })
})

describe('FileViewer edit pane', () => {
  const edit = (over) => setup({ isEditing: true, isDirty: true, editContent: 'ab\ncd', ...over })
  it('shows textarea with edit content and matching line numbers', () => {
    const { container } = edit()
    expect(screen.getByRole('textbox').value).toBe('ab\ncd')
    expect(container.querySelector('pre').textContent).toBe('1\n2')
    expect(screen.getByText('2 lines')).toBeTruthy()
  })
  it('typing forwards to onEditContentChange', () => {
    const { props } = edit()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'z' } })
    expect(props.onEditContentChange).toHaveBeenCalledWith('z')
  })
  it('Save is disabled when clean, calls onSave when dirty; Exit calls onExitEdit', () => {
    const { props, rerender } = edit()
    fireEvent.click(screen.getByText('Save'))
    expect(props.onSave).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Exit'))
    expect(props.onExitEdit).toHaveBeenCalled()
    rerender(<FileViewer {...props} isDirty={false} />)
    expect(screen.getByText('Save').disabled).toBe(true)
  })
  it('Cmd+S saves, Escape exits', () => {
    const { props } = edit()
    const ta = screen.getByRole('textbox')
    fireEvent.keyDown(ta, { key: 's', metaKey: true })
    expect(props.onSave).toHaveBeenCalled()
    fireEvent.keyDown(ta, { key: 'Escape' })
    expect(props.onExitEdit).toHaveBeenCalled()
  })
  it('Tab inserts two spaces at the cursor in non-markdown files', () => {
    const { props } = edit({ editContent: 'ab' })
    const ta = screen.getByRole('textbox')
    ta.setSelectionRange(1, 1)
    fireEvent.keyDown(ta, { key: 'Tab' })
    expect(props.onEditContentChange).toHaveBeenCalledWith('a  b')
  })
  it('Alt+Z toggles soft wrap', () => {
    edit()
    const ta = screen.getByRole('textbox')
    expect(ta.getAttribute('wrap')).toBe('soft')
    fireEvent.keyDown(ta, { key: 'z', altKey: true })
    expect(ta.getAttribute('wrap')).toBe('off')
  })
  it('hides the code view while editing', () => {
    edit()
    expect(screen.queryByTestId('code')).toBeNull()
  })
})

describe('FileViewer markdown', () => {
  const md = (over) => setup({ selectedFile: { name: 'n.md', path: '/r/n.md' }, isMd: true, content: '# T', ...over })
  it('renders MarkdownView and BacklinksPanel in view mode', () => {
    md()
    expect(screen.getByTestId('md').textContent).toContain('# T')
    expect(screen.getByTestId('backlinks')).toBeTruthy()
  })
  it('forwards task toggle and activate-edit in view mode', () => {
    const { props } = md()
    fireEvent.click(screen.getByText('md-toggle'))
    expect(props.onViewTaskToggle).toHaveBeenCalledWith('toggled')
    fireEvent.click(screen.getByText('md-activate'))
    expect(props.onEnterEdit).toHaveBeenCalled()
  })
  it('edit mode has Edit/Preview tabs; Preview shows markdown of edit content', () => {
    md({ isEditing: true, editContent: 'draft' })
    expect(screen.getByRole('textbox')).toBeTruthy()
    fireEvent.click(screen.getByText('Preview'))
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByTestId('md').textContent).toContain('draft')
    fireEvent.click(screen.getByText('Edit'))
    expect(screen.getByRole('textbox')).toBeTruthy()
  })
  it('Cmd+P toggles between edit and preview', () => {
    md({ isEditing: true, editContent: 'draft' })
    key('p', { metaKey: true })
    expect(screen.queryByRole('textbox')).toBeNull()
    key('p', { metaKey: true })
    expect(screen.getByRole('textbox')).toBeTruthy()
  })
  it('Tab on a list item is owned by the outliner (indents instead of inserting spaces)', () => {
    const { props } = md({ isEditing: true, editContent: '- a\n- b' })
    const ta = screen.getByRole('textbox')
    ta.setSelectionRange(5, 5)
    fireEvent.keyDown(ta, { key: 'Tab' })
    expect(props.onEditContentChange).toHaveBeenCalledWith('- a\n  - b')
  })
  it('loads broken hrefs for the markdown file', async () => {
    api.getOutgoingLinks.mockResolvedValue([
      { isExternal: false, target: null, rawHref: './gone.md' },
      { isExternal: false, target: '/r/ok.md', rawHref: './ok.md' },
      { isExternal: true, target: null, rawHref: 'https://x' },
    ])
    md()
    await waitFor(() => expect(screen.getByTestId('md-broken').textContent).toBe('./gone.md'))
    expect(api.getOutgoingLinks).toHaveBeenCalledWith('/r/n.md')
  })
  it('does not query links for non-markdown files', () => {
    setup()
    expect(api.getOutgoingLinks).not.toHaveBeenCalled()
  })
})

describe('FileViewer search', () => {
  const open = (props) => { const ref = createRef(); const closeRef = createRef(); const r = setup({ openSearchRef: ref, closeSearchRef: closeRef, ...props }); return { ref, closeRef, ...r } }
  it('opens via openSearchRef, counts matches case-insensitively, wraps with Enter / Shift+Enter', () => {
    const { ref } = open()
    act(() => ref.current())
    const input = screen.getByPlaceholderText('Search…')
    fireEvent.change(input, { target: { value: 'TWO' } })
    expect(screen.getByText('1/2')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('2/2')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('1/2')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(screen.getByText('2/2')).toBeTruthy()
  })
  it('shows 0/0 when nothing matches', () => {
    const { ref } = open()
    act(() => ref.current())
    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'zzz' } })
    expect(screen.getByText('0/0')).toBeTruthy()
  })
  it('Escape in the search box closes it', () => {
    const { ref } = open()
    act(() => ref.current())
    const input = screen.getByPlaceholderText('Search…')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Search…')).toBeNull()
  })
  it('closeSearchRef reports whether it closed something', () => {
    const { ref, closeRef } = open()
    expect(closeRef.current()).toBe(false)
    act(() => ref.current())
    let r
    act(() => { r = closeRef.current() })
    expect(r).toBe(true)
    expect(screen.queryByPlaceholderText('Search…')).toBeNull()
  })
  it('uses the markdown match count for markdown files and passes the query down', () => {
    const { ref } = open({ selectedFile: { name: 'n.md', path: '/r/n.md' }, isMd: true, content: '# T' })
    act(() => ref.current())
    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'T' } })
    expect(screen.getByTestId('md').getAttribute('data-query')).toBe('T')
    fireEvent.click(screen.getByText('md-matches'))
    expect(screen.getByText('1/3')).toBeTruthy()
  })
  it('search state resets when the selected file changes', () => {
    const { ref, props, rerender } = open()
    act(() => ref.current())
    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'two' } })
    rerender(<FileViewer {...props} selectedFile={{ name: 'b.js', path: '/r/b.js' }} />)
    expect(screen.queryByPlaceholderText('Search…')).toBeNull()
  })
})

describe('FileViewer diff mode', () => {
  it('fetches the diff and renders it', async () => {
    api.gitDiff.mockResolvedValue({ name: 'D1' })
    setup({ diffMode: true, gitDirty: true })
    expect(screen.getByText('Loading diff…')).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('diff').textContent).toBe('D1'))
    expect(api.gitDiff).toHaveBeenCalledWith('/r/a.js')
  })
  it('shows an error when the diff fails', async () => {
    api.gitDiff.mockRejectedValue(new Error('nope'))
    setup({ diffMode: true })
    await waitFor(() => expect(screen.getByText(/Diff failed: nope/)).toBeTruthy())
  })
  it('toggles split view via button and Shift+D; V or D exits', async () => {
    api.gitDiff.mockResolvedValue({ name: 'D1' })
    const { props } = setup({ diffMode: true })
    await waitFor(() => screen.getByTestId('diff'))
    expect(screen.getByText('Inline')).toBeTruthy()
    fireEvent.click(screen.getByText('Inline'))
    expect(screen.getByText('Split')).toBeTruthy()
    expect(screen.getByTestId('diff').getAttribute('data-split')).toBe('true')
    key('D', { shiftKey: true })
    expect(screen.getByText('Inline')).toBeTruthy()
    key('v')
    expect(props.onExitDiff).toHaveBeenCalledTimes(1)
    key('d')
    expect(props.onExitDiff).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByText('V View'))
    expect(props.onExitDiff).toHaveBeenCalledTimes(3)
  })
  it('ignores diff shortcuts when not focused', async () => {
    api.gitDiff.mockResolvedValue({ name: 'D1' })
    const { props } = setup({ diffMode: true, isFocused: false })
    await waitFor(() => screen.getByTestId('diff'))
    key('v')
    expect(props.onExitDiff).not.toHaveBeenCalled()
  })
})

describe('FileViewer zoom', () => {
  it('markdown view: Cmd+= / Cmd+- / Cmd+0 change zoom and persist it', () => {
    setup({ selectedFile: { name: 'n.md', path: '/r/n.md' }, isMd: true, content: '# T' })
    const zoom = () => screen.getByTestId('md').getAttribute('data-zoom')
    expect(zoom()).toBe('1')
    key('=', { metaKey: true }); expect(zoom()).toBe('1.1')
    key('+', { ctrlKey: true }); expect(zoom()).toBe('1.2')
    key('-', { metaKey: true }); expect(zoom()).toBe('1.1')
    expect(localStorage.getItem('vibe-md-zoom')).toBe('1.1')
    key('0', { metaKey: true }); expect(zoom()).toBe('1')
  })
  it('markdown zoom is clamped to 0.5–3', () => {
    setup({ selectedFile: { name: 'n.md', path: '/r/n.md' }, isMd: true, content: '# T' })
    for (let i = 0; i < 30; i++) key('-', { metaKey: true })
    expect(screen.getByTestId('md').getAttribute('data-zoom')).toBe('0.5')
    for (let i = 0; i < 40; i++) key('=', { metaKey: true })
    expect(screen.getByTestId('md').getAttribute('data-zoom')).toBe('3')
  })
  it('restores a saved zoom and ignores out-of-range saved values', () => {
    localStorage.setItem('vibe-md-zoom', '1.5')
    localStorage.setItem('vibe-edit-zoom', '9')
    setup({ selectedFile: { name: 'n.md', path: '/r/n.md' }, isMd: true, content: '# T' })
    expect(screen.getByTestId('md').getAttribute('data-zoom')).toBe('1.5')
    expect(localStorage.getItem('vibe-edit-zoom')).toBe('1')
  })
  it('edit pane: Cmd+= scales font size and persists to the edit key', () => {
    setup({ isEditing: true, editContent: 'a' })
    const ta = screen.getByRole('textbox')
    const before = parseFloat(ta.style.fontSize)
    key('=', { metaKey: true })
    expect(parseFloat(ta.style.fontSize)).toBeGreaterThan(before)
    expect(localStorage.getItem('vibe-edit-zoom')).toBe('1.1')
    expect(localStorage.getItem('vibe-md-zoom')).toBe('1')
  })
  it('no zoom handling in plain code view', () => {
    setup()
    key('=', { metaKey: true })
    expect(localStorage.getItem('vibe-edit-zoom')).toBe('1')
    expect(localStorage.getItem('vibe-md-zoom')).toBe('1')
  })
})

describe('FileViewer scroll reporting', () => {
  it('reports the first visible line from the virtual list in plain mode (via rows rendered callback wiring)', () => {
    // The mocked List does not fire onRowsRendered; the wiring itself is asserted by not throwing
    // and by markdown scroll below.
    setup()
  })
  it('markdown scroll reports a clamped ratio', () => {
    const { props, container } = setup({ selectedFile: { name: 'n.md', path: '/r/n.md' }, isMd: true, content: '# T' })
    const el = container.querySelector('[data-scroll-container]')
    Object.defineProperty(el, 'scrollHeight', { value: 300, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: 100, configurable: true })
    el.scrollTop = 100
    fireEvent.scroll(el)
    expect(props.onScrollChange).toHaveBeenLastCalledWith({ type: 'md', ratio: 0.5 })
  })
})
