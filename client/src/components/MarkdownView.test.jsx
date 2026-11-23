import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('../api', () => ({ readImage: vi.fn(), openExternal: vi.fn(() => Promise.resolve()) }))
vi.mock('react-syntax-highlighter', () => ({ Prism: ({ children }) => <pre>{children}</pre> }))
vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({ vscDarkPlus: {}, oneLight: {} }))

import MarkdownView from './MarkdownView'

const html = (content) => renderToStaticMarkup(<MarkdownView content={content} isDark={false} fileDirPath="/r" rootPath="/r" />)

describe('MarkdownView tildes', () => {
  it('keeps single tildes as range markers instead of striking text through', () => {
    const out = html('일치율 10.5~64% 이고 기간 2016-10~2026-10 이다')
    expect(out).not.toContain('<del')
    expect(out).toContain('10.5~64%')
    expect(out).toContain('2016-10~2026-10')
  })
  it('still renders ~~double tilde~~ as strikethrough', () => {
    expect(html('이것은 ~~취소~~ 입니다')).toMatch(/<del[^>]*>취소<\/del>/)
  })
})

describe('MarkdownView raw HTML', () => {
  it('drops scripts, event handlers and javascript: links', () => {
    const out = html('<script>alert(1)</script><img src="x" onerror="alert(1)"> [a](javascript:alert(1))')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('onerror')
    expect(out).not.toMatch(/href="javascript:/i)
  })
  it('keeps harmless inline HTML', () => {
    expect(html('<strong>굵게</strong>')).toMatch(/<strong[^>]*>굵게<\/strong>/)
  })
})
