# PROGRESS

Estado del proyecto hito por hito. Cualquier sesión nueva arranca leyendo [SPEC.md](./SPEC.md)
y después este archivo.

## Hitos

| Hito | Contenido                                  | Estado        |
| ---- | ------------------------------------------ | ------------- |
| M0   | Monorepo, TS strict, lint, format, Vitest  | ✅ Completado |
| M1   | Generación de tablero y render SVG         | ✅ Completado |
| M2   | Motor: setup, dados, producción, construir | ✅ Completado |
| M3   | 7, descarte, ladrón y robo                 | ✅ Completado |
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

## M2 — Motor: setup, dados, producción y construcción ✅

**Qué quedó hecho**

- **Estado y acciones** (`types.ts`): `GameState`, `Player`, `Phase`, `Building`, `TradeOffer` y el
  union `Action` **completo** del SPEC §5.3, aunque M2 implemente solo una parte.
- **`createGame(seed, players)`**: tablero, orden de turnos sorteado y mazo de desarrollo
  barajado, en ese orden de consumo del RNG.
- **`applyAction(state, playerId, action)`**: valida una sola vez y después ejecuta. Nunca muta
  el estado recibido y devuelve `DeepReadonly<GameState>` más la lista de eventos tipados.
- **Setup en serpiente**: ronda 1 hacia adelante, ronda 2 hacia atrás, doble colocación en el
  giro, y el camino saliendo del asentamiento recién puesto. El segundo asentamiento cobra.
- **Dados y producción**: 2d6 del PRNG, producción por número con escasez del banco resuelta
  recurso por recurso.
- **Construcción**: camino, asentamiento y ciudad, con costos que **vuelven al banco** y el
  asentamiento devuelto al stock al mejorar.
- **Fin de turno y PV**: `endTurn` limpia los flags del turno y pasa el mando; `victoryPoints`
  cuenta asentamientos y ciudades, con el chequeo de victoria en los dos momentos del §12.4.
- **Hot-seat de debug** en la web, detrás de `?debug=1`.
- 160 tests en verde, incluido el fuzz de partidas al azar y el snapshot de tablero de M1 intacto.

**Qué NO está hecho a propósito:** ladrón, descarte, cartas de desarrollo, comercio, camino más
largo, gran ejército, `view.ts` y el server. El **7 es un placeholder**: no produce, no descarta,
no mueve nada y pasa a `main`, marcado `TODO(M3)` en `rules/dice.ts`.

### Decisiones técnicas de M2

1. **El log no vive en el estado** (cambio al SPEC §5.2). `applyAction` devuelve sus eventos y el
   consumidor los acumula. Son dos razones: el estado ya se reconstruye con `seed` + acciones, y
   como el reducer clona en cada acción, un log creciente volvería cuadrático cualquier recorrido
   largo. En M6 el server filtra los eventos privados por jugador al emitirlos.
2. **El reducer clona y muta el clon.** `structuredClone` de todo menos el tablero, que se pasa por
   referencia porque es inmutable toda la partida. Lo que garantiza la pureza no es la convención:
   los tests **congelan en profundidad** el estado de entrada, así que cualquier mutación tira
   `TypeError` en vez de pasar desapercibida.
3. **Hacia afuera el estado es `DeepReadonly<GameState>`**; adentro del reducer es mutable. Un solo
   cast, en `cloneState`.
4. **`legal.ts` no tiene reglas.** Enumera candidatos y los filtra con `validateAction`. El test de
   propiedad recorre el tablero entero y verifica que estar en la lista de legales y ser aceptado
   por `validate` sean lo mismo; se repite sobre estados reales de mitad de partida en el fuzz. Es
   tautológico por construcción, y eso es justamente lo que blinda.
5. **El puesto en la serpiente se deriva** de la fase y el orden de turnos. No hay un contador
   aparte que se pueda desincronizar.
6. **Una sola ruta de producción.** Los dados y el segundo asentamiento del setup pasan por el
   mismo `claims → resolver contra el banco`, escasez incluida.
7. **Los costos vuelven al banco.** El SPEC no lo dice explícitamente, pero es lo único consistente
   con las 19 cartas por recurso, y es lo que hace verdadero el invariante de conservación.
