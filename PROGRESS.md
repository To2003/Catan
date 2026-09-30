# PROGRESS

Estado del proyecto hito por hito. Cualquier sesión nueva arranca leyendo [SPEC.md](./SPEC.md)
y después este archivo.

## Hitos

| Hito | Contenido                                        | Estado        |
| ---- | ------------------------------------------------ | ------------- |
| M0   | Monorepo, TS strict, lint, format, Vitest        | ✅ Completado |
| M1   | Generación de tablero y render SVG               | ✅ Completado |
| M2   | Motor: setup, dados, producción, construir       | ✅ Completado |
| M3   | 7, descarte, ladrón y robo                       | ✅ Completado |
| M4   | Comercio con banco y puertos                     | ✅ Completado |
| M5   | Cartas de desarrollo, bonos y victoria           | ✅ Completado |
| M6   | Server, salas, lobby, sincronización, reconexión | ✅ Completado |
| M7   | Comercio entre jugadores con contraofertas       | ⬜ Pendiente  |
| M8   | SQLite, pulido y deploy                          | ⬜ Pendiente  |

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

- **M7 — sacar `NOT_IMPLEMENTED`** (movido de M5). El union `Action` está completo desde M2,
  así que `validate.ts` rechaza con `NOT_IMPLEMENTED` las acciones cuyo handler todavía no
  existe. En M5 **no se podía borrar**: las cinco acciones de comercio entre jugadores son de
  M7. En su lugar hay un test (`notImplemented.test.ts`) que fija la lista exacta de lo que
  falta y falla en los dos sentidos. Al cerrar M7 esa lista queda vacía y recién ahí se
  elimina el código de `ErrorCode`.
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

## M4 — Comercio con el banco y puertos ✅

**Qué quedó hecho**

- **`maritimeTrade`**: solo el jugador activo, solo en `main`. Una acción entrega **1 unidad** del
  recurso pedido.
- **La tasa la calcula el motor**, nunca el cliente: la mejor disponible para ese recurso (2:1 con
  puerto propio de ese recurso, si no 3:1 con genérico, si no 4:1).
- **`availableMaritimeRates`** y **`legalMaritimeTrades`** en `legal.ts`, ambas en el test de
  propiedad `legal ⟺ validate`.
- Evento público `MaritimeTraded` con lo dado, lo recibido y la tasa usada.
- Panel de comercio en el hot-seat.
- 200 tests en verde.

### Decisiones técnicas de M4

1. **La acción no lleva la tasa.** `maritimeTrade` dice solo `give` y `want`. Un cliente que pudiera
   mandar su propia tasa podría mandar 1:1, y en M6 estas acciones llegan por red. La tasa sale de
   `maritimeRate(state, player, resource)`, que mira los puertos de los edificios del jugador.
2. **El puerto es una propiedad del vértice**, no del edificio. De ahí salen gratis dos reglas que
   igual tienen test: una **ciudad conserva** el puerto del asentamiento que mejoró, y un
   asentamiento colocado **en el setup** ya da acceso.
3. **`legalMaritimeTrades` sí se enumera** (20 pares como máximo), a diferencia del descarte. El
   criterio sigue siendo el mismo: se enumera lo que es finito y chico, y `validate` es siempre el
   que decide.
4. **`canTradeMaritime` vive en `rules/trade.ts`**, no en `validate.ts`, para que la regla de la
   tasa esté enunciada una sola vez y `validate` la consuma.

### Mejoras al fuzz (previas al comercio)

1. **Cuenta las partidas que simuló** y falla si no coincide con `FUZZ_GAMES`. Un run que no juega
   nada — por una variable mal seteada o por un hook que vitest convierte en skip — ahora falla en
   vez de pasar en verde. `FUZZ_GAMES` y `FUZZ_MAX_ACTIONS` además se parsean estrictos: si no son
   enteros positivos, tiran.
2. **Política con pesos** en vez de uniforme: construir y comerciar pesan más, `endTurn` menos.
   Ayuda menos de lo que parece, porque la mayoría de los pasos ofrece una sola jugada legal: sobre
   100 partidas, 15015 tiradas y 14960 fines de turno contra 864 asentamientos.

### Medición del fuzz, hito por hito

Con el tope por defecto de 400 acciones, 100 partidas:

