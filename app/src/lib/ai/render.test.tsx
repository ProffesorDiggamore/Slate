import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AiMarkdown, safeHref } from './render'

const html = (text: string) => renderToStaticMarkup(<AiMarkdown text={text} onWikilink={() => {}} />)

describe('AiMarkdown', () => {
  it('renders ordinary Markdown', () => {
    const out = html('# Plan\n\nSome **bold** and *soft* text with `code`.\n\n- one\n- two\n\n1. first\n2. second')
    expect(out).toContain('<h3>Plan</h3>')
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('<em>soft</em>')
    expect(out).toContain('<code>code</code>')
    expect(out).toContain('<ul><li>one</li><li>two</li></ul>')
    expect(out).toContain('<ol><li>first</li><li>second</li></ol>')
  })

  it('shows raw HTML as text instead of running it', () => {
    const out = html('<script>alert(1)</script>\n\nHi <img src=x onerror="alert(2)"> there <b onclick="x()">b</b>\n\n<iframe src="https://evil.example"></iframe>')
    // Any real tag or attribute would need a literal < or "; in text they come out as &lt; and &quot;.
    expect(out).not.toMatch(/<(script|img|iframe|b)[\s>]/i)
    expect(out).not.toMatch(/on\w+="/i)
    expect(out).toContain('&lt;script&gt;')
    expect(out).toContain('&lt;img src=x onerror=&quot;alert(2)&quot;&gt;')
  })

  it('only links http(s) and mailto', () => {
    const out = html(
      '[a](javascript:alert(1)) [b](JaVaScRiPt:alert(1)) [c]( javascript:alert(1)) [d](data:text/html,<script>x</script>) [e](vbscript:x) [f](/relative) [ok](https://example.com/x?y=1) [mail](mailto:me@example.com)',
    )
    expect(out).not.toMatch(/href="(?!https:\/\/example\.com|mailto:)/)
    expect(out).toContain('<a href="https://example.com/x?y=1" target="_blank" rel="noopener noreferrer">ok</a>')
    expect(out).toContain('href="mailto:me@example.com"')
    expect(out).not.toMatch(/href="(javascript|data|vbscript)/i)
  })

  it('never loads images, offering a safe link instead', () => {
    const out = html('![chart](https://example.com/c.png) ![bad](javascript:alert(1))')
    expect(out).not.toContain('<img')
    expect(out).toContain('href="https://example.com/c.png"')
    expect(out).not.toContain('href="javascript')
  })

  it('autolinks bare URLs safely', () => {
    expect(html('see https://example.com now')).toContain('<a href="https://example.com/"')
  })

  it('draws task lists without the raw [ ] marker', () => {
    const out = html('- [ ] buy milk\n- [x] call mum')
    expect(out).not.toContain('[ ]')
    expect(out).toContain('class="is-task"')
    expect(out).toContain('class="is-task is-checked"')
    expect(out).toContain('buy milk')
  })

  it('renders cited notes as buttons', () => {
    const out = html('From [[Trip to Rome]] and [[Q3 plan|the plan]].')
    expect(out).toContain('<button type="button" class="ai-wikilink">Trip to Rome</button>')
    expect(out).toContain('>the plan</button>')
  })

  it('escapes code blocks and tables', () => {
    const out = html('```html\n<script>x</script>\n```\n\n| a | b |\n|---|---|\n| <b>1</b> | 2 |')
    expect(out).toContain('<pre><code>&lt;script&gt;x&lt;/script&gt;</code></pre>')
    expect(out).toContain('<td>&lt;b&gt;1&lt;/b&gt;</td>')
  })
})

describe('safeHref', () => {
  it('rejects everything but http(s) and mailto', () => {
    expect(safeHref('https://a.example')).toBe('https://a.example/')
    expect(safeHref('http://a.example/x')).toBe('http://a.example/x')
    expect(safeHref('mailto:a@b.c')).toBe('mailto:a@b.c')
    for (const bad of ['javascript:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', '/x', '', null])
      expect(safeHref(bad)).toBeNull()
  })
})
