// Apply the theme before first paint so there's no flash. Mirrors App.tsx and
// settings.ts (default accent, the old default's migration, the dark-mode lift).
try {
  var s = JSON.parse(localStorage.getItem('cairn.settings.v1') || '{}')
  var t = s.theme || 'system'
  if (t === 'system') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  var r = document.documentElement
  r.dataset.theme = t
  r.dataset.palette = s.palette || 'default'
  var a = typeof s.accent === 'string' ? s.accent.toLowerCase() : ''
  if (a && a !== '#2383e2' && a !== '#2f6bff') {
    r.dataset.accent = ''
    r.style.setProperty('--accent', t === 'dark' ? 'color-mix(in srgb, ' + a + ' 84%, white)' : a)
  }
} catch (e) {}
