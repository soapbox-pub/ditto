// Reads the saved theme from localStorage and applies it to <html> and the
// preloader background before first paint. Runs as a blocking <script> so
// there's no flash of the wrong theme.
(function () {
  // Builtin themes — only light and dark have hardcoded preview colors here.
  // Custom themes read their background/primary from the stored customTheme object.
  var builtins = {
    dark:  { bg: 'hsl(228 20% 10%)', primary: 'hsl(258 70% 60%)' },
    light: { bg: 'hsl(0 0% 100%)',   primary: 'hsl(258 70% 55%)' }
  };
  // Legacy preset mapping for backward compat (old configs with "black" or "pink")
  var legacyPresets = {
    black: { bg: 'hsl(0 0% 0%)',       primary: 'hsl(258 70% 60%)' },
    pink:  { bg: 'hsl(330 100% 96%)', primary: 'hsl(330 90% 60%)' }
  };

  var theme = 'dark';
  var colors = builtins.dark;
  try {
    var cfg = JSON.parse(localStorage.getItem('nostr:app-config') || '{}');
    if (cfg.theme) theme = cfg.theme;
  } catch (e) {}

  // Resolve "system" to light or dark based on OS preference
  if (theme === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    colors = builtins[theme];
  } else if (theme === 'custom') {
    // Read background and primary from stored customTheme tokens
    try {
      var ct = cfg.customTheme;
      if (ct && ct.background && ct.primary) {
        colors = { bg: 'hsl(' + ct.background + ')', primary: 'hsl(' + ct.primary + ')' };
      }
    } catch (e) {}
  } else if (legacyPresets[theme]) {
    // Backward compat: old "black"/"pink" values → use their colors
    colors = legacyPresets[theme];
  } else {
    colors = builtins[theme] || builtins.dark;
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
