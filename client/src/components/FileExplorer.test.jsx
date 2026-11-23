// @vitest-environment jsdom
// Characterization tests: pin FileExplorer's current behavior before splitting it up.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

vi.mock('../api', () => ({
  listFiles: vi.fn(),
  createItem: vi.fn(() => Promise.resolve()),
  renameItem: vi.fn(() => Promise.resolve()),
  deleteItem: vi.fn(() => Promise.resolve()),
}))

import * as api from '../api'
import FileExplorer from './FileExplorer'

const ROOT = '/r'
const f = (name, dir = ROOT) => ({ name, path: `${dir}/${name}`, isDirectory: false })
const d = (name, dir = ROOT) => ({ name, path: `${dir}/${name}`, isDirectory: true })

let tree
const setTree = () => {
  tree = {
    [ROOT]: [d('src'), d('docs'), f('a.md'), f('b.js')],
    [`${ROOT}/src`]: [d('deep', `${ROOT}/src`), f('main.js', `${ROOT}/src`)],
    [`${ROOT}/src/deep`]: [f('x.js', `${ROOT}/src/deep`)],
    [`${ROOT}/docs`]: [],
  }
  api.listFiles.mockImplementation(async (p) => {
    const path = p || ROOT
    return { currentPath: path, items: tree[path] || [] }
  })
}

const mount = async (over = {}) => {
  const props = {
    onFileSelect: vi.fn(), isFocused: true, onFocus: vi.fn(), innerRef: null,
    onAtRootChange: vi.fn(), refreshKey: 0, activeFilePath: null,
    changedFiles: new Set(), gitFiles: new Map(), gitInfo: null, ...over,
  }
  const utils = render(<FileExplorer {...props} />)
  await screen.findByText('a.md')
  return { props, ...utils }
}
const key = (k, opts = {}) => fireEvent.keyDown(window, { key: k, ...opts })
const names = () => [...document.querySelectorAll('[draggable], span')].map(e => e.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  setTree()
  Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } })
  window.confirm = vi.fn(() => true)
})