8. **El invariante de caminos es local**: cada camino comparte vértice con otro camino propio o con
   un edificio propio. **No** es alcanzabilidad desde un edificio: un rival puede colocar
   legalmente un asentamiento en medio de un camino largo y dejar parte de la red conectada solo a
   través de un vértice bloqueado. Eso es una posición válida. "No pasar por un edificio ajeno" es
   una regla de **construcción**, que se chequea al construir. Hay un test unitario con ese
   escenario exacto (`build.test.ts`).
9. **El mazo de desarrollo se baraja en `createGame`** aunque nadie robe hasta M5: meterlo después
   habría corrido todas las tiradas de todas las semillas.
10. **El hot-seat consume el engine, no reimplementa nada.** La web importa `applyAction` y `legal*`
    y los usa directo, sin server. La regla "nada de reglas en la web" sigue intacta: la pantalla
    pregunta qué es legal y manda acciones, no decide.

### Fuzz test

`test/fuzz.test.ts` juega partidas eligiendo al azar entre las acciones legales, con un RNG
**separado** del de la partida. Después de **cada** acción verifica:

1. Conservación: banco + manos = 19 por recurso.
2. Piezas: stock + piezas en el tablero = totales iniciales, por jugador.
3. Nada negativo, ni en el banco ni en las manos.
4. Regla de distancia en todo el tablero.
5. Todo camino conectado a la red propia (local, ver decisión 8).
6. PV consistentes con lo construido.

Además: **replay** exacto desde `seed` + lista de acciones, y el test de propiedad
`legal ⟺ validate` remuestreado sobre estados reales.

Sin comercio ni ladrón las partidas **se traban**: se corta a las 400 acciones y no se trata como
error. Lo que sí es error es quedarse sin ninguna acción legal, que sería un deadlock del motor.

`FUZZ_GAMES` ajusta cuántas partidas se juegan (25 por defecto, ~1 s; en local conviene subirlo):

```bash
FUZZ_GAMES=500 pnpm --filter @tierra-austral/engine test fuzz
```

### Hot-seat de debug

```bash
pnpm dev   # y abrir http://localhost:5173/?debug=1
```

Opcional: `&seed=20260918` para repetir un tablero, `&ids=1` (o la tecla del botón "IDs") para el
overlay de vértices y aristas. Tiene la mano del jugador activo, el banco, los PV, las jugadas
legales resaltadas y clickeables, y el log de eventos crudo. El "jugador actual" **sigue
automáticamente** al que tiene el turno; un selector manual recién suma en M3, con el descarte
simultáneo.

### Cambios al SPEC en M2

- **§5.2**: se elimina el campo `log` de `GameState`, con el porqué.
- **§6**: el bullet de `view.ts` ahora habla de eventos emitidos, no del log del estado.
- **§12.11**: pasa a cubrir el orden de consumo del RNG **completo** (tablero → orden de turnos →
  mazo → dados), no solo la generación del tablero. El robo del ladrón queda reservado como paso 8
  para M3.

### Deuda técnica anotada

- **M5 — sacar `NOT_IMPLEMENTED`.** Mientras el union `Action` esté completo pero falten
  hitos, `validate.ts` rechaza con `NOT_IMPLEMENTED` las acciones cuyo handler todavía no
  existe. Al cerrar M5 hay que agregar un test que verifique que **ninguna** acción devuelve
  ese código, y recién después eliminarlo de `ErrorCode`. Si el código sobrevive al hito, es
  que quedó un handler sin escribir.
- ~~**M3 — el 7.**~~ Resuelto en M3: `rules/dice.ts` ya encadena
  `discard → moveRobber → steal`.

---

## M3 — El 7: descarte, ladrón y robo ✅

**Qué quedó hecho**

- **Descarte simultáneo**: al salir un 7, todos los que tienen más de 7 cartas deben `floor(n/2)`,
  en un solo `discard` cada uno, sin importar de quién sea el turno. Las cartas vuelven al banco.
  Si nadie pasa el límite, la fase se saltea.
- **Ladrón**: se mueve a cualquier hex que no sea el actual, el desierto incluido. Los candidatos
  al robo se calculan al moverlo.
- **Robo**: siempre acción explícita, incluso con un solo candidato. Pasa de mano a mano; el banco
  no se toca.
- **Eventos privados**: `visibleTo` como campo, con `isVisibleTo` como único filtro.
- **Hot-seat**: modal de descarte, hexes del ladrón resaltados y selector de víctima.
- 184 tests en verde.

