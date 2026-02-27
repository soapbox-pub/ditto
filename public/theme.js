// Reads the saved theme from localStorage and applies it to <html> and the
// preloader background before first paint. Runs as a blocking <script> so
// there's no flash of the wrong theme.
(function () {
  // Builtin themes — must match builtinThemes in src/themes.ts
  var builtins = {
    dark:  { bg: 'hsl(228 20% 10%)', primary: 'hsl(258 70% 60%)' },
    light: { bg: 'hsl(270 50% 97%)', primary: 'hsl(270 65% 55%)' }
  };

  var theme = 'dark';
  var colors = builtins.dark;
  var cfg;
  try {
    cfg = JSON.parse(localStorage.getItem('nostr:app-config') || '{}');
    if (cfg.theme) theme = cfg.theme;
  } catch (e) {}

  // Resolve "system" to light or dark based on OS preference
  if (theme === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  if (theme === 'custom') {
    // Custom theme: read colors from customTheme.colors (ThemeConfig format)
    try {
      var ct = cfg && cfg.customTheme;
      if (ct && ct.colors) {
        var bg = ct.colors.background;
        var pr = ct.colors.primary;
        if (bg && pr) {
          colors = { bg: 'hsl(' + bg + ')', primary: 'hsl(' + pr + ')' };
        }
      }
    } catch (e) {}
  } else if (theme === 'light' || theme === 'dark') {
    // Check for configured theme overrides (ThemesConfig in cfg.themes)
    try {
      var themes = cfg && cfg.themes;
      if (themes && themes[theme] && themes[theme].colors) {
        var tc = themes[theme].colors;
        if (tc.background && tc.primary) {
          colors = { bg: 'hsl(' + tc.background + ')', primary: 'hsl(' + tc.primary + ')' };
        } else {
          colors = builtins[theme];
        }
      } else {
        colors = builtins[theme];
      }
    } catch (e) {
      colors = builtins[theme];
    }
  } else {
    colors = builtins.dark;
  }

  document.documentElement.className = theme;
  document.body.style.background = colors.bg;
  var p = document.getElementById('preloader');
  if (p) {
    p.style.background = colors.bg;
    var logo = p.querySelector('[data-logo]');
    if (logo) logo.style.background = colors.primary;
    var spinner = p.querySelector('[data-spinner]');
    if (spinner) {
      spinner.style.borderColor = colors.primary.replace(')', ' / 0.25)');
      spinner.style.borderTopColor = colors.primary;
    }
  }
})();
