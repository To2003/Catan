# PROGRESS

Estado del proyecto hito por hito. Cualquier sesión nueva arranca leyendo [SPEC.md](./SPEC.md)
y después este archivo.

## Hitos

| Hito | Contenido                                  | Estado        |
| ---- | ------------------------------------------ | ------------- |
| M0   | Monorepo, TS strict, lint, format, Vitest  | ✅ Completado |
| M1   | Generación de tablero y render SVG         | ✅ Completado |
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

## M1 — Tablero: geometría, generación y render ✅

**Qué quedó hecho**

- **Geometría** (`board/geometry.ts`): topología radio 2 _pointy-top_ en espacio unitario. 19 hexes en filas 3-4-5-4-3, cuyas esquinas deduplican a 54 vértices y 72 aristas.
- **Layout** (`board/layout.ts`): recorrido horario de las 30 aristas de costa y las 9 posiciones de puerto, calculadas y no hardcodeadas.
- **Generación** (`board/generate.ts`): `generateBoard(seed)` con terrenos, las 18 fichas numéricas con retry por rojas adyacentes, tipos de puerto y el ladrón en el desierto.
- **Render SVG**: tablero, fichas (6 y 8 en rojo, con puntos de probabilidad), puertos con muelle y badge, ladrón, y overlay de IDs para debug.
- 70 tests en verde, incluido el snapshot de tablero de la semilla `20260918`.

**Qué NO está hecho a propósito:** no hay interacción. No se puede clickear nada, no hay jugadores ni `GameState`. Eso es M2.

### Decisiones técnicas de M1

1. **Espacio unitario, no píxeles.** La geometría usa circunradio 1 y el `viewBox` del SVG hace toda la escala. El motor nunca sabe cuán grande se dibuja el tablero.
2. **Dedupe por cuantización a 1e-4**, no por igualdad de floats. El margen es de 5000x: en espacio unitario dos vértices distintos nunca están a menos de 0.5. Hay un test que mide ese margen, así que si alguien toca la geometría y lo achica, salta.
3. **IDs deterministas**: hexes por fila, vértices de arriba a abajo y después de izquierda a derecha, aristas por par de vértices. El snapshot depende de este orden.
4. **Los puertos se calculan.** El recorrido arranca en la arista de costa con el punto medio más alto y, si empata, el más a la izquierda (SPEC §12.10). Se definió por punto medio porque un hex pointy-top no tiene arista superior: tiene un vértice arriba. `PORT_START_OFFSET` queda en 0, verificado en pantalla: los 9 puertos quedan bien repartidos y no hizo falta rotarlos.
5. **El orden de consumo del RNG es contrato** (SPEC §12.11): terrenos, después números con sus reintentos, después tipos de puerto. El snapshot lo blinda.
6. **En el retry se remezclan solo los números**, los terrenos quedan fijos. Tope de 1000 intentos que tira error en vez de colgarse; verificado sobre 500 semillas.
7. **La geometría se memoiza.** Es una constante pura: la misma computación siempre, sin dependencia del estado ni del RNG.
8. **El tablero es inmutable.** `generateBoard` devuelve la posición inicial del ladrón por separado, porque el ladrón vive en `GameState.robberHex` (SPEC §5.2).
9. **`?ids=1` además de la tecla D.** El overlay de debug se puede activar por URL, así el link se comparte y además se puede verificar en un browser headless.

### Cambios al SPEC en M1

- **§5.1**: `BoardGraph` suma `ports`, `hexIds`, `vertexIds` y `edgeIds`, más el tipo `Port`. El puerto se guarda de los dos lados: en sus 2 vértices (lo que leen las reglas) y en el array `ports` con la arista (lo que necesita el render).
- **§12.10**: layout de los puertos y recorrido del perímetro.
- **§12.11**: orden de consumo del RNG en la generación.

### Infra

- **CI** (`.github/workflows/ci.yml`): typecheck, lint, format:check y test en cada push y PR.

---

## M2 — Motor: setup, dados, producción y construcción 🚧

_En curso. Esta sección se completa al cerrar el hito._

### Deuda técnica anotada

- **M5 — sacar `NOT_IMPLEMENTED`.** Mientras el union `Action` esté completo pero falten
  hitos, `validate.ts` rechaza con `NOT_IMPLEMENTED` las acciones cuyo handler todavía no
  existe. Al cerrar M5 hay que agregar un test que verifique que **ninguna** acción devuelve
  ese código, y recién después eliminarlo de `ErrorCode`. Si el código sobrevive al hito, es
  que quedó un handler sin escribir.

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