| Hito | Trabadas | Máx. PV (prom.) | Ciudades | Descartes |
| ---- | -------- | --------------- | -------- | --------- |
| M2   | 100/100  | 3,6             | —        | —         |
| M3   | 100/100  | 3,8             | 214      | 3280      |
| M4   | 99/100   | 4,3             | 222      | 702       |

Con `FUZZ_MAX_ACTIONS=3000`, que es donde se ve de verdad: en M3 terminaban **20 de 40** partidas;
con comercio terminan **38 de 40**, con una media de 1233 acciones y 9,9 PV del líder. El comercio
es el desatascador que M3 anticipaba. Los descartes caen a la quinta parte porque los jugadores
gastan en vez de acumular.

```bash
FUZZ_GAMES=40 FUZZ_MAX_ACTIONS=3000 pnpm --filter @tierra-austral/engine test fuzz
```

### Cambios al SPEC en M4

- **§4.9**: la tasa la calcula el motor y no viaja en la acción; 1 unidad por acción; gana la mejor
  tasa; la ciudad conserva el puerto y el asentamiento del setup ya da acceso.

---

## M5 — Cartas de desarrollo, bonos y victoria ✅

**Qué quedó hecho**

- **Las 5 cartas**: caballero, construcción de caminos, año de abundancia, monopolio y PV.
- **Camino más largo** con recálculo tras cada camino y cada asentamiento, y el oráculo de fuerza
  bruta en tests.
- **Gran ejército** con mayoría estricta.
- **Victoria con puntos ocultos**: `publicVictoryPoints` y `victoryPoints`.
- Hot-seat completo: comprar, jugar, modales, modo de colocación e indicadores de bonos.
- 257 tests en verde.

### Decisiones técnicas de M5

1. **El tope del mazo es `devDeck[0]`**, con `shift`. El shuffle de `createGame` produce el mazo
   leído de arriba hacia abajo, así que el índice 0 es la próxima carta y un estado guardado se lee
   en el orden correcto. Con `pop()` el "tope" sería el último elemento. A 25 cartas el costo es
   irrelevante. Está en §12.11.
2. **Comprar no consume RNG.** El mazo se barajó una sola vez, en `createGame`. Consecuencia: las
   compras no corren la secuencia de dados, que es exactamente para lo que M2 adelantó ese shuffle.
3. **Qué se puede jugar es una pregunta de multiconjunto**: copias en mano menos copias compradas
   este turno. Ninguna carta necesita identidad propia.
4. **Dos funciones de puntos.** `publicVictoryPoints` (edificios + bonos) es lo que ve la mesa;
   `victoryPoints` suma las cartas de PV y es con la que se gana. Quien muestra puntos ajenos tiene
   que pedir la pública **a propósito**.
5. **La victoria corta la cadena.** Si un caballero da los 10 PV, el ladrón nunca se mueve; si el
   primer camino de la carta los da, el segundo se pierde. Los dos casos tienen test.
6. **La carta de caminos no se queda esperando.** La fase se cierra sola apenas no hay arista legal
   o no hay stock, y la carta se consume igual; si al jugarla no hay **ninguna** colocación legal,
   se rechaza y la carta queda en la mano (§12.8).
7. **Año de abundancia es todo o nada**, a diferencia de la escasez de producción del §12.1. El
   contraste es deliberado: ahí hay una regla específica de reparto parcial, acá no.
8. **La UI pregunta por qué no se puede.** El panel de cartas llama a `validateAction` y traduce el
   código en vez de reimplementar las condiciones. El botón de comprar usa `isLegalAction`.

### Camino más largo

El recorrido es un _trail_: cada camino se usa una sola vez, los vértices pueden repetirse. Tres
detalles deciden casi todos los casos borde, y los tres tienen fixture:

- **La búsqueda arranca desde todos los vértices** que toca la red, no solo desde las puntas. Un
  anillo no tiene puntas y mediría 0.
- **Un edificio ajeno termina un recorrido sin borrarlo**: el camino que llega a ese vértice cuenta,
  pero el recorrido no sigue a través. Los edificios propios no cortan nada.
- **Dos hexes vecinos comparten una arista**: la figura tiene 6 + 6 − 1 = **11** caminos, con dos
  vértices de grado 3 y el resto de grado 2, así que hay recorrido euleriano y mide 11.

