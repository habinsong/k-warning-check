try {
  const theme = localStorage.getItem('kwc-theme') || 'system'
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
} catch {
  // Ignore theme bootstrap failures in restricted contexts.
}
