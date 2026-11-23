import { describe, it, expect } from 'vitest'
import { flattenVisible, computeDirtyDirs, ancestorDirs, parentPathOf } from './explorerTree'

const f = (p) => ({ name: p.split('/').pop(), path: p, isDirectory: false })
const d = (p) => ({ name: p.split('/').pop(), path: p, isDirectory: true })

describe('flattenVisible', () => {
  const root = [d('/r/src'), f('/r/a.md')]
  const cache = { '/r/src': [d('/r/src/deep'), f('/r/src/m.js')], '/r/src/deep': [f('/r/src/deep/x.js')] }
  it('lists only root items when nothing is expanded', () => {
    expect(flattenVisible(root, new Set(), cache).map(i => i.path)).toEqual(['/r/src', '/r/a.md'])
  })
  it('inlines expanded children with depth; unloaded expanded dirs add nothing', () => {
    const out = flattenVisible(root, new Set(['/r/src', '/r/src/deep', '/r/other']), cache)
    expect(out.map(i => [i.path, i.depth])).toEqual([
      ['/r/src', 0], ['/r/src/deep', 1], ['/r/src/deep/x.js', 2], ['/r/src/m.js', 1], ['/r/a.md', 0],
    ])
  })
})

describe('computeDirtyDirs', () => {
  it('bubbles to every ancestor below root, never to root', () => {
    const m = computeDirtyDirs(new Map([['/r/a/b/c.js', 'modified']]), '/r')
    expect([...m.keys()].sort()).toEqual(['/r/a', '/r/a/b'])
  })
  it('keeps the strongest state; deleted outranks modified', () => {
    const m = computeDirtyDirs(new Map([['/r/a/x.js', 'modified'], ['/r/a/b/y.js', 'deleted']]), '/r')
    expect(m.get('/r/a')).toBe('deleted')
    expect(m.get('/r/a/b')).toBe('deleted')
  })
  it('is empty without git files', () => {
    expect(computeDirtyDirs(null, '/r').size).toBe(0)
    expect(computeDirtyDirs(new Map(), '/r').size).toBe(0)
  })
})

describe('ancestorDirs / parentPathOf', () => {
  it('returns each ancestor dir of a nested file', () => {
    expect(ancestorDirs('/r', '/r/a/b/c.js')).toEqual(['/r/a', '/r/a/b'])
  })
  it('returns [] for root-level, outside, or missing inputs', () => {
    expect(ancestorDirs('/r', '/r/a.md')).toEqual([])
    expect(ancestorDirs('/r', '/other/a/b.md')).toEqual([])
    expect(ancestorDirs('', '/r/a/b.md')).toEqual([])
    expect(ancestorDirs('/r', null)).toEqual([])
  })
  it('parentPathOf strips the last segment', () => {
    expect(parentPathOf('/r/a/b.md')).toBe('/r/a')
  })
})