Fixtures: cadena recta, Y (las dos ramas más largas unidas, nunca las tres), anillo de 6, los 11 de
dos hexes vecinos, cadena que termina en asentamiento rival (cuenta entera), asentamiento rival en
el medio (se parte), y los cinco casos de transferencia del §12.2.

**El oráculo** (`test/longestRoadOracle.ts`) es una segunda implementación, a propósito lenta: una
búsqueda exhaustiva sobre estados (posición, caminos ya usados). Es **la única excepción** a "las
reglas se enuncian una sola vez", y se justifica así: es el algoritmo más fácil de equivocar del
juego, y el único test que detecta un error que el autor no pensó es una implementación
independiente. Vive solo en `test/` y nunca se exporta desde `src/`. Verifica la implementación, no
la regla: las dos codifican la misma definición.

### Fuzz

Invariantes nuevos: las 25 cartas siempre están en el mazo, una mano o jugadas (acumuladas **desde
los eventos**, porque el estado no guarda lo que puede derivar); `knightsPlayed` coincide con los
caballeros jugados; nunca más de una carta por turno; los largos coinciden con el oráculo; y el
titular de cada bono está en el umbral y es un máximo.

Sobre los bonos: **ninguno de los dos titulares se puede derivar solo de la posición**, porque un
empate deja el bono donde estaba. Así que se verifica todo lo que la posición sí decide, más algo
exacto: nadie puede tener 3 caballeros sin tener el gran ejército, porque se entrega en el momento
en que se juega el tercero y los contadores nunca bajan.

### Medición del fuzz, hito por hito

Con el tope por defecto (400 acciones, 100 partidas):

| Hito | Trabadas | Máx. PV (prom.) |
| ---- | -------- | --------------- |
| M2   | 100/100  | 3,6             |
| M3   | 100/100  | 3,8             |
| M4   | 99/100   | 4,3             |
| M5   | 100/100  | 6,0             |

Con `FUZZ_MAX_ACTIONS=3000`, que es donde se ve: M3 terminaba **20 de 40**, M4 **38 de 40**, y M5
**40 de 40**, con una media de 781 acciones (1233 en M4). Las cartas aceleran bastante las partidas.

### Cambios al SPEC en M5

- **§12.11**: el tope del mazo es `devDeck[0]` y comprar no consume RNG.

### Deuda técnica anotada

- **M7 — sacar `NOT_IMPLEMENTED`** (ver arriba). En M5 se agregó `notImplemented.test.ts`, que fija
  la lista exacta de lo que falta: las cinco acciones de comercio entre jugadores.

---

## M6 — Server, salas, lobby y sincronización ✅

**Qué quedó hecho**

- **`view.ts`**: `getPlayerView` con todo lo oculto, y `legalMoves` viajando adentro de la vista.
- **Server autoritativo**: salas con código, lobby con colores y "listo", partida, chat mínimo,
  límites y rate limit.
- **Seguridad**: identidad por sesión, validación de forma con zod, token secreto.
- **Reconexión**, migración de host y `forceTurn`.
- **Web en red**: Zustand y las pantallas Home, Lobby, Game y GameOver.
- 282 tests en verde, 17 de ellos sobre sockets reales.

**Nota de hitos:** reconexión y chat estaban anotados en M8 y se adelantaron acá. M8 queda con
SQLite, pulido y deploy.

### Decisiones técnicas de M6

1. **La semilla se oculta junto con el `rngState`.** Con la semilla y la lista de acciones
   públicas se reconstruye el mazo barajado y todas las tiradas futuras; ocultar solo el estado
   del PRNG sería teatro.
2. **La vista se arma campo por campo**, nunca borrando de una copia del estado. Un campo nuevo en
   `GameState` no puede filtrarse por olvido: si no se agrega a la vista, no viaja.
3. **`legalMoves` vive en el engine y la consumen los dos caminos**: el server la mete en la vista
   y el hot-seat la calcula local. El cliente no puede llamar a `validate` porque no tiene el
   estado, y la respuesta no es enseñarle las reglas: es que el motor le mande la lista, con el
   **código** del motivo cuando una carta no se puede jugar. La UI solo traduce.
