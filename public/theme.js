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
  var bgColor;
  var primaryColor;
  var isDark = true;
  try {
    var cfg = JSON.parse(localStorage.getItem('nostr:app-config') || '{}');
    if (cfg.theme && (themes[cfg.theme] || cfg.theme === 'custom')) {
      theme = cfg.theme;
    }
    if (theme === 'custom' && cfg.customTheme && cfg.customTheme.background) {
      bgColor = 'hsl(' + cfg.customTheme.background + ')';
      primaryColor = cfg.customTheme.primary
        ? 'hsl(' + cfg.customTheme.primary + ')'
        : themes.dark.primary;
      // Rough luminance check: parse lightness from HSL "H S% L%"
      var parts = cfg.customTheme.background.replace(/%/g, '').split(/\s+/);
      var lightness = parseFloat(parts[2]) || 0;
      isDark = lightness < 45;
    } else {
      var t = themes[theme] || themes.dark;
      bgColor = t.bg;
      primaryColor = t.primary;
      isDark = theme === 'dark' || theme === 'black';
    }
  } catch (e) {
    bgColor = themes.dark.bg;
    primaryColor = themes.dark.primary;
  }
  document.documentElement.className = isDark ? 'dark' : 'light';
  document.body.style.background = bgColor;
  var p = document.getElementById('preloader');
  if (p) {
    p.style.background = bgColor;
    var logo = p.querySelector('[data-logo]');
    if (logo) logo.style.background = primaryColor;
    var spinner = p.querySelector('[data-spinner]');
    if (spinner) {
      spinner.style.borderColor = primaryColor.replace(')', ' / 0.25)');
      spinner.style.borderTopColor = primaryColor;
    }
  }
})();
