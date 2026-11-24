// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./GraphView', () => ({ default: () => <div data-testid="graph" /> }))

import Dashboard from './Dashboard'

const R = '/r'
const NOW = Date.now()
const doc = (rel, ms = NOW) => {
  const i = rel.lastIndexOf('/')
  return { name: rel.slice(i + 1), path: `${R}/${rel}`, parentDir: rel.includes('/') ? rel.split('/')[0] : null, relDir: i >= 0 ? rel.slice(0, i) : null, modifiedMs: ms, lineCount: 3 }
}
const git = (entries) => ({ isRepo: true, branch: 'main', dirtyCount: entries.length, filesByAbs: new Map(entries.map(([p, s]) => [`${R}/${p}`, s])) })

const props = (over = {}) => ({
  data: {
    projectName: 'proj', projectPath: R, totalFiles: 40, totalFolders: 5,
    langStats: [{ name: 'Rust', pct: 60, color: '#000' }],
    docs: [doc('README.md'), doc('docs/a.md'), doc('docs/b.md'), doc('notes/n.md')],
    fileTimes: new Map([[`${R}/old.js`, NOW - 3 * 3600e3], [`${R}/new.js`, NOW - 60e3]]),
  },
  recentChanges: [], brokenLinks: [], orphanDocs: [], graphData: null,
  onFileOpen: vi.fn(), onRefresh: vi.fn(), refreshing: false, justRefreshed: false,
  gitInfo: { isRepo: false, branch: null, filesByAbs: new Map(), dirtyCount: 0 },
  ...over,
})
const mount = (over) => { const p = props(over); return { p, ...render(<Dashboard {...p} />) } }

beforeEach(() => localStorage.clear())