4. **El chequeo de `expectedVersion` es solo para las acciones secuenciales del activo.** Con dos
   jugadores descartando a la vez, el segundo recibiría `STALE_STATE` por una jugada válida. El
   engine valida contra el estado del momento, así que ahí la versión no aporta nada. En M7 entran
   `respondOffer` y `counterOffer` al mismo conjunto. Hay un test de integración con dos clientes
   descartando sin esperarse.
5. **La identidad sale de la sesión del socket**, nunca del payload, y los esquemas de zod son
   estrictos: una clave de más es un mensaje rechazado, no una clave ignorada.
6. **El server valida forma; el engine valida reglas.** Sobre la red los tipos de TypeScript no
   existen: ahí paran `NaN`, `-1`, `1.5`, un recurso inventado y un id de 1000 caracteres.
7. **Códigos de sala y semillas salen de `node:crypto`.** El PRNG del engine es del juego y es
   determinista a propósito; un código de sala predecible dejaría entrar a cualquiera.
8. **La presencia no es una acción.** Conectarse y desconectarse pasa por un helper puro
   (`setConnected`) y **no** entra en la lista de acciones: no es parte de la historia de la
   partida y un replay no debe reproducirla.
9. **Una cola por sala**, aunque hoy todo sea síncrono, para que en M8 la escritura a SQLite no
   tenga que meterse entre medio de una carrera.
10. **El token se guarda por código de sala** en `localStorage`, y al recargar la app vuelve sola a
    la última sala.

### Qué se verifica con sockets reales

17 tests levantan un server en un puerto efímero y conectan clientes de verdad:

- Setup completo a tres jugadores siguiendo las `legalMoves` que manda el server.
- Dos descartes simultáneos: ninguno recibe `STALE_STATE`.
- Una acción con el `playerId` de otro es un **mensaje rechazado** y el tablero no se mueve.
- 18 payloads malformados seguidos, cada uno rechazado, y después una acción real que sí entra —
  que es la prueba de que el server sigue vivo.
- Ningún token llega a nadie más que a su dueño, revisando **todos** los mensajes que recibió cada
  cliente.
- Ni la semilla, ni el `rngState`, ni el mazo salen jamás.
- No se entra a una partida empezada sin token, ni con uno inventado; el dueño del token sí vuelve.
- Segunda pestaña con el mismo token: gana la última.
- Si el host se va, el rol migra.

### Cambios al SPEC en M6

- **§7.1**: reconexión con token por sala, última conexión gana, `GAME_IN_PROGRESS`, y el reloj de
  los 2 minutos contando desde que el jugador está desconectado **y** bloqueando.
- **§7.2**: `session`, `session:replaced` y `room:forceTurn`; la regla de `expectedVersion`; los
  errores de transporte como union aparte; identidad por sesión y validación de forma.

---

## M7 — Comercio entre jugadores ✅

**Qué quedó hecho**

- Ofertas del jugador activo (máximo 3 propias), respuestas, contraofertas de un nivel,
  confirmación con revalidación y cancelación.
- `respondOffer`, `counterOffer` y `cancelOffer` se suman a las acciones concurrentes.
- Las ofertas viajan en la vista (son públicas) y `legalMoves.offers` dice qué puede hacer cada
  jugador con cada una.
- **`NOT_IMPLEMENTED` eliminado de `ErrorCode`**: la lista de `notImplemented.test.ts` quedó vacía.
- UI: panel para armar ofertas, ofertas entrantes con Aceptar / Rechazar / Contraofertar, y para el
  activo un botón "Cerrar con X" por cada jugador que aceptó.

### Decisiones técnicas de M7

1. **Los ids de oferta salen de `version`.** El engine no tiene aleatoriedad para gastar y tiene que
   seguir siendo reproducible; como cada acción crea a lo sumo una oferta, la versión en la que
   corre ya es única (`o12`).
2. **Confirmar revalida las dos manos.** Una oferta se queda en la mesa mientras el juego avanza: si
   alguno ya no puede pagar, se rechaza con `INSUFFICIENT_RESOURCES` y **la oferta sigue abierta**.
