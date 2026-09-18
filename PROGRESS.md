# PROGRESS

Estado del proyecto hito por hito. Cualquier sesión nueva arranca leyendo [SPEC.md](./SPEC.md)
y después este archivo.

## Hitos

| Hito | Contenido                                  | Estado        |
| ---- | ------------------------------------------ | ------------- |
| M0   | Monorepo, TS strict, lint, format, Vitest  | ✅ Completado |
| M1   | Generación de tablero y render SVG         | ⬜ Pendiente  |
| M2   | Motor: setup, dados, producción, construir | ⬜ Pendiente  |
| M3   | 7, descarte, ladrón y robo                 | ⬜ Pendiente  |
| M4   | Comercio con banco y puertos               | ⬜ Pendiente  |
| M5   | Cartas de desarrollo, bonos y victoria     | ⬜ Pendiente  |
| M6   | Server, salas, lobby y sincronización      | ⬜ Pendiente  |
| M7   | Comercio entre jugadores con contraofertas | ⬜ Pendiente  |
| M8   | Reconexión, SQLite, chat, pulido y deploy  | ⬜ Pendiente  |

---

## M0 — Monorepo y andamiaje ✅

**Qué quedó hecho**

- Workspace pnpm con `packages/engine`, `apps/server` y `apps/web`.
- TypeScript strict con project references; `pnpm typecheck` corre sobre todo el monorepo.
- ESLint 9 (flat config) con `typescript-eslint` type-checked, Prettier y Vitest.
- `packages/engine`: tipos base, constantes de reglas y el PRNG con semilla, con 23 tests.
- `apps/server`: Express + Socket.IO arriba, con `/health`. Sin handlers de juego.
- `apps/web`: Vite + React 19 + Tailwind v4, pantalla mínima que muestra el estado del socket.
- `pnpm dev` levanta web (5173) y server (3001) en paralelo.

**Qué NO está hecho a propósito:** nada de reglas. No hay `reducer.ts`, `validate.ts`,
`legal.ts`, `view.ts`, geometría ni generación de tablero. Eso arranca en M1/M2.

### Decisiones técnicas de M0

1. **`noUncheckedIndexedAccess`** además de `strict`. Con el modelo de datos del spec
   (`Record<VertexId, ...>`, `Record<EdgeId, ...>`) es lo que evita comerse un `undefined`
   en la lógica de adyacencias. También `exactOptionalPropertyTypes` y `erasableSyntaxOnly`.
2. **La pureza del engine la hace cumplir el linter, no la convención.** En
   `packages/engine/src/**` están prohibidos por regla `Math.random`, `Date`, `Date.now`,
   `performance`, `crypto`, `process`, `fetch`, `console` y los imports de módulos de Node.
   Verificado con un archivo sonda: dispara los 6 errores esperados.
3. **El engine se consume por source** (`exports` → `./src/index.ts`, `composite: true`,
   project references). No hay paso de build en dev y el typecheck es uno solo.
4. **Tailwind v4** vía `@tailwindcss/vite`, sin `tailwind.config.js` ni PostCSS. Los colores
   de jugador (`celeste`, `bordo`, `verde`, `amarillo`) van como tokens en `@theme`.
5. **`tsx watch`** para el server en dev.
6. Los archivos de config (`*.config.ts`) se lintean sin type-checking: no pertenecen al
   tsconfig de ningún paquete.
7. `pnpm.onlyBuiltDependencies: ["esbuild"]` — pnpm 10 bloquea los postinstall por defecto y
   Vite/tsx necesitan el binario de esbuild.

### Decisiones de entorno

- **Node 24** (`.nvmrc` con `24`, `engines: node >=22`).
- **Persistencia (M8):** evaluar `node:sqlite`, que viene integrado en Node, antes que
  `better-sqlite3`, para evitar la compilación nativa.

### Deuda técnica anotada

- **M8 — build del server para producción.** Como el server importa el engine por source,
  `node dist/index.js` no alcanza: hay que bundlear (tsup/esbuild) o correrlo con `tsx`.
  Decidir al momento del deploy.

---

## Aclaraciones de reglas resueltas

Las respuestas a las ambigüedades del spec están incorporadas a
[SPEC.md §12](./SPEC.md#12-aclaraciones-de-reglas), que es la fuente de verdad. Resumen:

| #    | Tema                    | Resolución                                                               |
| ---- | ----------------------- | ------------------------------------------------------------------------ |
| 12.1 | Escasez del banco       | Recurso por recurso: uno solo afectado cobra el resto; dos o más, nadie  |
| 12.2 | Camino más largo        | Umbral de 5 duro; empate en el máximo → vacante                          |
| 12.3 | Vuelta del ladrón       | `returnTo: 'preRoll' \| 'main'` en `moveRobber` y `steal`                |
| 12.4 | Victoria                | Se chequea tras cada acción propia y al inicio del turno                 |
| 12.5 | Oferta válida           | `give` y `want` disjuntos, ambos con al menos 1 carta                    |
| 12.6 | Contraofertas           | Un nivel, no cuentan al límite de 3, 1 viva por jugador por oferta       |
| 12.7 | Robo                    | Obligatorio si hay al menos 1 candidato                                  |
| 12.8 | Construcción de caminos | Colocás los que podés y la carta se consume; sin jugada legal se rechaza |
| 12.9 | Tablero                 | Ladrón en el desierto; terrenos y números al azar; puertos fijos         |

## Preguntas abiertas

Ninguna por ahora.
