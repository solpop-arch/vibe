import { describe, it, expect } from 'vitest'
import { subGroups } from './docGroups'

const d = (relDir, name) => ({ name, relDir, path: `/r/${relDir ? relDir + '/' : ''}${name}` })

describe('subGroups', () => {
  it('puts direct files first, then sub-folders alphabetically with trailing slash labels', () => {
    const out = subGroups([d('docs/plan', 'a.md'), d('docs', 'p.md'), d('docs/arch', 'c.md'), d('docs/plan/x', 'y.md')], 'docs')
    expect(out.map(g => g.key)).toEqual(['', 'docs/arch', 'docs/plan', 'docs/plan/x'])
    expect(out.map(g => g.label)).toEqual(['', 'arch/', 'plan/', 'plan/x/'])
  })
  it('keeps item order inside a group', () => {
    const out = subGroups([d('docs/p', '2.md'), d('docs/p', '1.md')], 'docs')
    expect(out[0].items.map(i => i.name)).toEqual(['2.md', '1.md'])
  })
  it('root group (no folder) is a single unlabeled group', () => {
    const out = subGroups([d(null, 'README.md')], '')
    expect(out).toHaveLength(1)
    expect(out[0].key).toBe('')
  })
})
