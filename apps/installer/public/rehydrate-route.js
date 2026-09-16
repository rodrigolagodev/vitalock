// Decoder half of the GitHub Pages SPA redirect trick — reverses what
// .github/pages/404.html encodes. Must run before main.tsx's BrowserRouter
// mounts, so it's a plain (non-module) script in index.html's <head>: those
// execute in document order, ahead of the deferred `type="module"` entry
// script. Restores the real deep-linked path via history.replaceState so
// react-router sees the intended route on first render instead of the
// bare app root. (github.com/rafgraham/spa-github-pages)
(function (l) {
  if (l.search[1] !== '/') return;
  var decoded = l.search
    .slice(1)
    .split('&')
    .map(function (segment) {
      return segment.replace(/~and~/g, '&');
    })
    .join('?');
  window.history.replaceState(null, '', l.pathname.slice(0, -1) + decoded + l.hash);
})(window.location);
