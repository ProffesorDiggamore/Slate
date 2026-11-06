import { afterEach, describe, expect, it, vi } from 'vitest'
import { httpBaseUrl, isLocalUrl } from './providers'
import { clearAiSecrets, connectionOf, isAiReady, slotOf, type AiConfig } from './store'

const base: AiConfig = { provider: 'other', preset: 'custom', customUrl: '', localUrls: {}, models: {}, consent: {}, keys: {} }
const cfg = (patch: Partial<AiConfig>): AiConfig => ({ ...base, ...patch })

describe('httpBaseUrl', () => {
  it('keeps full http(s) addresses, minus trailing slashes', () => {
    expect(httpBaseUrl(' https://api.together.xyz/v1/ ')).toBe('https://api.together.xyz/v1')
    expect(httpBaseUrl('http://192.168.1.20:11434/v1')).toBe('http://192.168.1.20:11434/v1')
  })

  it('refuses anything fetch() would resolve against the page or another scheme', () => {
    for (const url of ['api.together.xyz/v1', '/v1', '//api.example.com/v1', 'ftp://example.com/v1', 'javascript:alert(1)', 'https://', ''])
      expect(httpBaseUrl(url)).toBe('')
  })
})

describe('isLocalUrl', () => {
  it('knows this device and the private network ranges', () => {
    for (const host of ['localhost:11434', '127.0.0.1', '[::1]:8080', '10.0.0.5', '172.16.0.1', '172.31.255.254', '192.168.1.20:1234', '169.254.3.4', 'studio.local'])
      expect(isLocalUrl(`http://${host}/v1`), host).toBe(true)
  })

  it('treats everything else as the internet', () => {
    for (const host of ['172.32.0.1', '172.15.0.1', '8.8.8.8', '192.169.1.1', 'example.com', 'local.example.com'])
      expect(isLocalUrl(`http://${host}/v1`), host).toBe(false)
    expect(isLocalUrl('not a url')).toBe(false)
  })
})

describe('connectionOf', () => {
  it('sends nothing for a custom address typed without https://', () => {
    const c = cfg({ customUrl: 'api.together.xyz/v1', models: { 'other:custom:unset': 'm' }, consent: { 'other:custom:unset': true } })
    expect(slotOf(c)).toBe('other:custom:unset')
    expect(connectionOf(c)?.baseUrl).toBe('')
    expect(isAiReady(c)).toBe(false)
  })

  it('uses a full custom address, keyed by its host', () => {
    const c = cfg({ customUrl: 'https://api.together.xyz/v1/', models: { 'other:custom:api.together.xyz': 'm' } })
    expect(slotOf(c)).toBe('other:custom:api.together.xyz')
    expect(connectionOf(c)).toMatchObject({ baseUrl: 'https://api.together.xyz/v1', name: 'api.together.xyz', local: false })
    expect(isAiReady(c)).toBe(true)
  })

  it('counts a custom server on the local network as local', () => {
    expect(connectionOf(cfg({ customUrl: 'http://192.168.1.5:8000/v1' }))).toMatchObject({ local: true, needsKey: false })
  })

  it('lets the app reach Ollama at the computer’s address on the network', () => {
    const c = cfg({ preset: 'ollama', localUrls: { ollama: 'http://192.168.1.20:11434/v1/' } })
    expect(connectionOf(c, true)).toMatchObject({ slot: 'other:ollama', baseUrl: 'http://192.168.1.20:11434/v1', local: true, needsKey: false })
    // The website can only reach localhost, so it keeps the fixed address.
    expect(connectionOf(c, false)?.baseUrl).toBe('http://localhost:11434/v1')
    // Nothing typed yet: this computer, as before.
    expect(connectionOf(cfg({ preset: 'lmstudio' }), true)?.baseUrl).toBe('http://localhost:1234/v1')
  })

  it('only takes local-network addresses for Ollama and LM Studio', () => {
    for (const url of ['https://ollama.example.com/v1', '192.168.1.20:11434/v1', ''])
      expect(connectionOf(cfg({ preset: 'ollama', localUrls: { ollama: url } }), true)?.baseUrl, url).toBe('')
  })
})

describe('clearAiSecrets', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('removes every saved key, including custom servers this install has no flag for', async () => {
    const store = new Map<string, string>([
      ['slate.secret.ai.openai', 'sk-1'],
      ['slate.secret.ai.other:custom:old.example', 'sk-2'],
      ['slate.theme', 'dark'],
    ])
    vi.stubGlobal('localStorage', {
      get length() {
        return store.size
      },
      key: (i: number) => [...store.keys()][i] ?? null,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    })
    await clearAiSecrets()
    const left = [...store.keys()]
    expect(left.filter((k) => k.startsWith('slate.secret.'))).toEqual([])
    expect(left).toContain('slate.theme')
  })
})
