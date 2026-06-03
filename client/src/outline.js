// Design Ref: §4 — pure outliner keymap logic for markdown edit mode.
// No React/DOM imports — unit-testable in isolation (see outline.test.js).

export const INDENT_UNIT = 2
export const MAX_HEADING_LEVEL = 6

const FENCE_RE = /^\s{0,3}(```|~~~)/
const HEADING_RE = /^(\s*)(#{1,6})(\s|$)/
const UL_RE = /^(\s*)([-*+])\s/
const OL_RE = /^(\s*)(\d+[.)])\s/

function leadingSpaces(line) {
  let n = 0
  while (n < line.length && line[n] === ' ') n++
  return n
}

function isBlank(line) {
  return /^\s*$/.test(line)
}

// Design Ref: §3.3 — a `#` inside a fenced code block must not count as a heading,
// so classification needs whole-file context, not just the single line.
// CommonMark requires the closing fence to use the same marker char (` ``` ` vs `~~~`)
// as the opening, so a `~~~` line cannot close a backtick fence — track the open char.
export function buildFenceMask(lines) {
  const mask = new Array(lines.length).fill(false)
  let fenceChar = null // '`' or '~' while inside a fence, otherwise null
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE_RE.exec(lines[i])
    if (m) {
      const char = m[1][0]
      mask[i] = true
      if (fenceChar === null) fenceChar = char // opening fence
      else if (char === fenceChar) fenceChar = null // matching closing fence
      // a fence line of the other marker while inside a fence is just content
      continue
    }
    mask[i] = fenceChar !== null
  }
  return mask
}

// Design Ref: §3.1 — per-line LineInfo classification.
export function classifyLines(lines) {
  const fence = buildFenceMask(lines)
  return lines.map((line, i) => {
    if (isBlank(line)) return { type: 'blank' }
    if (fence[i]) return { type: 'plain', indent: leadingSpaces(line) }
    const h = HEADING_RE.exec(line)
    if (h) return { type: 'heading', level: h[2].length, indent: h[1].length }
    const ul = UL_RE.exec(line)
    if (ul) return { type: 'list', ordered: false, marker: ul[2], indent: ul[1].length }
    const ol = OL_RE.exec(line)
    if (ol) return { type: 'list', ordered: true, marker: ol[2], indent: ol[1].length }
    return { type: 'plain', indent: leadingSpaces(line) }
  })
}

// Design Ref: §4.2 — inclusive [start, end] range of the line at idx plus its subtree.
export function subtreeRange(infos, idx) {
  const info = infos[idx]
  if (!info) return [idx, idx]

  if (info.type === 'heading') {
    let end = idx
    for (let i = idx + 1; i < infos.length; i++) {
      const t = infos[i]
      if (t.type === 'heading' && t.level <= info.level) break
      end = i
    }
    return [idx, end]
  }

  if (info.type === 'list') {
    let end = idx
    for (let i = idx + 1; i < infos.length; i++) {
      const t = infos[i]
      if (t.type === 'blank') continue // interior blank — included only if deeper content follows
      if ((t.indent ?? 0) > info.indent) end = i
      else break
    }
    return [idx, end]
  }

  return [idx, idx] // plain / blank — no subtree
}

// --- transforms ---------------------------------------------------------------

// Add (+) or remove (-) leading spaces over [s,e]. Returns new lines or null if blocked.
export function indentRange(lines, s, e, delta) {
  const out = lines.slice()
  if (delta > 0) {
    const pad = ' '.repeat(delta)
    for (let i = s; i <= e; i++) {
      if (isBlank(out[i])) continue
      out[i] = pad + out[i]
    }
    return out
  }
  // Design Ref: §6.1 — outdent aborts whole op if the root line is at column 0.
  if (leadingSpaces(lines[s]) === 0) return null
  for (let i = s; i <= e; i++) {
    if (isBlank(out[i])) continue
    const remove = Math.min(-delta, leadingSpaces(out[i]))
    out[i] = out[i].slice(remove)
  }
  return out
}

// Add (+1) or remove (-1) one `#` from every heading line in [s,e].
// Design Ref: §6.1 — aborts (null) if any heading would cross the h1/h6 cap.
export function shiftHeadingSubtree(lines, infos, s, e, delta) {
  for (let i = s; i <= e; i++) {
    if (infos[i].type !== 'heading') continue
    const next = infos[i].level + delta
    if (next < 1 || next > MAX_HEADING_LEVEL) return null
  }
  const out = lines.slice()
  for (let i = s; i <= e; i++) {
    if (infos[i].type !== 'heading') continue
    const m = HEADING_RE.exec(out[i])
    const hashes = delta > 0 ? m[2] + '#' : m[2].slice(1)
    out[i] = m[1] + hashes + out[i].slice(m[1].length + m[2].length)
  }
  return out
}

