import { GIT_STATE_RANK } from './constants'

export const parentPathOf = (p) => p.substring(0, p.lastIndexOf('/'))

// Flatten the loaded tree into the visible rows (with depth), honoring expanded dirs.
export function flattenVisible(rootItems, expandedDirs, childrenCache) {
  const result = []
  const walk = (items, depth) => {
    for (const item of items) {
      result.push({ ...item, depth })
      if (item.isDirectory && expandedDirs.has(item.path)) {
        walk(childrenCache[item.path] || [], depth + 1)
      }
    }
  }
  walk(rootItems, 0)
  return result
}

// Bubble git states up to ancestor directories (below `root`): path → strongest state.
export function computeDirtyDirs(gitFiles, root) {
  const map = new Map()
  if (!gitFiles || gitFiles.size === 0) return map
  for (const [absPath, state] of gitFiles.entries()) {
    let cur = absPath
    const lastSlash = cur.lastIndexOf('/')
    if (lastSlash < 0) continue
    cur = cur.slice(0, lastSlash)
    while (cur && cur !== root) {
      const prev = map.get(cur)
      const prevPri = prev !== undefined ? (GIT_STATE_RANK[prev] ?? Infinity) : Infinity
      const curPri  = GIT_STATE_RANK[state] ?? Infinity
      if (curPri < prevPri) map.set(cur, state)
      else if (prevPri === 0) break  // already at highest priority (deleted)
      const s = cur.lastIndexOf('/')
      if (s < 0) break
      cur = cur.slice(0, s)
    }
  }
  return map
}

// Directories to expand so `activeFilePath` is visible; [] for root-level or outside files.
export function ancestorDirs(root, activeFilePath) {
  if (!activeFilePath || !root || !activeFilePath.startsWith(root)) return []
  const parts = activeFilePath.slice(root.length + 1).split('/')
  const dirs = []
  for (let i = 0; i < parts.length - 1; i++) dirs.push(root + '/' + parts.slice(0, i + 1).join('/'))
  return dirs
}
