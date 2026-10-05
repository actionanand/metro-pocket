# Web deployment

Push `main-github` to run `.github/workflows/gh-pages.yml`. It builds with `npm run build:gh`, using `/metro-pocket/` as base href, copies `www/index.html` to `www/404.html` for SPA deep links, and publishes `www` to `gh-pages`. Production registers Angular's service worker for the app shell; downloaded data packs remain in IndexedDB and are never cached by Angular's service worker. The expected public URL is `https://actionanand.github.io/metro-pocket/`.

Run `npm run build:gh` locally to inspect the production Pages build.