function isSibling(cur, sib) {
  if (!sib) return false
  if (cur.type === 'heading') return sib.type === 'heading' && sib.level === cur.level
  if (cur.type === 'list') return sib.type === 'list' && sib.indent === cur.indent
  return false
}

// The next block down is a sibling only if the line right after the subtree matches level.
function nextSiblingStart(infos, e, info) {
  const j = e + 1
  return j < infos.length && isSibling(info, infos[j]) ? j : -1
}

// Walk back from the line before the current block to find the previous sibling's root.
function prevSiblingStart(infos, s, info) {
  if (info.type === 'heading') {
    for (let i = s - 1; i >= 0; i--) {
      const t = infos[i]
      if (t.type !== 'heading') continue
      if (t.level < info.level) return -1 // hit the parent
      if (t.level === info.level) return i
    }
    return -1
  }
  if (info.type === 'list') {
    for (let i = s - 1; i >= 0; i--) {
      const t = infos[i]
      if (t.type === 'blank') continue
      const ti = t.indent ?? 0
      if (ti > info.indent) continue // descendant of the sibling
      return ti === info.indent && t.type === 'list' ? i : -1
    }
    return -1
  }
  return -1
}

// The nearest preceding list item shallower than `indent` — the direct list
// parent of a block at `s`. Returns -1 if the boundary above is the document
// top or a non-list line (no list parent to cross into).
function listParentStart(infos, s, indent) {
  for (let i = s - 1; i >= 0; i--) {
    const t = infos[i]
    if (t.type === 'blank') continue
    if ((t.indent ?? 0) >= indent) continue // sibling-subtree content
    return t.type === 'list' ? i : -1
  }
  return -1
}

// Re-pad every non-blank line in `block` by `delta` spaces (delta <= 0 in the
// cross-level moves below — the item promotes or holds level, never deepens).
function reindentBlock(block, delta) {
  if (delta === 0) return block.slice()
  if (delta > 0) {
    const pad = ' '.repeat(delta)
    return block.map((l) => (isBlank(l) ? l : pad + l))
  }
  return block.map((l) => (isBlank(l) ? l : l.slice(Math.min(-delta, leadingSpaces(l)))))
}

// Design Ref: §4.2 (extended) — a list item with no same-level sibling in the
// move direction jumps over its parent. It lands as the last/first child of the
// parent's adjacent sibling (level held), or promotes one level when the parent
// has no such sibling. The moved item's level only ever rises — never deepens.
function crossLevelMove(lines, infos, s, e, info, dir) {
  const p = listParentStart(infos, s, info.indent)
  if (p < 0) return null
  const parent = infos[p]

  if (dir === 'up') {
    // A previous aunt (parent's prev sibling) accepts the item at its current
    // level as a trailing child; otherwise the item promotes to the parent's level.
    const hasAunt = prevSiblingStart(infos, p, parent) >= 0
    const delta = hasAunt ? 0 : -(info.indent - parent.indent)
    const block = reindentBlock(lines.slice(s, e + 1), delta)
    // Lift the block out and re-insert it right before the parent (line p).
    const out = lines.slice(0, p).concat(block, lines.slice(p, s), lines.slice(e + 1))
    return { lines: out, range: [p, p + block.length - 1], indentDelta: delta }
  }

  // down — X is the last child of its parent, so e is the parent's subtree end.
  const aunt = nextSiblingStart(infos, e, parent)
  const delta = aunt >= 0 ? 0 : -(info.indent - parent.indent)
  // With an aunt, slot in as its first child (just after the aunt's own line);
  // otherwise promote and drop in right after the parent's subtree.
  const after = aunt >= 0 ? aunt : e
  const block = reindentBlock(lines.slice(s, e + 1), delta)
  const rest = lines.slice(0, s).concat(lines.slice(e + 1))
  const insertIdx = after + 1 - (e - s + 1) // `after` is always >= s here
  const out = rest.slice(0, insertIdx).concat(block, rest.slice(insertIdx))
  return { lines: out, range: [insertIdx, insertIdx + block.length - 1], indentDelta: delta }
}