3. **Dos chequeos se separaron de la validación**: "¿puedo abrir una oferta?" y "¿puedo
   contraofertar esta?". La UI necesita preguntarlo **antes** de que el jugador elija cartas, y una
   sonda con cartas inventadas responde otra pregunta (de hecho fallaba con
   `INSUFFICIENT_RESOURCES`). `legal.ts` usa esos dos, así el panel solo muestra botones que el
   motor ya aprobó.
4. **Cancelar es cuestión de dueño, no de turno.** Quien contraofertó puede retirarla mientras juega
   otro.

---

## M8 — Persistencia, pulido y preparación del deploy ✅

**Qué quedó hecho**

- **Persistencia con `node:sqlite`**: cada sala guarda `seed` + lista de acciones; al arrancar, el
  server reproduce y restaura. Escritura dentro de la cola serial por sala.
- **Limpieza** de salas con 24 h sin actividad, en memoria y en la base, cada hora.
- **Build de producción** del server con tsup (el engine se compila adentro), `Dockerfile`,
  `fly.toml` y `.dockerignore`.
- **Pulido**: fin de partida con desglose, revancha en la misma sala, chat, dados animados, flash de
  producción, sonidos sintetizados con botón de mute.
- **README** con los pasos exactos de deploy y las variables de entorno.

### Decisiones técnicas de M8

1. **`node:sqlite` y no `better-sqlite3`** (la evaluación que M0 dejó anotada): viene con Node, así
   que la imagen no tiene que compilar un módulo nativo. Sigue marcado como experimental; la API que
   usamos son cinco llamadas y el costo de cambiarlo es un archivo.
2. **Se guarda `seed` + acciones y nada derivado.** Restaurar es un replay, así que un estado
   guardado no puede contradecir a las reglas de hoy: lo produce el motor.
3. **`node:sqlite` se carga con `createRequire`.** Es más nuevo que la lista de builtins de esbuild,
   así que el bundle de producción reescribía `import 'node:sqlite'` como `import 'sqlite'` — un
   paquete que no existe — y **el server solo fallaba al arrancar**. Un `require` en runtime queda
   fuera del alcance del bundler. Lo encontré haciendo el smoke test del bundle, no en los tests.
4. **Los sonidos se sintetizan** con la Web Audio API: no hay archivos que servir ni licencias que
   revisar, y nada que cargar antes del primer clic.
5. **Las animaciones se re-disparan remontando**, no con `setState` en un efecto (que además el
   linter de React marca). Las dos respetan `prefers-reduced-motion`.

---

## Post-deploy — bugs, feedback, estética y reinicio ✅

Cuatro tandas, en orden de prioridad, después de las primeras partidas reales con amigos.

### 1. Bugs

- **Scroll pegajoso** en chat y registro: siguen lo nuevo solo si ya estabas abajo; si subiste a
  leer, no se mueve nada y aparece una pastilla con cuántas novedades hay. Contador de no leídos
  con el chat cerrado. El truco para que no sea un `setState` dentro de un efecto: se ancla la
  cantidad de items del momento en que te fuiste del fondo, y "no leídos" es una resta.
- **El ladrón ya no tapa el tablero.** El tinte pasó a estar **debajo** de las piezas: se oscurece
  el terreno y los pueblos y caminos quedan a plena opacidad y con borde. Al pasar por un hex, un
  tooltip dice a quién le pega (nombre, color, cartas) y se marcan sus edificios. El hex donde ya
  está el ladrón se dibuja como lo que es: el único que no se puede elegir.
- **Camino más largo visible.** El panel muestra el **recorrido** de cada uno, no la cantidad de
  caminos; al pasar el mouse se traza ese recorrido exacto en el tablero, y si tenés 6 caminos con
  un recorrido de 4 el tooltip lo explica. El motor ganó `longestRoadPath`.

### 2. Capa de feedback

Todo sale de eventos que el motor ya emitía. Dados grandes al centro, hexes que pulsan, cartas que
vuelan del hex a quien las recibió, contador flotante sobre cada jugador, aviso cuando el ladrón
bloquea y **cartel explícito cuando el banco se queda sin un recurso** (la regla que nadie conoce y
antes era invisible). Banner permanente con de quién es el turno y qué se espera; cuando te toca,
borde, sonido y título de pestaña. El log pasó a estar escrito para personas, agrupado por turno,
con las fases internas detrás del flag de debug.

