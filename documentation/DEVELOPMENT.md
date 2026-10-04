# Development

Use Node 24.16 or another version permitted by `package.json`.

```bash
npm install
npm run develop
npm run lint
npm run typecheck
npm run test:ci
npm run build
npm run build:gh
```

Production data belongs in the separate release repository. Tests use small fixtures only and those records are never shown in production UI.