**Qué NO está hecho a propósito:** el caballero es de M5. `moveRobber` y `steal` ya soportan
`returnTo: 'preRoll'` y hay tests que lo cubren armando el estado a mano, así que cuando llegue la
carta no hay que tocar las reglas: solo el handler que entra a la fase.

### Decisiones técnicas de M3

1. **El gate de turno se partió en dos.** Hasta M2 `validate` cortaba con un único
   `currentPlayer !== playerId`. Ahora quién puede actuar depende de la acción: `discard` es de
   cualquiera que deba cartas, el resto sigue siendo del jugador activo. El descarte es la única
   fase simultánea del juego.
2. **El chequeo de victoria se acotó al jugador activo.** Con jugadores no activos actuando, correr
   `checkVictory` sobre el que acaba de descartar sería tratarlo como si fuera su turno (§12.4).
3. **`visibleTo` es un campo, no un tipo de evento.** En M6 el server filtra por ese campo sin
   conocer los tipos. El patrón es un evento público con el hecho + uno privado con el detalle
   (`StealResolved`/`ResourceStolen`, `CardsDiscarded`/`DiscardDetail`), así filtrar es **descartar
   un evento entero**, no reescribir un payload.
4. **La fase `discard` lleva `source` y `returnTo` explícitos** (cambio al SPEC §5.2). Hoy solo un 7
   llega al descarte, pero deducirlo de vuelta es justo la inferencia implícita que el caballero
   rompería en M5. Hay un test que fija `source: 'seven'`, `returnTo: 'main'`.
5. **El robo es explícito siempre.** Con un solo candidato el motor igual espera la acción; la UI
   preselecciona. Que el motor resuelva solo sería un estado que el log no explica.
6. **Robo determinista** (§12.11, paso 8): la mano de la víctima se expande en el orden
   `wood, brick, sheep, wheat, ore`, una entrada por carta, y **una** extracción elige el índice.
7. **Toda cantidad que llega en una acción se valida como entero no negativo.** `NaN`, decimales y
   negativos se rechazan con `INVALID_AMOUNT`. En M6 las acciones llegan por red, donde los tipos de
   TypeScript no existen: `validate` es la última línea de defensa. Hay tests con `1.5`, `-1`, `NaN`
   e `Infinity`.
8. **`discard` no se enumera en `legal.ts`.** Es una combinación de cartas, no una posición: el
   espacio es combinatorio. Para el descarte alcanza `validate`, y el modal valida contra él
   mientras el jugador arma la selección. Es la única excepción a "legal enumera todo" y está
   escrita como tal en el docstring.

### Fuzz

Tres cambios sobre el de M2:

- **Multi-jugador**: el fuzzer arma las jugadas de **todos** los que pueden actuar, no solo del
  activo. El deadlock pasa a ser "ningún jugador tiene ninguna jugada legal".
- **Descartes generados**: con el RNG del test se baraja la mano y se toman las primeras
  `floor(n/2)`. Legal por construcción y distinto en cada corrida.
- **Invariantes 7 a 9**: el ladrón siempre en un hex real; un descarte saca exactamente lo debido y
  lo manda al banco; un robo mueve una carta entre dos manos sin tocar el banco.

**Medición.** Con el tope por defecto de 400 acciones, 100 de 100 partidas siguen trabándose (media:
máximo 3,6 PV, 8,5 edificios). Subiendo `FUZZ_MAX_ACTIONS=3000`, **la mitad de las partidas termina
con un ganador** — en M2 no terminaba ninguna. El ladrón redistribuye pero no desatasca por sí solo;
el desatascador de verdad es el comercio (M4).

```bash
FUZZ_GAMES=50 FUZZ_MAX_ACTIONS=3000 pnpm --filter @tierra-austral/engine test fuzz
```

### Cambios al SPEC en M3

- **§5.2**: la fase `discard` suma `source` y `returnTo`.
- **§6**: `legal.ts` suma `legalStealTargets` y se aclara que el descarte no se enumera; se agrega
  la regla de validación de cantidades (`INVALID_AMOUNT`).
- **§12.7**: robo siempre explícito, candidatos congelados al mover el ladrón, el descarte como
  única fase simultánea, y adónde van las cartas (descarte al banco, robo de mano a mano).
- **§12.11**: el paso 8 queda escrito con el algoritmo exacto de expansión de la mano.

### Deuda técnica anotada

- **M5 — sacar `NOT_IMPLEMENTED`** (sigue vigente, ver abajo).

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
