// Apply the theme before first paint so there's no flash.
try {
  var s = JSON.parse(localStorage.getItem('cairn.settings.v1') || '{}')
  var t = s.theme || 'system'
  if (t === 'system') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  var r = document.documentElement
  r.dataset.theme = t
  r.dataset.palette = s.palette || 'default'
  if (s.accent) {
    r.dataset.accent = ''
    r.style.setProperty('--accent', s.accent)
  }
} catch (e) {}
