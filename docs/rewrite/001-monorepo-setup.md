# Monorepo Setup

## Workspaces
- `pnpm-workspace.yaml` con `apps/*` y `packages/*`.
- `turbo.json` para build/dev/test.

## Paquetes
- `apps/desktop` Electron + React/Vite.
- `apps/api` FastAPI (Vercel).
- `apps/android` reservado (fase posterior).
- `packages/shared`, `packages/ui`, `packages/api-client`.

## Scripts raiz
- `pnpm dev:desktop`
- `pnpm dev:api`
