# GAS TypeScript Workspace

## Directory layout

- `src/`: TypeScript source
- `dist/`: build output for clasp push target
- `appsscript.json`: GAS manifest
- `.clasp.json`: clasp project settings

## Quick start

```bash
cd gas
npm install
npm run build
```

## Deploy flow

```bash
cd gas
npm run build
npm run push
```

時間トリガー（`installAutomationTriggers` 等）は **`clasp push` では付きません。** 手順は [docs/operations/gas-triggers-and-clasp.md](../docs/operations/gas-triggers-and-clasp.md) を参照してください。
