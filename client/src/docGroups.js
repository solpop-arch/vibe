// Split one top-level folder's docs by sub-folder. Docs sitting directly in the folder
// come first (key ''), then sub-folders alphabetically by their full relative path.
export function subGroups(items, folder) {
  const map = new Map()
  for (const d of items) {
    const key = folder && d.relDir && d.relDir !== folder ? d.relDir : ''
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(d)
  }
  return [...map.entries()]
    .map(([key, docs]) => ({ key, label: key ? key.slice(folder.length + 1) + '/' : '', items: docs }))
    .sort((a, b) => (a.key === '' ? -1 : b.key === '' ? 1 : a.key.localeCompare(b.key)))
}
