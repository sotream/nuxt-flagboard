// Sets the theme class on <html> before the first paint. Kept tiny and dependency-free; the same rules live in
// app/utils/theme.ts, which the theme toggle uses afterwards.
(function () {
  var stored = null;
  try {
    stored = localStorage.getItem('flagboard-theme');
  } catch {
    // storage can be blocked (private windows, cleared site data): fall back to the system setting
  }
  var dark =
    stored === 'dark' || (stored !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
})();
