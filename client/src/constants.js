// font-size 12.5px × 1.76 ≈ 22. Coupled to textarea + virtualized rows — update together.
export const EDIT_FONT_PX = 12.5
export const LINE_HEIGHT_PX = 22
export const EDIT_PADDING_PX = 16
// Fixed gutter width — covers up to 99,999 lines, well above the 1MB read cap.
export const LINE_NUM_WIDTH = '5ch'

// ── Font family constants ────────────────────────────────────────────────────
export const FONT_MONO  = "'JetBrains Mono',monospace"
export const FONT_SERIF = "'Instrument Serif',serif"
export const FONT_UI    = "'Geist',sans-serif"

// ── Korean keyboard ───────────────────────────────────────────────────────────
const KEY_ALIASES = {
  'ㅂ':'q','ㅈ':'w','ㄷ':'e','ㄱ':'r','ㅅ':'t','ㅛ':'y','ㅕ':'u','ㅑ':'i','ㅐ':'o','ㅔ':'p',
  'ㅁ':'a','ㄴ':'s','ㅇ':'d','ㄹ':'f','ㅎ':'g','ㅗ':'h','ㅓ':'j','ㅏ':'k','ㅣ':'l',
  'ㅋ':'z','ㅌ':'x','ㅊ':'c','ㅍ':'v','ㅠ':'b','ㅜ':'n','ㅡ':'m','₩':'`',
}
export const resolveKey = (key) => (KEY_ALIASES[key] ?? key).toLowerCase()

// ── File icons ───────────────────────────────────────────────────────────────
export const ICON_MAP = {
  jsx: { ch:'⚛', color:'#C85A2A' }, tsx: { ch:'⚛', color:'#3178C6' },
  js:  { ch:'⚡', color:'#D4A017' }, ts:  { ch:'⬡', color:'#3178C6' },
  rs:  { ch:'⬢', color:'#CE422B' }, py:  { ch:'⬢', color:'#3572A5' }, go: { ch:'⬢', color:'#00ADD8' },
  md:  { ch:'✦', color:'var(--muted)' }, mdx: { ch:'✦', color:'var(--muted)' }, txt: { ch:'✦', color:'var(--muted)' },
  json:{ ch:'{ }', color:'var(--muted)' }, toml:{ ch:'⊕', color:'var(--muted)' }, yaml:{ ch:'⊕', color:'var(--muted)' }, yml:{ ch:'⊕', color:'var(--muted)' },
  html:{ ch:'◇', color:'#E34C26' }, css:{ ch:'◈', color:'#563D7C' }, scss:{ ch:'◈', color:'#563D7C' },
  sh:{ ch:'$', color:'var(--muted)' }, lock:{ ch:'⊘', color:'var(--muted)' },
}
export const getIcon = (name) => { const ext = name.split('.').pop()?.toLowerCase(); return ICON_MAP[ext] || { ch:'·', color:'var(--muted)' } }

const DOC_ICON_MAP = { 'CLAUDE.md':'⚙︎', 'DESIGN.md':'◈', 'README.md':'✦', 'readme.md':'✦', 'TODO.md':'☐', 'todo.md':'☐', 'CHANGELOG.md':'◉', 'changelog.md':'◉', 'LICENSE':'§', 'LICENSE.md':'§' }
export const getDocIcon = (name) => DOC_ICON_MAP[name] || getIcon(name).ch

// ── Document + language classification ────────────────────────────────────────
export const DOC_EXTENSIONS = new Set(['md','mdx','txt','rst','doc','docx','pdf'])
export const DOC_FOLDERS    = new Set(['docs','doc','documentation','notes','wiki','pages','tasks'])
export const EXT_TO_LANG = { js:'JavaScript', jsx:'JSX', ts:'TypeScript', tsx:'TSX', rs:'Rust', py:'Python', css:'CSS', scss:'CSS', html:'HTML', json:'JSON', toml:'TOML', md:'Markdown', mdx:'Markdown', sh:'Shell' }
export const LANG_COLORS = { JSX:'#E8703A', JavaScript:'#F0C945', TypeScript:'#3178C6', TSX:'#61DAFB', Rust:'#9C4221', Python:'#3572A5', CSS:'#563D7C', HTML:'#E34C26', JSON:'#A0A0A0', TOML:'#9C4221', Markdown:'#5D8FBD', Shell:'#89E051', Other:'#857B70' }

// ── Footer shortcut arrays ────────────────────────────────────────────────────
export const SHORTCUTS_VIEWER_VIEW       = [['E','Edit'], ['Space','Scroll'], ['⌘F','Search'], ['⌘B','Sidebar'], ['Esc','Close']]
export const SHORTCUTS_VIEWER_VIEW_DIRTY = [['E','Edit'], ['D','Diff'], ['Space','Scroll'], ['⌘F','Search'], ['⌘B','Sidebar'], ['Esc','Close']]
export const SHORTCUTS_VIEWER_DIFF       = [['V','View'], ['Esc','Close']]
export const SHORTCUTS_VIEWER_EDIT       = [['Tab','Indent'], ['⌥Z','Wrap'], ['⌘S','Save'], ['Esc','Exit edit']]
export const SHORTCUTS_VIEWER_EDIT_MD    = [['Tab','Indent'], ['⌘P','Edit/Preview'], ['⌥Z','Wrap'], ['⌘S','Save'], ['Esc','Exit edit']]
export const SHORTCUTS_EXPLORER          = [['↑↓','Navigate'], ['A','New'], ['R','Rename'], ['D','Delete'], ['C','Copy'], ['⌘R','Refresh'], ['⌘B','Sidebar'], ['Enter','Open']]

