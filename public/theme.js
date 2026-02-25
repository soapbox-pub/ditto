// Reads the saved theme from localStorage and applies it to <html> and the
// preloader background before first paint. Runs as a blocking <script> so
// there's no flash of the wrong theme.
(function () {
  var themes = {
    dark:  { bg: 'hsl(228 20% 10%)', primary: 'hsl(258 70% 60%)' },
    light: { bg: 'hsl(0 0% 100%)',   primary: 'hsl(258 70% 55%)' },
    black: { bg: 'hsl(0 0% 0%)',     primary: 'hsl(258 70% 60%)' },
    pink:  { bg: 'hsl(330 100% 96%)', primary: 'hsl(330 90% 60%)' }
  };
  var theme = 'dark';
  try {
    var cfg = JSON.parse(localStorage.getItem('nostr:app-config') || '{}');
    if (cfg.theme && (themes[cfg.theme] || cfg.theme === 'system')) theme = cfg.theme;
  } catch (e) {}
  // Resolve "system" to light or dark based on OS preference
  if (theme === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  var t = themes[theme] || themes.dark;
  document.documentElement.className = theme;
  document.body.style.background = t.bg;
  var p = document.getElementById('preloader');
  if (p) {
    p.style.background = t.bg;
    var logo = p.querySelector('[data-logo]');
    if (logo) logo.style.background = t.primary;
    var spinner = p.querySelector('[data-spinner]');
    if (spinner) {
      spinner.style.borderColor = t.primary.replace(')', ' / 0.25)');
      spinner.style.borderTopColor = t.primary;
    }
  }
})();
