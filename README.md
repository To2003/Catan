# Tierra Austral

Juego de mesa por turnos para 3 a 4 jugadores, online, en salas privadas con código.
La fuente de verdad del proyecto es [SPEC.md](./SPEC.md); el avance se registra en [PROGRESS.md](./PROGRESS.md).

## Requisitos

- Node >= 22 (ver `.nvmrc`: 24)
- pnpm 10

## Arranque

```bash
pnpm install
pnpm dev          # web en http://localhost:5173, server en http://localhost:3001
```

## Scripts

| Comando           | Qué hace                                         |
| ----------------- | ------------------------------------------------ |
| `pnpm dev`        | Levanta `apps/web` y `apps/server` en paralelo   |
| `pnpm build`      | Build de producción                              |
| `pnpm test`       | Corre los tests de todos los paquetes con Vitest |
| `pnpm test:watch` | Tests en modo watch                              |
| `pnpm typecheck`  | `tsc --build` sobre todo el monorepo             |
| `pnpm lint`       | ESLint                                           |
| `pnpm format`     | Prettier                                         |

## Estructura

```
packages/engine   Motor de reglas: funciones puras, sin I/O y sin Math.random ni Date
apps/server       Node + Socket.IO, autoritativo
apps/web          Vite + React + Tailwind, solo renderiza y manda acciones
```

Toda la lógica de reglas vive en `packages/engine`. El linter lo hace cumplir: el paquete
tiene prohibido `Math.random`, `Date`, `console` y los módulos de Node.