Las animaciones nunca bloquean: llevan vencimiento propio, la tirada nueva reemplaza a la vieja, y
hay un control de velocidad con "sin animaciones" de primera clase.

### 3. Estética

Dirección visual escrita en [DESIGN.md](./DESIGN.md) **antes** de tocar componentes: materiales del
sur (chapa, lenga, esmalte, basalto), fondo de noche patagónica en vez de negro, acentos en familia
(ocre de estepa, rojo de lenga, azul glaciar) y dos tipografías de Omnibus-Type, un taller de Buenos
Aires. Texturas SVG por terreno (que además hacen que el terreno no dependa solo del color), fichas
de número como discos de esmalte, casas y ciudades con volumen, caminos con bisel. La mano dejó de
ser una tabla de números: son cartas abanicadas abajo del tablero, y se eligen clickeando para
descartar y para ofertar. Panel derecho ordenado por urgencia, con comercio, chat y registro en
solapas.

### 4. Reiniciar y previsualizar

- **En el lobby**: el tablero que se va a jugar está a la vista y el host puede pedir otro.
  Arrancar juega ese mismo tablero.
- **En partida**: votación con unanimidad de los **conectados**, un "no" la corta al instante,
  timeout de 60 s, y 5 minutos de espera para el que propuso y perdió. La partida sigue jugable
  mientras tanto.
- **Una sala pasa a tener varias partidas.** Reiniciar **archiva** la que estaba (semilla + acciones
  enteras) y empieza una nueva; pisarla habría roto el replay. La revancha de M8 usa el mismo
  camino, y la sala lleva un marcador de ganadas.

---

---

## Segunda pasada de UX — layout, rondas, chat de sala y modos de tablero ✅

Cuatro partes, en el orden que pediste.

### 1. Layout y claridad

El tablero medía poco más de media pantalla y la mano quedaba cortada abajo. Las dos cosas eran la
misma: nadie medía nada.

- **El tablero mide su caja** con un `ResizeObserver` (`lib/useElementSize.ts`) y estira el
  `viewBox` a la forma de esa caja, así llena el eje más corto en vez de quedar centrado y chico.
  El margen del viewBox bajó de 1.2 a 0.85 unidades, lo justo para las insignias de los puertos.
- **El bloque blanco cortado abajo a la izquierda era un naipe.** El abanico hunde las cartas de
  los extremos con un `translateY` positivo, la mano estaba posicionada en absoluto contra el borde
  inferior y la ventana le cortaba la esquina a la primera. Ahora la mano es una fila de la columna
  con una banda de alto fijo (100px con cartas, 22px sin ellas), `h-dvh` en vez de `h-screen`, y
  nada sobresale.
- **El alto es lo único que limita al tablero**, así que la barra de turno se plegó adentro del
  header como pastilla: treinta píxeles de cromo menos y, de paso, el mensaje de turno dejó de
  estar duplicado. Medido en 1366×768, 1920×1080, 1024×768 y 820×1180: el tablero pasó de 440 a
  507px de alto dibujado, y en ningún tamaño hay recorte ni scroll de página.
- **Botones por fase**: dados solo en `preRoll`, fin de turno solo en `main`, ninguno de los dos
  durante la preparación. Comercio y cartas de desarrollo dicen "Disponible cuando arranque la
  partida" en vez de mostrar tres paneles de botones muertos. Las cartas de desarrollo tienen
  pestaña propia.
- **Legibilidad**: piso de 13px en todo el panel; los puntos de victoria son el número grande de
  cada fila, en Chivo; los tres íconos pasaron a SVG —los emoji 🛣 ⚔ 🂠 caían en glifos ilegibles en
  la máquina de prueba— con tooltip y una leyenda que se descarta una sola vez; el selector de
  animaciones tiene etiqueta visible.
- **Puertos**: los 2:1 se pintan del color de su recurso con su ícono, los 3:1 son un anillo
  glaciar. Antes el 2:1 de mineral y el 3:1 eran el mismo gris.
- De yapa, el lobby dice qué falta para arrancar en vez de "3 de 4 · hacen falta 3", que no
  mencionaba los colores sin elegir, que era lo que tenía apagado el botón.

### 2. Contador de rondas

En el estado, no en la web: una recarga llega sin historial que contar.

