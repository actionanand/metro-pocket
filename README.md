# MetroPocket

MetroPocket is a privacy-friendly, offline-first Web and Android utility for metro route information and TV/DTH/cable channel-number lookup.

The app contains no production stations, routes, travel times or channel numbers. It is ready to consume public, downloadable, versioned data packs from the future `actionanand/metropocket-data` release repository. Until packs are published, the app opens with clear empty states instead of fabricated data.

## Start locally

```bash
npm install
npm run develop
```

Useful checks:

```bash
npm run lint
npm run typecheck
npm run test:ci
npm run test:android-scripts
npm run build
npm run build:gh
```

## Documentation

- [Architecture](documentation/ARCHITECTURE.md)
- [Data pack contract](documentation/DATA-PACKS.md)
- [Metro routing](documentation/METRO-ROUTING.md)
- [TV channel model](documentation/TV-CHANNELS.md)
- [Offline storage](documentation/OFFLINE-STORAGE.md)
- [Android build and signing](documentation/ANDROID.md)
- [GitHub Pages deployment](documentation/WEB-DEPLOYMENT.md)
- [Privacy](documentation/PRIVACY.md)
- [Development](documentation/DEVELOPMENT.md)

The GitHub Pages target is `https://actionanand.github.io/metro-pocket/`.
