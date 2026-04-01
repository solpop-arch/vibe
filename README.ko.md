# vibe — 가벼운 AI 코드 뷰어

**vibe**는 Tauri v2 기반의 초경량 네이티브 데스크톱 앱입니다. AI CLI(Claude Code 등)가 만든 결과물을 항상 떠 있는 창에서 바로 확인할 수 있습니다.

## 시작하기

### 필수 조건

- [Rust](https://rustup.rs/) (1.70+)
- [Node.js](https://nodejs.org/) (18+)

### 소스에서 빌드

```bash
git clone https://github.com/your-username/vibe.git
cd vibe
cd client && npm install && cd ..
npx @tauri-apps/cli@^2 build
```

빌드된 앱은 `src-tauri/target/release/bundle/`에 생성됩니다.

### 개발 모드

```bash
npx @tauri-apps/cli@^2 dev
```

## 사용법

```bash
# 프로젝트 폴더를 지정해서 실행
vibe /path/to/project

# 현재 디렉토리에서 실행
vibe .

# 폴더 지정 없이 실행 → 폴더 선택 다이얼로그
vibe
```

## 주요 기능

| 기능 | 설명 |
|---|---|
| **파일 탐색기** | 프로젝트 파일 트리 탐색, 키보드 네비게이션 |
| **파일 뷰어** | 마크다운 렌더링, 코드 구문 강조, 줄 번호 |
| **파일 편집** | 즉석 편집 모드, Ctrl+S 저장 |
| **파일 감시** | AI가 파일 수정 시 자동 새로고침 |
| **파일 관리** | 파일/폴더 생성, 이름 변경, 삭제 |
| **프로젝트 전환** | 런타임에 프로젝트 폴더 변경 |

## 단축키

| 키 | 동작 |
|---|---|
| `↑↓` | 파일 탐색 |
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

## 기술 스택

| 구성 요소 | 기술 |
|---|---|
| 앱 프레임워크 | Tauri v2 |
| 백엔드 | Rust |
| 프론트엔드 | React + Vite |
| 마크다운 | react-markdown + remark-gfm |
| 코드 하이라이트 | react-syntax-highlighter (Prism) |
| 파일 감시 | notify crate (OS 네이티브) |

## 로드맵

- [x] **1단계**: 파일 트리 + 뷰어 + 파일 감시
- [ ] **2단계**: Git 연동 + 프로젝트 스위처 + diff 뷰
- [ ] **3단계**: 대시보드, 템플릿, UI 다듬기 → v1.0

## 라이선스

MIT

---
*Created with vibe-coding.*