- `GameState.turn`: 0 durante toda la preparación, 1 cuando la serpiente termina, +1 en cada
  `endTurn` — incluidos los forzados. La ronda se **deriva** del turno y de la cantidad de asientos.
- El fuzz compara el contador contra los `TurnEnded` en cada paso. Un fixture de partida entera
  guardada como la guarda el servidor (`test/fixtures/partida-vieja.json`) se replica y comprueba
  que el contador sale bien sin que el archivo lo traiga.
- El registro dejó de numerar sus propios turnos desde uno: cuenta hacia atrás desde el turno que
  se está jugando, así acierta aunque el cliente se haya perdido el principio.

### 3. Chat de sala

- Las últimas 200 líneas viven con la sala, numeradas, en su propia tabla de SQLite y con la misma
  limpieza de 24 h. Al entrar o al volver con el token llega `chat:history`.
- El autor sale de la sesión del socket; el esquema acepta el texto y nada más.
- Líneas de sistema sin autor y ya redactadas: entradas, vueltas, desconexiones, propuesta y
  resultado del voto de reinicio, revancha y victoria. Todo se pinta como texto.
- Un solo componente, en el lobby y en la pestaña del juego.

### 4. Modos de tablero

- `'random'` es el de siempre y **su salida no cambió**; el snapshot de M1 y un test explícito lo
  pinnean, junto con el orden de turnos y el mazo que salen después.
- `'classic'` sale de una tabla en `board/classic.ts` y no consume RNG.
- `'balanced'` repite el sorteo hasta pasar cuatro controles. Calibrado sobre 1000 semillas.
- `room:setBoardMode` (host, lobby, zod). El modo va en el estado, en la vista y en la sala, y lo
  conservan el reinicio por voto y la revancha.

**Bug encontrado de paso**: `CREATE TABLE IF NOT EXISTS` no agrega columnas a una base ya escrita,
así que cualquier base anterior a `preview_seed` reventaba al arrancar con la primera sentencia que
la nombrara. Lo encontré porque me pasó con una base vieja del scratchpad. Las columnas posteriores
a la primera release ahora pasan por un `ALTER TABLE` idempotente, con un test que abre una base con
el esquema viejo. **Si la base de Render es anterior a esas columnas, este arreglo es el que la
deja arrancar.**

## Decisiones tomadas sin consulta

Pendientes de revisión. Todas se eligieron por el criterio "lo más conservador y consistente con el
SPEC", y ninguna rompe una regla de arquitectura.

