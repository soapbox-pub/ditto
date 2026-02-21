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
    if (cfg.theme && themes[cfg.theme]) theme = cfg.theme;
  } catch (e) {}
  var t = themes[theme];
  document.documentElement.className = theme;
  document.body.style.background = t.bg;
  var p = document.getElementById('preloader');
  if (p) {
    p.style.background = t.bg;
    var spinner = p.querySelector('[data-spinner]');
    if (spinner) {
      spinner.style.borderColor = t.primary.replace(')', ' / 0.25)');
      spinner.style.borderTopColor = t.primary;
    }
  }
})();