// Design Ref: §4.2 — swap the current block with its same-level sibling. List
// items with no same-level sibling fall through to a cross-level move (see above);
// headings and plain/blank lines stay sibling-only.
// Returns { lines, range:[ns,ne], indentDelta } (new range of the moved block) or null.
export function moveSection(lines, infos, idx, dir) {
  const info = infos[idx]
  if (!info) return null

  if (info.type === 'plain' || info.type === 'blank') {
    const target = dir === 'up' ? idx - 1 : idx + 1
    if (target < 0 || target >= lines.length) return null
    const out = lines.slice()
    const tmp = out[idx]
    out[idx] = out[target]
    out[target] = tmp
    return { lines: out, range: [target, target], indentDelta: 0 }
  }

  const [s, e] = subtreeRange(infos, idx)
  const block = lines.slice(s, e + 1)

  if (dir === 'down') {
    const sibStart = nextSiblingStart(infos, e, info)
    if (sibStart < 0) {
      return info.type === 'list' ? crossLevelMove(lines, infos, s, e, info, 'down') : null
    }
    const [, sibEnd] = subtreeRange(infos, sibStart)
    const sibBlock = lines.slice(sibStart, sibEnd + 1)
    const out = lines.slice(0, s).concat(sibBlock, block, lines.slice(sibEnd + 1))
    const ns = s + sibBlock.length
    return { lines: out, range: [ns, ns + block.length - 1], indentDelta: 0 }
  }

  const sibStart = prevSiblingStart(infos, s, info)
  if (sibStart < 0) {
    return info.type === 'list' ? crossLevelMove(lines, infos, s, e, info, 'up') : null
  }
  const sibBlock = lines.slice(sibStart, s)
  const out = lines.slice(0, sibStart).concat(block, sibBlock, lines.slice(e + 1))
  return { lines: out, range: [sibStart, sibStart + block.length - 1], indentDelta: 0 }
}

// --- dispatcher ---------------------------------------------------------------

function lineOffsets(lines) {
  const offs = new Array(lines.length)
  let acc = 0
  for (let i = 0; i < lines.length; i++) {
    offs[i] = acc
    acc += lines[i].length + 1
  }
  return offs
}

function lineAt(offsets, pos) {
  for (let i = offsets.length - 1; i >= 0; i--) {
    if (pos >= offsets[i]) return i
  }
  return 0
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}

function identifyCombo(e) {
  if (e.key === 'Tab') return e.shiftKey ? 'outdent' : 'indent'
  if (e.metaKey || e.ctrlKey) {
    if (e.key === 'ArrowUp') return 'moveUp'
    if (e.key === 'ArrowDown') return 'moveDown'
  }
  return null
}

// Design Ref: §4 — per-line context rule over a multi-line selection (no subtree).
function applyPerLine(lines, infos, startLine, endLine, combo) {
  const out = lines.slice()
  let changed = false
  for (let i = startLine; i <= endLine; i++) {
    const info = infos[i]
    if (info.type === 'blank') continue
    if (info.type === 'heading') {
      const delta = combo === 'indent' ? 1 : -1
      const next = info.level + delta
      if (next < 1 || next > MAX_HEADING_LEVEL) continue
      const m = HEADING_RE.exec(out[i])
      out[i] = m[1] + (delta > 0 ? m[2] + '#' : m[2].slice(1)) + out[i].slice(m[1].length + m[2].length)
      changed = true
    } else if (combo === 'indent') {
      out[i] = ' '.repeat(INDENT_UNIT) + out[i]
      changed = true
    } else {
      const ls = leadingSpaces(out[i])
      if (ls === 0) continue
      out[i] = out[i].slice(Math.min(INDENT_UNIT, ls))
      changed = true
    }
  }
  if (!changed) return null
  const newOffsets = lineOffsets(out)
  return {
    content: out.join('\n'),
    selStart: newOffsets[startLine],
    selEnd: newOffsets[endLine] + out[endLine].length,
  }
}