| #   | Tema                                                  | Qué elegí                                                                                              | Por qué                                                                                                                                                           |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Ofrecer lo que no tenés**                           | Al **crear** una oferta se exige que el proponente tenga las cartas, además de revalidar al confirmar  | El SPEC (§12.5) solo pide lados no vacíos y disjuntos. Permitir ofertas impagables llena la mesa de humo; es lo más restrictivo                                   |
| 2   | **Una respuesta por jugador**                         | `respondOffer` se puede mandar **una sola vez** por oferta (`ALREADY_RESPONDED`)                       | El SPEC no dice si se puede cambiar de opinión. Lo restrictivo es que no                                                                                          |
| 3   | **Qué pasa con las demás ofertas al cerrar un trato** | Se cierra **solo** la oferta confirmada y sus contraofertas; las otras siguen abiertas                 | §4.9 enumera qué cancela ofertas (cancelar y fin de turno) y no incluye confirmar. Mínima intervención                                                            |
| 4   | **Ids de oferta**                                     | `o<version>`                                                                                           | Determinista y reproducible; el engine no puede usar aleatoriedad para esto                                                                                       |
| 5   | **Confirmar una contraoferta**                        | El activo la cierra directo, sin aceptación previa (§12.6), y `withPlayer` tiene que ser quien la hizo | §12.6 dice que se puede confirmar "como si fuera una oferta más"; la aceptación implícita es haberla propuesto                                                    |
| 6   | **Empate sin titular en camino más largo**            | Si nadie tiene el bono y dos llegan a 5 a la vez, queda **vacante**                                    | §12.2 resuelve empates a vacante. En la práctica es inalcanzable (se recalcula por acción)                                                                        |
| 7   | **La presencia no entra al replay**                   | `setConnected` es un helper puro, no una acción                                                        | Conectarse no es parte de la historia de la partida                                                                                                               |
| 8   | **Revancha**                                          | Semilla nueva, lista de acciones vacía, mismos asientos y mismo host                                   | Una revancha es una partida nueva; nada del anterior se conserva                                                                                                  |
| 9   | **Chat adelantado a M6**                              | El relay mínimo entró con los límites                                                                  | Los límites que pediste no tenían qué limitar sin chat                                                                                                            |
| 10  | **Sonidos sintetizados**                              | Web Audio, sin archivos                                                                                | Evita licencias y descargas; se puede reemplazar por samples sin tocar el resto                                                                                   |
| 11  | **Terrenos del tablero clásico**                      | Un reparto fijo propio, marcado como **pendiente de verificar** en `board/classic.ts`                  | Me pediste que no lo inventara si no estaba seguro. La espiral de números A–R sí es la del juego base; el reparto de terrenos no lo pude reproducir con confianza |
| 12  | **Banda de pips del modo balanceado**                 | [0.72, 1.3] de la parte justa de cada recurso                                                          | Medido sobre 1000 semillas: corta más o menos el décimo peor de cada punta. Acepta 1 de cada 77, 2,2 ms por tablero                                               |
| 13  | **El mensaje de turno queda arriba, no en el panel**  | Se plegó adentro del header y se sacó del panel lateral                                                | Pediste dejar uno solo; el de arriba es el que ya tenía el color de urgencia, y sacarlo del panel le devuelve 30px de alto al tablero                             |
| 14  | **La preparación es un bloque sin número en el log**  | Se rotula "Preparación" en vez de "Turno 0"                                                            | El engine cuenta la preparación como turno 0; mostrar un cero no dice nada                                                                                        |

### Verificado de menos

- **El deploy no se hizo** (necesita tus cuentas). Sí se verificó que el bundle de producción
  arranca, responde `/health` y **no** expone las rutas de desarrollo, y que la imagen se describe
  entera en el `Dockerfile`.
- **El tablero clásico no está contrastado contra una caja de verdad.** Está marcado en el archivo
  y arriba; corregí la tabla `TERRAINS` y no hace falta tocar nada más.
- **El layout se midió en un Chrome headless**, no en un tablet real. Lo que se comprobó por
  medición es que nada sobresale de la ventana y que no hay scroll de página en 1366×768,
  1920×1080, 1024×768 y 820×1180.

---

## Cierre: ajustes post-M8

1. **Las respuestas a ofertas se pueden cambiar** (aceptar ↔ rechazar) mientras la oferta siga
   abierta. `ALREADY_RESPONDED` se eliminó de `ErrorCode`. Sin riesgo: `confirmTrade` revalida las
   dos manos al cerrar.
2. **Fixture de partida terminada** (`GET /dev/fixture?back=N`): juega una partida entera al azar,
   le recorta las últimas N acciones y la carga como sala con tokens conocidos. Funciona porque una
   sala es `seed` + acciones: no es un estado inventado, es una partida real frenada a N jugadas del
   final. **No se monta en producción** (`NODE_ENV`), con test que verifica el 404 y un paso de CI
   que lo comprueba contra el binario real.
   - La respuesta incluye `nextActions`, las jugadas recortadas, para reproducir el final exacto.
   - La web acepta `?room=CODE&token=UUID&name=X` para sentar cada ventana en su asiento.
3. **CI buildea el server, lo arranca desde el bundle y pega a `/health`.** Los tests corren sobre
   las fuentes: el bug de `node:sqlite` en el bundle pasó typecheck, lint y 311 tests antes de
   fallar al arrancar. Ese paso es el que lo habría agarrado.

**Verificación de punta a punta del final** (lo que faltaba): con el fixture, tres ventanas, la
jugada ganadora hecha a mano desde la UI. Pantalla de fin correcta (`Ganó Bruno`, "10 puntos, con 2
cartas de PV escondidas"), desglose por jugador — Bruno 6 de ciudades + 2 de gran ejército + 2 de
cartas = 10; las cartas ajenas se ven como `—` salvo las del ganador y las propias —, los no-host
viendo "Esperando la revancha", y la revancha dejando a los tres en Setup 1 de una partida nueva.

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
