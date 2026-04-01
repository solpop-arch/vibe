# vibe

AI가 만든 결과물을 바로 확인하는, 항상 떠 있는 가벼운 창.

**vibe .** 그걸로 충분하다.

## What is Vibe?

AI CLI(Claude Code 등)로 코딩할 때, 결과물을 확인하려면 매번 `cat`, `vim`, 또는 무거운 IDE를 열어야 합니다. Vibe는 이 문제를 해결합니다.

- **항상 떠 있다** — AI가 파일을 바꾸면 자동 반영. 도구 전환 비용 제로.
- **보는 것이 핵심** — 마크다운 렌더링, 코드 구문 강조, 클릭 한 번으로 확인.
- **가볍고 빠르다** — Tauri 네이티브 앱. ~10MB 번들. 즉시 실행.

## Installation

### Prerequisites

- [Rust](https://rustup.rs/) (1.70+)
- [Node.js](https://nodejs.org/) (18+)

### Build from source

```bash
git clone https://github.com/your-username/vibe.git
cd vibe
cd client && npm install && cd ..
npx @tauri-apps/cli@^2 build
```

빌드된 앱은 `src-tauri/target/release/bundle/` 에 생성됩니다.

### Development

```bash
npx @tauri-apps/cli@^2 dev
```

## Usage

```bash
# 프로젝트 폴더를 지정해서 실행
vibe /path/to/project

# 현재 디렉토리에서 실행
vibe .

# 폴더 지정 없이 실행 → 폴더 선택 다이얼로그
vibe
```

## Features

| Feature | Description |
|---|---|
| **File Explorer** | 프로젝트 파일 트리 탐색, 키보드 네비게이션 |
| **File Viewer** | 마크다운 렌더링, 코드 구문 강조, 줄 번호 |
| **File Editing** | 즉석 편집 모드, Ctrl+S 저장 |
| **File Watching** | AI가 파일 수정 시 자동 새로고침 (150ms 디바운스) |
| **File Operations** | 파일/폴더 생성, 이름 변경, 삭제 |
| **Project Switching** | 런타임에 프로젝트 폴더 변경 |

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Arrow Up/Down` | 파일 탐색 |
| `Enter` | 파일 열기 / 풀스크린 토글 |
| `Backspace` | 상위 디렉토리 |
| `E` | 편집 모드 |
| `Ctrl+S` | 저장 |
| `Ctrl+B` | 사이드바 토글 |
| `A` / `Shift+A` | 새 파일 / 새 폴더 |
| `R` | 이름 변경 |
| `Del` | 삭제 |
| `C` | 경로 복사 |
| `Esc` | 닫기 / 뒤로 |

## Tech Stack

| Component | Technology |
|---|---|
| App Framework | Tauri v2 |
| Backend | Rust |
| Frontend | React + Vite |
| Markdown | react-markdown + remark-gfm |
| Code Highlight | react-syntax-highlighter (Prism) |
| File Watching | notify crate (OS-native) |

## Project Structure

```
vibe/
├── src-tauri/           # Rust backend
│   ├── src/
│   │   ├── commands/    # Tauri commands (file ops, watcher, dialog)
│   │   ├── watcher/     # File system watcher with debounce
│   │   ├── constants.rs # Shared constants
│   │   ├── error.rs     # Error types
│   │   ├── state.rs     # App state management
│   │   └── lib.rs       # App setup
│   ├── Cargo.toml
│   └── tauri.conf.json
├── client/              # React frontend
│   ├── src/
│   │   ├── App.jsx      # Main UI component
│   │   └── api.js       # Tauri IPC layer
│   └── package.json
└── README.md
```

## Roadmap

- [x] **Phase 1**: File tree + viewer + file watching
- [ ] **Phase 2**: Git integration + project switcher + diff view
- [ ] **Phase 3**: Dashboard, templates, UI polish → v1.0

## License

MIT

---
*Created with vibe-coding.*