// ── Git badges ────────────────────────────────────────────────────────────────
// 5 states with distinct colors. Folder bubble-up priority: deleted > modified > renamed > added > untracked
const GIT_BADGES = {
  added:     { glyph: '●', color: 'var(--success)' },   // green   — staged new file
  untracked: { glyph: '●', color: '#4DA8A4' },           // teal    — new, not staged
  modified:  { glyph: '●', color: 'var(--warning)' },   // orange  — changed
  deleted:   { glyph: '●', color: 'var(--error)' },     // red     — gone
  renamed:   { glyph: '●', color: '#7B9FD4' },           // steel blue — neutral transform
}
export const GIT_STATE_PRIORITY = ['deleted', 'modified', 'renamed', 'added', 'untracked']
export const GIT_STATE_RANK = Object.fromEntries(GIT_STATE_PRIORITY.map((s, i) => [s, i]))
export const isNewFile = (state) => state === 'added' || state === 'untracked'
export const gitBadgeFor = (state) => GIT_BADGES[state] ?? null
const GIT_STATE_LABELS = { added: 'new file', untracked: 'untracked', modified: 'modified', deleted: 'deleted', renamed: 'renamed' }
export const gitStateLabel = (state) => GIT_STATE_LABELS[state] ?? state ?? ''

// ── Misc helpers ─────────────────────────────────────────────────────────────
export const formatReadError = (err) => {
  const msg = String(err?.message ?? err ?? '')
  if (/too large/i.test(msg)) {
    return '⚠ This file is larger than 2MB and cannot be displayed.\n\nVibe limits in-app file viewing to 2MB to keep the UI responsive.\nOpen it in a dedicated editor instead.'
  }
  if (/binary/i.test(msg)) return '⚠ Binary file — not displayed.'
  return `Error loading file content.\n\n${msg}`
}

// Above this threshold, skip syntax highlighting — prism tokenizes synchronously
// for the whole file, so a 2MB JSON would freeze the UI for seconds.
export const HIGHLIGHT_SIZE_LIMIT = 1024 * 1024

export const RECENT_CHANGES_LIMIT = 10
export const isHiddenFile = (f) => f.name.startsWith('.') || f.parentDir?.startsWith('.') || /\.tmp\.\d+/.test(f.name)
export const basenameOf = (p) => p.split('/').pop()
export const makeRecentEntry = (path, time) => ({ path, name: basenameOf(path), time, lineCount: 0 })

export const SECTION_LABEL = { fontSize:'10px', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--muted)', marginBottom:'8px' }
export const DIVIDER = { border:'none', borderTop:'1px solid var(--border)', margin:0 }

// ── Virtualized code row styles ──────────────────────────────────────────────
export const CODE_ROW_STYLE = {
  width: 'max-content', minWidth: '100%', display: 'flex', whiteSpace: 'pre',
  fontFamily: FONT_MONO, fontSize: '12.5px', lineHeight: `${LINE_HEIGHT_PX}px`, letterSpacing: '0.01em',
}
export const CODE_ROW_LINENUM_STYLE = {
  display: 'inline-block', width: LINE_NUM_WIDTH, paddingRight: '12px',
  color: 'var(--border)', userSelect: 'none', flexShrink: 0, textAlign: 'right', boxSizing: 'border-box',
  position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1,
}
export const CODE_ROW_TOKEN_STYLE = { flex: '0 0 auto' }

// ── Diff styles ──────────────────────────────────────────────────────────────
export const DIFF_ROW_STYLE = {
  display: 'flex', whiteSpace: 'pre', fontFamily: FONT_MONO, fontSize: '12.5px',
  lineHeight: `${LINE_HEIGHT_PX}px`, letterSpacing: '0.01em', minWidth: '100%', width: 'max-content',
}
export const DIFF_GUTTER = {
  display: 'inline-block', width: '3.5ch', paddingRight: '6px', textAlign: 'right',
  color: 'var(--muted)', fontSize: '11px', flexShrink: 0, userSelect: 'none',
}
export const DIFF_MARK_STYLE = { display: 'inline-block', width: '1.5ch', textAlign: 'center', flexShrink: 0, userSelect: 'none' }

// ── Explorer indent ──────────────────────────────────────────────────────────
const INDENT = [12, 24, 40, 56, 72]
export const getIndent = (depth) => INDENT[depth] ?? (12 + depth * 16)

// ── File viewer extension display ────────────────────────────────────────────
export const EXT_TO_DISPLAY = { js:'js', jsx:'jsx', ts:'ts', tsx:'tsx', rs:'rs', py:'py', md:'md', css:'css', html:'html', json:'json', toml:'toml', sh:'sh' }

// ── Project list helpers ─────────────────────────────────────────────────────
const PROJECTS_KEY = 'vibe-projects'
export const loadProjects = () => { try { return JSON.parse(localStorage.getItem(PROJECTS_KEY)) || [] } catch { return [] } }
export const saveProjects = (list) => localStorage.setItem(PROJECTS_KEY, JSON.stringify(list))
export const addProject = (path) => {
  const list = loadProjects()
  if (list.some(p => p.path === path)) return list
  const name = basenameOf(path)
  list.push({ path, name })
  if (list.length > 10) list.shift()
  saveProjects(list)
  return list
}
export const removeProject = (path) => {
  const list = loadProjects().filter(p => p.path !== path)
  saveProjects(list)
  return list
}
export const reorderProjects = (fromIdx, slot) => {
  const list = loadProjects()
  if (fromIdx < 0 || fromIdx >= list.length || slot < 0 || slot > list.length) return list
  if (slot === fromIdx || slot === fromIdx + 1) return list
  const [item] = list.splice(fromIdx, 1)
  const insertAt = slot > fromIdx ? slot - 1 : slot
  list.splice(insertAt, 0, item)
  saveProjects(list)
  return list
}

export function formatAge(ms) {
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}
