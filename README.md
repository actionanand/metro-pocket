# MetroPocket

MetroPocket is a privacy-friendly, offline-first Web and Android utility for metro routes, TV/DTH/cable channel-number lookup, and private user-managed train schedules.

The app contains no production stations, routes, travel times or channel numbers. It is ready to consume public, downloadable, versioned data packs from the future `actionanand/metropocket-data` release repository. Until packs are published, the app opens with clear empty states instead of fabricated data.

Production web builds register an offline app-shell service worker. Data packs are stored separately in IndexedDB, not in the service-worker cache.

Trains use a separate local writable SQLite database. Web/PWA users can import one
train per CSV, download the template, and read the offline `/train-guide` page.
Android users restore schedules from Settings; its Home Trains card appears only
when saved trains exist. All platforms can search/view/delete trains and export or
restore the complete raw SQLite `.db` backup, without passwords or encryption.
Restore replaces the Train database after preview and confirmation. No train API
or real railway timetable is bundled.

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
- [User train schedules and backups](documentation/TRAIN-SCHEDULES.md)
- [Offline storage](documentation/OFFLINE-STORAGE.md)
- [Android build and signing](documentation/ANDROID.md)
- [GitHub Pages deployment](documentation/WEB-DEPLOYMENT.md)
- [Privacy](documentation/PRIVACY.md)
- [Development](documentation/DEVELOPMENT.md)

The GitHub Pages target is `https://actionanand.github.io/metro-pocket/`.