describe('Dashboard layout', () => {
  it('no longer shows a Languages section or folder/lang counts', () => {
    mount()
    expect(screen.queryByText('Languages')).toBeNull()
    expect(screen.queryByText(/langs/)).toBeNull()
    expect(screen.queryByText(/folders/)).toBeNull()
    expect(screen.getByText('files')).toBeTruthy()
    expect(screen.getByText('docs')).toBeTruthy()
  })
  it('shows "Recently Changed" nowhere (one list, named for what it is)', () => {
    mount({ gitInfo: git([['new.js', 'modified']]) })
    expect(screen.queryByText('Recently Changed')).toBeNull()
  })
  it('puts the changed-files block before Documents', () => {
    mount({ gitInfo: git([['new.js', 'modified']]) })
    const changed = screen.getByText(/^Changed \(1\)$/)
    const docs = screen.getByText('Documents')
    expect(changed.compareDocumentPosition(docs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('Changed files', () => {
  it('lists dirty files newest first with git badge and opens on click', () => {
    const { p } = mount({ gitInfo: git([['old.js', 'modified'], ['new.js', 'added']]) })
    expect(screen.getByText('Changed (2)')).toBeTruthy()
    const names = ['new.js', 'old.js'].map(n => screen.getByText(n))
    expect(names[0].compareDocumentPosition(names[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByTitle('modified')).toBeTruthy()
    fireEvent.click(screen.getByText('new.js'))
    expect(p.onFileOpen).toHaveBeenCalledWith({ path: `${R}/new.js`, name: 'new.js', isDirectory: false })
  })
  it('live watcher time wins over the scan time', () => {
    mount({ gitInfo: git([['old.js', 'modified'], ['new.js', 'modified']]), recentChanges: [{ path: `${R}/old.js`, name: 'old.js', time: NOW }] })
    const a = screen.getByText('old.js'), b = screen.getByText('new.js')
    expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('deleted files are listed last and not clickable', () => {
    const { p } = mount({ gitInfo: git([['gone.js', 'deleted'], ['new.js', 'modified']]) })
    const gone = screen.getByText('gone.js'), live = screen.getByText('new.js')
    expect(live.compareDocumentPosition(gone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(gone)
    expect(p.onFileOpen).not.toHaveBeenCalled()
  })
  it('caps the list and reports the remainder', () => {
    const entries = Array.from({ length: 15 }, (_, i) => [`f${i}.js`, 'modified'])
    mount({ gitInfo: git(entries) })
    expect(screen.getByText('Changed (15)')).toBeTruthy()
    expect(screen.getByText('+3 more')).toBeTruthy()
  })
  it('falls back to recently modified files when clean or not a repo', () => {
    const recent = [{ path: `${R}/x.js`, name: 'x.js', time: NOW }]
    const { unmount } = mount({ recentChanges: recent })
    expect(screen.getByText('Recently modified')).toBeTruthy()
    expect(screen.getByText('x.js')).toBeTruthy()
    unmount()
    mount({ recentChanges: recent, gitInfo: git([]) })
    expect(screen.getByText('Recently modified')).toBeTruthy()
    expect(screen.getByText('clean')).toBeTruthy()
  })
  it('renders no block at all when there is nothing to show', () => {
    mount()
    expect(screen.queryByText(/^Changed/)).toBeNull()
    expect(screen.queryByText('Recently modified')).toBeNull()
  })
})

describe('Documents', () => {
  it('folder groups start collapsed, expand on click and remember it', () => {
    const { unmount } = mount()
    expect(screen.getByText('docs/')).toBeTruthy()
    expect(screen.queryByText('a.md')).toBeNull()
    fireEvent.click(screen.getByText('docs/'))
    expect(screen.getByText('a.md')).toBeTruthy()
    unmount()
    mount()
    expect(screen.getByText('a.md')).toBeTruthy()
  })
  it('shows a By Folder label only when something is pinned', () => {
    mount()
    expect(screen.queryByText('By Folder')).toBeNull()
    expect(screen.queryByText('Pinned')).toBeNull()
  })
  it('pinned docs get their own list', () => {
    localStorage.setItem('vibe-dashboard-pinned', JSON.stringify([`${R}/README.md`]))
    mount()
    expect(screen.getByText('Pinned')).toBeTruthy()
    expect(screen.getByText('By Folder')).toBeTruthy()
  })
})

describe('Documents (all shown)', () => {
  it('lists every doc in an expanded folder, not just the first few', () => {
    const many = Array.from({ length: 8 }, (_, i) => doc(`docs/d${i}.md`, NOW - i * 1000))
    mount({ data: { ...props().data, docs: many } })
    expect(screen.getByText('(8)')).toBeTruthy()
    fireEvent.click(screen.getByText('docs/'))
    expect(screen.getAllByText(/^d\d\.md$/)).toHaveLength(8)
  })
})

describe('Documents sub-folders', () => {
  const nested = () => [
    doc('docs/product.md'), doc('docs/plan/a.md'), doc('docs/plan/b.md'), doc('docs/architecture/c.md'), doc('docs/plan/x/deep.md'),
  ]
  const open = () => { mount({ data: { ...props().data, docs: nested() } }); fireEvent.click(screen.getByText('docs/')) }
  it('groups an opened folder by sub-folder with counts; direct files come first', () => {
    open()
    expect(screen.getByText('plan/')).toBeTruthy()
    expect(screen.getByText('architecture/')).toBeTruthy()
    expect(screen.getByText('plan/x/')).toBeTruthy()
    const direct = screen.getByText('product.md'), plan = screen.getByText('plan/')
    expect(direct.compareDocumentPosition(plan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('(2)')).toBeTruthy()   // plan: a.md, b.md
  })
  it('sub-folders start open, close on click and remember it', () => {
    const { unmount } = (() => { const r = mount({ data: { ...props().data, docs: nested() } }); fireEvent.click(screen.getByText('docs/')); return r })()
    expect(screen.getByText('a.md')).toBeTruthy()
    fireEvent.click(screen.getByText('plan/'))
    expect(screen.queryByText('a.md')).toBeNull()
    unmount()
    mount({ data: { ...props().data, docs: nested() } })   // 'docs/' stays open (remembered)
    expect(screen.queryByText('a.md')).toBeNull()
    expect(screen.getByText('c.md')).toBeTruthy()
  })
  it('does not repeat the directory under each file in an opened folder', () => {
    open()
    expect(screen.queryByText('docs/plan/')).toBeNull()
    expect(screen.getAllByText('docs/')).toHaveLength(1)
  })
  it('a folder with only direct files shows no sub-headers', () => {
    mount()
    fireEvent.click(screen.getByText('notes/'))
    expect(screen.getByText('n.md')).toBeTruthy()
    expect(screen.getAllByText(/\/$/).map(e => e.textContent)).toEqual(['▼docs/(2)', '▼notes/(1)'])  // top-level labels only, no sub-headers
  })
})

describe('Link health', () => {
  const broken = (n) => Array.from({ length: n }, (_, i) => ({ source: `${R}/s${i}.md`, line: i + 1, kind: 'link', rawHref: `./g${i}.md` }))
  const orphans = (n) => Array.from({ length: n }, (_, i) => `${R}/docs/o${i}.md`)
  it('is hidden when nothing is wrong', () => {
    mount()
    expect(screen.queryByText('Link health')).toBeNull()
  })
  it('starts collapsed with a one-line summary', () => {
    mount({ brokenLinks: broken(3), orphanDocs: orphans(5) })
    expect(screen.getByText('Link health')).toBeTruthy()
    expect(screen.getByText('Broken 3 · Orphan 5')).toBeTruthy()
    expect(screen.queryByText('Broken links')).toBeNull()
  })
  it('expands to both lists capped at 5 each and remembers the choice', () => {
    const { unmount } = mount({ brokenLinks: broken(7), orphanDocs: orphans(2) })
    fireEvent.click(screen.getByText('Link health'))
    expect(screen.getByText('Broken links')).toBeTruthy()
    expect(screen.getByText('Orphan docs')).toBeTruthy()
    expect(screen.getAllByText(/^→ /)).toHaveLength(5)
    expect(screen.getByText('+2 more')).toBeTruthy()
    unmount()
    mount({ brokenLinks: broken(7), orphanDocs: orphans(2) })
    expect(screen.getByText('Broken links')).toBeTruthy()
  })
  it('summary names only the non-empty kind', () => {
    mount({ orphanDocs: orphans(2) })
    expect(screen.getByText('Orphan 2')).toBeTruthy()
  })
  it('clicking an item opens its file', () => {
    const { p } = mount({ orphanDocs: orphans(1) })
    fireEvent.click(screen.getByText('Link health'))
    fireEvent.click(screen.getByText('docs/o0.md'))
    expect(p.onFileOpen).toHaveBeenCalledWith({ path: `${R}/docs/o0.md`, name: 'o0.md', isDirectory: false })
  })
})
