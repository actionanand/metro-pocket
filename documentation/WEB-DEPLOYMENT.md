# Web deployment

Push `main-github` to run `.github/workflows/gh-pages.yml`. It builds with `npm run build:gh`, using `/metro-pocket/` as base href, copies `www/index.html` to `www/404.html` for SPA deep links, and publishes `www` to `gh-pages`. The expected public URL is `https://actionanand.github.io/metro-pocket/`.

Run `npm run build:gh` locally to inspect the production Pages build.
