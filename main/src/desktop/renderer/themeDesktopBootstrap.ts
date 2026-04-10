try {
  let theme = localStorage.getItem('kwc.theme') || 'system'
  if (theme === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  document.documentElement.dataset.theme = theme
} catch {
  // Ignore theme bootstrap failures in restricted contexts.
}
