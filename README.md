# vibe

**Your window into AI-native coding.**

Run `vibe .` in any project directory. That's all you need.

<p align="center">
  <img src="./assets/screenshot-light.png" width="720" alt="Vibe — light mode" />
</p>
<p align="center">
  <img src="./assets/screenshot-dark.png" width="720" alt="Vibe — dark mode" />
</p>

When AI changes your code, vibe shows you what happened, lets you review the changes, and edit files to steer direction — all in real time. No debugger, no compiler. Just documents, edits, and context.

[한국어 설명 (Korean README)](./README.ko.md)

<br>

## 🚀 Getting Started

Download the latest version from [GitHub Releases](https://github.com/solpop-arch/vibe/releases).

- **macOS (Apple Silicon)**: `vibe_x.x.x_aarch64.dmg`
- **macOS (Intel)**: `vibe_x.x.x_x64.dmg`
- **Windows**: `vibe_x.x.x_x64-setup.exe`
- **Linux**: `vibe_x.x.x_amd64.AppImage`

On macOS, open the DMG and drag the app to your Applications folder.

<br>

## What you can do

**Browse and edit files** — Explore your project as a file tree. Markdown is rendered, code is syntax-highlighted. Edit and save in place.

**See AI changes in real time** — When an AI CLI like Claude Code modifies a file, vibe auto-refreshes. If you're editing, it shows a "changed externally" badge instead of overwriting your work.

**Git diff** — See which files changed with status badges. View diffs inline or side-by-side.

**Project dashboard** — When you open a project, vibe greets you with a dashboard instead of a blank editor. See your codebase at a glance:

- **Changed files** — uncommitted git changes, newest first, so you can immediately see what your AI CLI just touched (recently modified files when the tree is clean or not a repo)
- **Documents** — markdown docs grouped by top-level folder (collapsed by default), with pinning
- **Link health** — broken links and orphan docs, collapsed to a one-line summary (hidden when there are none)
- **Header** — branch, working tree state, file and doc counts

This is especially useful when returning to a project after an AI session — you can quickly orient yourself without digging through the file tree.

**Multiple projects** — Register projects and switch between them with Cmd+1–9.

**Dark mode** — Warm walnut-toned dark theme. Toggle with Ctrl+Shift+L.

<br>

## Usage

Open the app and pick a folder. Or launch from the terminal:

```bash
vibe /path/to/project    # Open a specific folder
vibe .                   # Open current directory
vibe                     # Folder picker dialog
```

<br>

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Arrow Up/Down` | Navigate files |
| `Enter` | Open file |
| `Backspace` | Parent directory |
| `E` | Edit mode |
| `D` | Diff view |
| `Ctrl+S` | Save |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+R` | Refresh |
| `Ctrl+Shift+L` | Toggle dark mode |
| `Cmd+1-9` | Switch between projects |
| `A` / `Shift+A` | New file / New folder |
| `R` | Rename |
| `Del` | Delete |
| `C` | Copy path |
| `Space` / `Shift+Space` | Page scroll |
| `Esc` | Close / Back |

> Tip: Drag the sidebar's right edge to resize it. Double-click the edge to reset to the default width.

<br>

## Build from source

<details>
<summary>For developers — click to expand</summary>

### Prerequisites

- [Rust](https://rustup.rs/) (1.70+)
- [Node.js](https://nodejs.org/) (18+)

### Build

```bash
git clone https://github.com/solpop-arch/vibe.git
cd vibe
cd client && npm install && cd ..
npx @tauri-apps/cli@^2 build
```

The built app is generated at `src-tauri/target/release/bundle/`.

### Development

```bash
npx @tauri-apps/cli@^2 dev
```

### Tech Stack

Tauri v2 · Rust · React + Vite · react-markdown · react-syntax-highlighter · notify crate · git2 (libgit2)

</details>

<br>

## License

[Mozilla Public License 2.0](./LICENSE)