describe('FileExplorer listing', () => {
  it('lists root items with dir slash and reports at-root on mount', async () => {
    const { props } = await mount()
    expect(screen.getByText('src/')).toBeTruthy()
    expect(screen.getByText('docs/')).toBeTruthy()
    expect(screen.getByText('b.js')).toBeTruthy()
    expect(api.listFiles).toHaveBeenCalledWith('')
    expect(props.onAtRootChange).toHaveBeenCalledWith(true)
  })
  it('click on a directory expands it (fetching once) and collapses on second click', async () => {
    await mount()
    fireEvent.click(screen.getByText('src/'))
    await screen.findByText('main.js')
    expect(api.listFiles).toHaveBeenCalledWith(`${ROOT}/src`)
    fireEvent.click(screen.getByText('src/'))
    await waitFor(() => expect(screen.queryByText('main.js')).toBeNull())
    fireEvent.click(screen.getByText('src/'))
    await screen.findByText('main.js')
    expect(api.listFiles.mock.calls.filter(c => c[0] === `${ROOT}/src`)).toHaveLength(1)
  })
  it('click on a file selects it', async () => {
    const { props } = await mount()
    fireEvent.click(screen.getByText('a.md'))
    expect(props.onFileSelect).toHaveBeenCalledWith(expect.objectContaining({ path: `${ROOT}/a.md` }))
  })
  it('children render in tree order under their parent', async () => {
    await mount()
    fireEvent.click(screen.getByText('src/'))
    await screen.findByText('main.js')
    const order = ['src/', 'deep/', 'main.js', 'docs/', 'a.md', 'b.js'].map(t => screen.getByText(t))
    for (let i = 0; i < order.length - 1; i++) {
      expect(order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })
  it('sets file rows draggable with the path as drag data', async () => {
    await mount()
    const row = screen.getByText('a.md').closest('[draggable]')
    expect(row.getAttribute('draggable')).toBe('true')
    expect(screen.getByText('src/').closest('[draggable]').getAttribute('draggable')).toBe('false')
    const setData = vi.fn()
    fireEvent.dragStart(row, { dataTransfer: { setData, effectAllowed: '' } })
    expect(setData).toHaveBeenCalledWith('text/plain', `${ROOT}/a.md`)
  })
})

describe('FileExplorer keyboard navigation', () => {
  const isSel = (text) => screen.getByText(text).closest('[draggable]').style.borderLeft.includes('var(--accent)')
  it('ArrowDown/ArrowUp move the selection and clamp at the ends', async () => {
    await mount()
    expect(isSel('src/')).toBe(true)
    key('ArrowDown'); expect(isSel('docs/')).toBe(true)
    key('ArrowUp'); key('ArrowUp'); expect(isSel('src/')).toBe(true)
    for (let i = 0; i < 10; i++) key('ArrowDown')
    expect(isSel('b.js')).toBe(true)
  })
  it('Enter toggles a directory and opens a file', async () => {
    const { props } = await mount()
    key('Enter')
    await screen.findByText('main.js')
    key('ArrowDown'); key('ArrowDown')   // deep/, main.js
    key('Enter')
    expect(props.onFileSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'main.js' }))
  })
  it('Backspace collapses the parent directory and selects it', async () => {
    await mount()
    key('Enter')
    await screen.findByText('main.js')
    key('ArrowDown'); key('ArrowDown')
    key('Backspace')
    await waitFor(() => expect(screen.queryByText('main.js')).toBeNull())
    expect(isSel('src/')).toBe(true)
  })
  it('ignores keys when not focused', async () => {
    const { props } = await mount({ isFocused: false })
    key('Enter'); key('a')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(props.onFileSelect).not.toHaveBeenCalled()
  })
  it('c copies the selected path', async () => {
    await mount()
    key('ArrowDown'); key('ArrowDown')
    key('c')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${ROOT}/a.md`)
  })
})

describe('FileExplorer create / rename / delete', () => {
  it('a on a file creates a sibling in its parent; Enter submits', async () => {
    await mount()
    key('ArrowDown'); key('ArrowDown')   // a.md (root level)
    key('a')
    const input = await screen.findByRole('textbox')
    fireEvent.change(input, { target: { value: 'new.md' } })
    fireEvent.submit(input.closest('form'))
    await waitFor(() => expect(api.createItem).toHaveBeenCalledWith(`${ROOT}/new.md`, false))
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
  })
  it('Shift+A on a directory creates a folder inside it and expands it', async () => {
    await mount()
    key('a', { shiftKey: true })
    const input = await screen.findByRole('textbox')
    fireEvent.change(input, { target: { value: 'sub' } })
    fireEvent.submit(input.closest('form'))
    await waitFor(() => expect(api.createItem).toHaveBeenCalledWith(`${ROOT}/src/sub`, true))
    await screen.findByText('main.js')   // directory got expanded
  })
  it('empty name cancels without calling the API; Escape cancels too', async () => {
    await mount()
    key('a')
    let input = await screen.findByRole('textbox')
    fireEvent.submit(input.closest('form'))
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    expect(api.createItem).not.toHaveBeenCalled()
    key('a')
    input = await screen.findByRole('textbox')
    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
  })
  it('header buttons start a root-level file/folder creation', async () => {
    await mount()
    fireEvent.click(screen.getByText('new file'))
    let input = await screen.findByRole('textbox')
    fireEvent.change(input, { target: { value: 'z.txt' } })
    fireEvent.submit(input.closest('form'))
    await waitFor(() => expect(api.createItem).toHaveBeenCalledWith(`${ROOT}/z.txt`, false))
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    fireEvent.click(screen.getByText('new folder'))
    input = await screen.findByRole('textbox')
    fireEvent.change(input, { target: { value: 'zz' } })
    fireEvent.submit(input.closest('form'))
    await waitFor(() => expect(api.createItem).toHaveBeenCalledWith(`${ROOT}/zz`, true))
  })
  it('r renames the selected item with the name prefilled', async () => {
    await mount()
    key('ArrowDown'); key('ArrowDown')
    key('r')
    const input = await screen.findByRole('textbox')
    expect(input.value).toBe('a.md')
    fireEvent.change(input, { target: { value: 'c.md' } })
    fireEvent.submit(input.closest('form'))
    await waitFor(() => expect(api.renameItem).toHaveBeenCalledWith(`${ROOT}/a.md`, `${ROOT}/c.md`))
  })
  it('rename inside a subfolder refreshes that folder', async () => {
    await mount()
    key('Enter'); await screen.findByText('main.js')
    key('ArrowDown'); key('ArrowDown'); key('r')
    const input = await screen.findByRole('textbox')
    fireEvent.change(input, { target: { value: 'm2.js' } })
    api.listFiles.mockClear()
    fireEvent.submit(input.closest('form'))
    await waitFor(() => expect(api.renameItem).toHaveBeenCalledWith(`${ROOT}/src/main.js`, `${ROOT}/src/m2.js`))
    await waitFor(() => expect(api.listFiles).toHaveBeenCalledWith(`${ROOT}/src`))
  })
  it('d asks for confirmation; declining does nothing', async () => {
    await mount()
    window.confirm = vi.fn(() => false)
    key('d')
    expect(window.confirm).toHaveBeenCalledWith('Delete src?')
    expect(api.deleteItem).not.toHaveBeenCalled()
  })
  it('d deletes the selected item, closes the viewer if it was open, moves selection up at the end', async () => {
    const { props } = await mount({ activeFilePath: `${ROOT}/b.js` })
    // activeFilePath selects b.js (last)
    await waitFor(() => expect(screen.getByText('b.js').closest('[draggable]').style.borderLeft).toContain('accent'))
    key('d')
    await waitFor(() => expect(api.deleteItem).toHaveBeenCalledWith(`${ROOT}/b.js`))
    await waitFor(() => expect(props.onFileSelect).toHaveBeenCalledWith(null))
  })
  it('deleting a file other than the viewed one leaves the viewer alone', async () => {
    const { props } = await mount({ activeFilePath: `${ROOT}/b.js` })
    key('ArrowUp'); key('ArrowUp')   // a.md ... after reveal effect selection is b.js
    await waitFor(() => expect(api.listFiles).toHaveBeenCalled())
    key('d')
    await waitFor(() => expect(api.deleteItem).toHaveBeenCalled())
    expect(props.onFileSelect).not.toHaveBeenCalledWith(null)
  })
})

describe('FileExplorer reveal / refresh', () => {
  it('expands parent dirs when the active file changes after the root loaded', async () => {
    const { props, rerender } = await mount()
    rerender(<FileExplorer {...props} activeFilePath={`${ROOT}/src/deep/x.js`} />)
    await screen.findByText('x.js')
    expect(screen.getByText('deep/')).toBeTruthy()
    expect(api.listFiles).toHaveBeenCalledWith(`${ROOT}/src`)
    expect(api.listFiles).toHaveBeenCalledWith(`${ROOT}/src/deep`)
  })
  it('known quirk: an active file set before the root loads is not revealed', async () => {
    await mount({ activeFilePath: `${ROOT}/src/deep/x.js` })
    expect(screen.queryByText('x.js')).toBeNull()
  })
  it('does nothing special for a root-level active file', async () => {
    await mount({ activeFilePath: `${ROOT}/a.md` })
    expect(api.listFiles.mock.calls.map(c => c[0])).toEqual([''])
  })
  it('refreshKey bump re-fetches root and expanded dirs', async () => {
    const { props, rerender } = await mount()
    key('Enter'); await screen.findByText('main.js')
    tree[ROOT] = [...tree[ROOT], f('late.md')]
    tree[`${ROOT}/src`] = [...tree[`${ROOT}/src`], f('fresh.js', `${ROOT}/src`)]
    rerender(<FileExplorer {...props} refreshKey={1} />)
    await screen.findByText('late.md')
    await screen.findByText('fresh.js')
  })
  it('refreshKey 0 does not trigger an extra refresh', async () => {
    await mount()
    expect(api.listFiles).toHaveBeenCalledTimes(1)
  })
})

describe('FileExplorer git decorations', () => {
  it('shows nothing when not a repo, and branch + dirty count / clean when it is', async () => {
    const { props, rerender } = await mount({ gitInfo: { isRepo: false } })
    expect(screen.queryByText(/⎇/)).toBeNull()
    rerender(<FileExplorer {...props} gitInfo={{ isRepo: true, branch: 'main', dirtyCount: 3 }} />)
    expect(screen.getByText('⎇ main')).toBeTruthy()
    expect(screen.getByText('● 3')).toBeTruthy()
    rerender(<FileExplorer {...props} gitInfo={{ isRepo: true, branch: null, dirtyCount: 0 }} />)
    expect(screen.getByText('⎇ (detached)')).toBeTruthy()
    expect(screen.getByText('clean')).toBeTruthy()
  })
  it('badges files by git state', async () => {
    await mount({ gitFiles: new Map([[`${ROOT}/a.md`, 'modified']]) })
    expect(screen.getByTitle('modified')).toBeTruthy()
  })
  it('collapsed directories show a bubbled badge; expanded ones do not', async () => {
    const gitFiles = new Map([[`${ROOT}/src/deep/x.js`, 'modified']])
    await mount({ gitFiles })
    expect(screen.getAllByTitle('contains changes')).toHaveLength(1)
    key('Enter'); await screen.findByText('main.js')
    // src is expanded now: badge moves down to the collapsed deep/
    expect(screen.getAllByTitle('contains changes')).toHaveLength(1)
    expect(screen.getByText('deep/').closest('[draggable]').querySelector('[title="contains changes"]')).toBeTruthy()
  })
  it('stronger git state wins when bubbling to a directory', async () => {
    const gitFiles = new Map([
      [`${ROOT}/src/main.js`, 'modified'],
      [`${ROOT}/src/deep/x.js`, 'deleted'],
    ])
    await mount({ gitFiles })
    const badge = screen.getByText('src/').closest('[draggable]').querySelector('[title="contains changes"]')
    expect(badge).toBeTruthy()
    const { gitBadgeFor } = await import('../constants')
    expect(badge.textContent).toBe(gitBadgeFor('deleted').glyph)
  })
  it('marks externally changed files', async () => {
    await mount({ changedFiles: new Set([`${ROOT}/a.md`]) })
    const row = screen.getByText('a.md').closest('[draggable]')
    expect(row.querySelector('span[style*="badge-pulse"]')).toBeTruthy()
    expect(screen.getByText('b.js').closest('[draggable]').querySelector('span[style*="badge-pulse"]')).toBeNull()
  })
  it('marks the active file', async () => {
    await mount({ activeFilePath: `${ROOT}/a.md` })
    const dot = screen.getByText('a.md').closest('[draggable]').querySelector('span[style*="border-radius: 50%"]')
    expect(dot).toBeTruthy()
  })
})