// Design Ref: §4.1 — top-level dispatcher. Returns an applied result or null
// (not an outline key, or a boundary no-op). Pure: no DOM, no React.
export function handleOutlineKey(content, selStart, selEnd, event) {
  const combo = identifyCombo(event)
  if (!combo) return null

  const lines = content.split('\n')
  const infos = classifyLines(lines)
  const offsets = lineOffsets(lines)
  const startLine = lineAt(offsets, selStart)
  const endLine = lineAt(offsets, selEnd)

  if (combo === 'moveUp' || combo === 'moveDown') {
    if (startLine !== endLine) return null // multi-line move: no-op in v1
    const res = moveSection(lines, infos, startLine, combo === 'moveUp' ? 'up' : 'down')
    if (!res) return null
    const [s] = subtreeRange(infos, startLine)
    const newLine = res.range[0] + (startLine - s)
    const col = selStart - offsets[startLine]
    const newOffsets = lineOffsets(res.lines)
    // A cross-level move re-indents the line; shift the column to keep the
    // cursor on the same character.
    const pos = newOffsets[newLine] + clamp(col + (res.indentDelta ?? 0), 0, res.lines[newLine].length)
    return { content: res.lines.join('\n'), selStart: pos, selEnd: pos }
  }

  // indent / outdent
  if (startLine !== endLine) {
    return applyPerLine(lines, infos, startLine, endLine, combo)
  }

  const info = infos[startLine]
  let out
  if (info.type === 'heading') {
    const [s, e] = subtreeRange(infos, startLine)
    out = shiftHeadingSubtree(lines, infos, s, e, combo === 'indent' ? 1 : -1)
  } else {
    const [s, e] = info.type === 'list' ? subtreeRange(infos, startLine) : [startLine, startLine]
    out = indentRange(lines, s, e, combo === 'indent' ? INDENT_UNIT : -INDENT_UNIT)
  }
  if (!out) return null

  // Cursor stays on the same line; column shifts by that line's prefix-length change.
  const colDelta = out[startLine].length - lines[startLine].length
  const newOffsets = lineOffsets(out)
  const base = newOffsets[startLine]
  const lineLen = out[startLine].length
  const ns = base + clamp(selStart - offsets[startLine] + colDelta, 0, lineLen)
  const ne = base + clamp(selEnd - offsets[startLine] + colDelta, 0, lineLen)
  return { content: out.join('\n'), selStart: ns, selEnd: ne }
}

// --- Enter: list continuation -------------------------------------------------

// GFM requires a space between the bullet and the checkbox — `- [ ]`, never `-[ ]`.
const CONT_TASK_RE = /^(\s*)([-*+])(\s+)\[[ xX]\](\s*)/
const CONT_OL_RE   = /^(\s*)(\d+)([.)])(\s+)/
const CONT_UL_RE   = /^(\s*)([-*+])(\s+)/

// Pressing Enter inside a list item carries the marker onto the next line;
// pressing Enter on an *empty* list item clears the marker so the list ends.
// Pure: returns { content, selStart, selEnd } or null — null means "let the
// editor insert a plain newline". The caller must skip this during IME
// composition (a Korean Enter that commits Hangul is not a list Enter).
export function continueList(content, selStart, selEnd) {
  if (selStart !== selEnd) return null // a selection: a plain newline replaces it

  const lines = content.split('\n')
  const offsets = lineOffsets(lines)
  const idx = lineAt(offsets, selStart)
  // classifyLines is fence-aware — a `- x` line inside a code block is not a list.
  if (classifyLines(lines)[idx]?.type !== 'list') return null

  const line = lines[idx]
  const cursorCol = selStart - offsets[idx]

  let prefixLen, nextPrefix
  const task = CONT_TASK_RE.exec(line)
  const ol = task ? null : CONT_OL_RE.exec(line)
  const ul = task || ol ? null : CONT_UL_RE.exec(line)
  if (task) {
    prefixLen = task[0].length
    nextPrefix = task[1] + task[2] + ' [ ] ' // a continued task starts unchecked
  } else if (ol) {
    prefixLen = ol[0].length
    nextPrefix = ol[1] + (parseInt(ol[2], 10) + 1) + ol[3] + ' '
  } else if (ul) {
    prefixLen = ul[0].length
    nextPrefix = ul[1] + ul[2] + ' '
  } else {
    return null
  }

  // Cursor sitting within the indent/marker — treat Enter as a plain newline.
  if (cursorCol < prefixLen) return null

  const out = lines.slice()
  if (/^\s*$/.test(line.slice(prefixLen))) {
    // Empty item: drop the marker so the list ends here.
    out[idx] = ''
    const pos = lineOffsets(out)[idx]
    return { content: out.join('\n'), selStart: pos, selEnd: pos }
  }

  // Non-empty: split at the cursor, carry the marker onto the new line.
  const before = line.slice(0, cursorCol)
  const after = line.slice(cursorCol)
  out.splice(idx, 1, before, nextPrefix + after)
  const pos = lineOffsets(out)[idx + 1] + nextPrefix.length
  return { content: out.join('\n'), selStart: pos, selEnd: pos }
}
