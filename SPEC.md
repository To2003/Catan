# SPEC — Juego de colonización por turnos (web, online con salas)

> Nombre de trabajo: **Tierra Austral** (cambiable). No usamos el nombre "Catan", ni su arte ni sus textos. Las mecánicas son libres; la marca y la estética no.

---

## 1. Resumen

Juego de mesa por turnos para **3 a 4 jugadores**, jugado **online**. Cada jugador entra desde su compu a una **sala privada con código**. Implementa las **reglas base completas**, incluido el **comercio completo entre jugadores** (ofertas, contraofertas y aceptación). Está pensado para jugar con amigos, así que no hay cuentas ni ranking: entrás con un nombre y el código de la sala.

### Objetivos

- Reglas base 100% correctas y validadas en el servidor.
- Partida fluida online, con reconexión si se cae alguien.
- Tablero claro e interactivo, con resaltado de jugadas válidas.
- Código mantenible: el motor de reglas es puro y testeable.

### Fuera de alcance (por ahora)

- Cuentas, login, ranking y matchmaking público.
- Bots / IA.
- Expansiones y variantes de 5 y 6 jugadores.
- App mobile nativa (la web es responsive, pero el foco es desktop).

---

## 2. Stack

| Capa               | Tecnología                                           | Por qué                                                  |
| ------------------ | ---------------------------------------------------- | -------------------------------------------------------- |
| Lenguaje           | **TypeScript** (strict) en todo                      | Tipos y reglas compartidos entre front y back            |
| Monorepo           | **pnpm workspaces**                                  | Tres paquetes que comparten código                       |
| Motor de reglas    | TS puro, sin dependencias                            | Determinista y testeable                                 |
| Servidor           | **Node 20 + Socket.IO**                              | Tiempo real y salas nativas                              |
| Frontend           | **Vite + React**                                     | Liviano, sin necesidad de SSR                            |
| Render del tablero | **SVG** dentro de React                              | Hexágonos simples, fácil de hacer clickeable y estilizar |
| Estado del cliente | **Zustand**                                          | Simple y sin boilerplate                                 |
| Estilos            | **Tailwind CSS**                                     | Rápido                                                   |
| Tests              | **Vitest**                                           | Rápido y nativo de TS                                    |
| Persistencia       | En memoria + snapshot en **SQLite** (better-sqlite3) | Sobrevive a reinicios del server                         |
| Deploy             | Front en **Vercel**, server en **Railway o Fly.io**  | Vercel no mantiene WebSockets persistentes               |

---

## 3. Estructura del repo

```
tierra-austral/
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ packages/
│  └─ engine/                  # Motor de reglas (puro, sin I/O)
│     ├─ src/
│     │  ├─ types.ts           # Tipos de estado, acciones y eventos
│     │  ├─ constants.ts       # Costos, cantidades y límites
│     │  ├─ board/
│     │  │  ├─ generate.ts     # Generación del tablero con semilla
│     │  │  ├─ geometry.ts     # Hex → vértices y aristas, grafo de adyacencias
│     │  │  └─ layout.ts       # Layout estándar de 19 hexes y 9 puertos
│     │  ├─ rng.ts             # PRNG con semilla (mulberry32)
│     │  ├─ reducer.ts         # applyAction(state, action) → { state, events }
│     │  ├─ validate.ts        # Chequeo de legalidad por acción
│     │  ├─ legal.ts           # Jugadas legales (para resaltar en la UI)
│     │  ├─ rules/
│     │  │  ├─ setup.ts
│     │  │  ├─ dice.ts
│     │  │  ├─ robber.ts
│     │  │  ├─ build.ts
│     │  │  ├─ trade.ts
│     │  │  ├─ devCards.ts
│     │  │  ├─ longestRoad.ts
│     │  │  └─ largestArmy.ts
│     │  └─ view.ts            # Filtra el estado por jugador (info oculta)
│     └─ test/
├─ apps/
│  ├─ server/
│  │  └─ src/
│  │     ├─ index.ts           # Arranque de Express + Socket.IO
│  │     ├─ rooms.ts           # Salas, asientos y tokens
│  │     ├─ handlers.ts        # Eventos del socket
│  │     └─ persistence.ts     # Guardado en SQLite
│  └─ web/
│     └─ src/
│        ├─ main.tsx
│        ├─ net/socket.ts
│        ├─ store/gameStore.ts
│        ├─ screens/           # Home, Lobby, Game y GameOver
│        └─ components/
│           ├─ board/          # Board, Hex, Vertex, Edge, Port y Robber
│           ├─ PlayerPanel.tsx
│           ├─ Hand.tsx
│           ├─ ActionBar.tsx
│           ├─ TradePanel.tsx
│           ├─ DiscardModal.tsx
│           ├─ DevCardModal.tsx
│           ├─ GameLog.tsx
│           └─ Chat.tsx
```

---

## 4. Reglas del juego (fuente de verdad)

> Los casos borde de estas reglas están resueltos en la sección **12. Aclaraciones de reglas**. Ante una duda, esa sección manda.

### 4.1 Recursos y terrenos

| Terreno  | Recurso (código) | Label en la UI | Cantidad de hexes |
| -------- | ---------------- | -------------- | ----------------- |
| Bosque   | `wood`           | Madera         | 4                 |
| Colinas  | `brick`          | Ladrillo       | 3                 |
| Pastizal | `sheep`          | Lana           | 4                 |
| Campos   | `wheat`          | Trigo          | 4                 |
| Montañas | `ore`            | Mineral        | 3                 |
| Desierto | —                | Desierto       | 1                 |

- El banco tiene **19 cartas de cada recurso**.
- Las fichas numéricas son 18: `2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12`. El desierto no lleva ficha.
- Restricción de generación: **los 6 y los 8 no pueden quedar adyacentes**. Si pasa, se regenera la distribución.
- Hay **9 puertos** en posiciones fijas del borde: 4 genéricos (3:1) y 5 específicos (2:1, uno por recurso). El tipo de cada puerto se mezcla al azar.

### 4.2 Piezas por jugador

- 15 caminos, 5 asentamientos y 4 ciudades.
- Al mejorar un asentamiento a ciudad, el asentamiento vuelve al stock del jugador.

### 4.3 Costos

| Construcción        | Costo                                    |
| ------------------- | ---------------------------------------- |
| Camino              | 1 madera + 1 ladrillo                    |
| Asentamiento        | 1 madera + 1 ladrillo + 1 lana + 1 trigo |
| Ciudad (mejora)     | 2 trigo + 3 mineral                      |
| Carta de desarrollo | 1 lana + 1 trigo + 1 mineral             |

### 4.4 Reglas de colocación

- **Regla de distancia:** ningún asentamiento o ciudad puede estar en un vértice adyacente a otro edificio, sea propio o ajeno.
- **Camino:** tiene que conectar con un camino, asentamiento o ciudad propios. No puede continuar a través de un vértice que tenga un edificio ajeno.
- **Asentamiento (fuera del setup):** tiene que tocar al menos un camino propio.
- **Ciudad:** solo se construye sobre un asentamiento propio.

### 4.5 Fase de colocación inicial (setup)

1. El orden de juego se sortea al azar.
2. Ronda 1 (orden 1 → N): cada jugador coloca 1 asentamiento y 1 camino adyacente a ese asentamiento.
3. Ronda 2 (orden N → 1, en serpiente): cada jugador coloca 1 asentamiento y 1 camino adyacente.
4. El **segundo** asentamiento da 1 recurso por cada hex adyacente que produzca.
5. En el setup no se aplica el requisito de conexión con caminos, pero **sí la regla de distancia**.

### 4.6 Estructura del turno

```
PRE_ROLL   → puede jugar 1 carta de Caballero antes de tirar
ROLL       → tira 2d6 (lo hace el servidor)
  si sale 7   → DISCARD (si hace falta) → MOVE_ROBBER → STEAL
  si no sale 7 → producción
MAIN       → construir, comerciar y jugar 1 carta de desarrollo, en cualquier orden
END_TURN
```

### 4.7 Producción

- Cada hex con el número que salió produce, salvo que tenga el ladrón.
- Un asentamiento adyacente recibe 1 recurso y una ciudad recibe 2.
- **Escasez del banco:** si el banco no tiene suficiente de un recurso para todos los que deben recibirlo, **nadie recibe ese recurso**. Excepción: si hay un solo jugador afectado, recibe lo que quede.

### 4.8 Cuando sale un 7

1. **Descarte:** todo jugador con más de 7 cartas descarta la mitad, redondeando para abajo. Los descartes son **simultáneos** y cada jugador elige qué cartas descartar. El juego espera a que todos confirmen.
2. **Ladrón:** el jugador activo mueve el ladrón a **otro** hex. Puede ser el desierto.
3. **Robo:** el jugador activo elige a un jugador con edificio adyacente a ese hex (que no sea él mismo y que tenga cartas) y le roba **1 carta al azar**. Si no hay candidatos, no se roba nada.

### 4.9 Comercio

Solo el **jugador activo** comercia, y siempre **después de tirar los dados**.

- **La tasa la calcula el motor, nunca el cliente.** La acción `maritimeTrade` dice solo qué se da y qué se pide; cuántas cartas cuesta sale de los edificios del jugador. Un cliente que pudiera mandar su propia tasa podría mandar 1:1.
- Cada acción entrega **1 unidad** del recurso pedido. Para pedir 2, van 2 acciones.
- Se usa siempre la **mejor** tasa disponible para ese recurso: 2:1 con puerto propio de ese recurso, si no 3:1 con puerto genérico, si no 4:1.
- Una **ciudad conserva el puerto** del asentamiento que mejoró, y un asentamiento colocado en el setup ya da acceso: el puerto es una propiedad del vértice.
- **Con el banco:** 4 iguales por 1 cualquiera.
- **Con un puerto 3:1:** 3 iguales por 1, si el jugador tiene un edificio en ese puerto.
- **Con un puerto 2:1:** 2 del recurso del puerto por 1, con la misma condición.
- **Entre jugadores:** el jugador activo comercia con cualquiera. Los otros jugadores **no** comercian entre sí. No se pueden regalar cartas: cada lado tiene que dar al menos 1. No se pueden cambiar cartas iguales por iguales. Las cartas de desarrollo no se comercian.

#### Flujo de comercio entre jugadores

1. El jugador activo crea una oferta `{ give, want, to: 'all' | playerId[] }`.
2. Cada destinatario responde con **Aceptar**, **Rechazar** o **Contraoferta**. La contraoferta crea una oferta nueva vinculada, visible para el jugador activo.
3. El jugador activo ve quiénes aceptaron y **confirma con uno solo**.
4. El servidor revalida que ambos tengan los recursos en ese momento y ejecuta el intercambio.
5. El jugador activo puede cancelar la oferta en cualquier momento. Al terminar el turno se cancelan todas las ofertas abiertas.
6. Puede haber varias ofertas abiertas a la vez, con un máximo configurable (por defecto 3).

### 4.10 Cartas de desarrollo (mazo de 25)

| Carta                   | Cantidad | Efecto                                                                    |
| ----------------------- | -------- | ------------------------------------------------------------------------- |
| Caballero               | 14       | Mover el ladrón y robar (igual que con el 7, pero sin descarte)           |
| Punto de victoria       | 5        | +1 PV oculto                                                              |
| Construcción de caminos | 2        | 2 caminos gratis (si quedan en el stock)                                  |
| Año de abundancia       | 2        | Tomar 2 recursos cualesquiera del banco                                   |
| Monopolio               | 2        | Elegir un recurso: todos los demás te dan todas sus cartas de ese recurso |

- Se puede jugar **como máximo 1 carta de desarrollo por turno**.
- No se puede jugar una carta **comprada en el mismo turno**, salvo las de PV.
- Las cartas de PV no se "juegan": se revelan automáticamente cuando alcanzan para ganar.
- El Caballero se puede jugar en `PRE_ROLL` o en `MAIN`.

### 4.11 Bonos

- **Gran Ejército (2 PV):** lo obtiene el primero que juegue 3 caballeros. Pasa a otro jugador solo si lo **supera** estrictamente.
- **Camino más largo (2 PV):** lo obtiene el primero con un camino continuo de 5 o más tramos. Un edificio ajeno en un vértice corta el camino. Si alguien lo supera, se lo lleva. Si al titular le cortan el camino y queda empatado con otro, lo conserva. Si lo pierde y hay empate entre otros jugadores, o nadie llega a 5, **nadie** lo tiene.

### 4.12 Puntos y victoria

- Asentamiento = 1 PV, ciudad = 2 PV, carta de PV = 1, cada bono = 2.
- Gana el primero que tenga **10 PV durante su propio turno**. Se chequea después de cada acción.

---

## 5. Modelo de datos

### 5.1 Geometría del tablero

- Los hexes usan **coordenadas axiales** `(q, r)`, radio 2 (19 hexes).
- Vértices y aristas se generan una vez por tablero: se calcula la posición en píxeles de cada esquina y se deduplica por posición redondeada. Quedan **54 vértices** y **72 aristas** con IDs `v0…v53` y `e0…e71`.
- Se precomputa un grafo de adyacencias:

```ts
interface BoardGraph {
  hexes: Record<HexId, Hex>;
  vertices: Record<
    VertexId,
    {
      x: number;
      y: number;
      hexes: HexId[];
      edges: EdgeId[];
      neighbors: VertexId[];
      port?: PortType;
    }
  >;
  edges: Record<EdgeId, { vertices: [VertexId, VertexId]; hexes: HexId[] }>;
  ports: Port[];
  // Ids en orden canónico, para iterar de forma determinista.
  hexIds: HexId[];
  vertexIds: VertexId[];
  edgeIds: EdgeId[];
}

interface Port {
  edge: EdgeId;
  type: PortType;
  vertices: [VertexId, VertexId];
}
```

- Un puerto ocupa una **arista**, pero la regla de comercio se consulta desde el **vértice** donde hay un edificio. Por eso el puerto se guarda de los dos lados: `port` en cada uno de sus 2 vértices (lo que leen las reglas) y el array `ports` con la arista (lo que necesita el render para dibujar el muelle y orientarlo).
- El tablero es **inmutable** durante toda la partida. El ladrón no vive acá: vive en `GameState.robberHex` (§5.2).
- Las posiciones se calculan en **espacio unitario** (circunradio del hex = 1), con `y` creciendo hacia abajo como en SVG. El render deriva su `viewBox` del bounding box, así que la escala en píxeles nunca entra al motor.
- La deduplicación de vértices **redondea a una grilla de 1e-4** en vez de comparar floats. El margen es amplio: en espacio unitario dos vértices distintos nunca están a menos de 0.5.

### 5.2 Tipos principales

```ts
type Resource = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore';
type ResourceBundle = Record<Resource, number>;
type Terrain = 'forest' | 'hills' | 'pasture' | 'fields' | 'mountains' | 'desert';
type PortType = '3:1' | Resource;
type DevCard = 'knight' | 'vp' | 'roadBuilding' | 'yearOfPlenty' | 'monopoly';
type PlayerColor = 'celeste' | 'bordo' | 'verde' | 'amarillo';

interface Hex {
  id: HexId;
  q: number;
  r: number;
  terrain: Terrain;
  number?: number;
}

interface Player {
  id: PlayerId;
  name: string;
  color: PlayerColor;
  resources: ResourceBundle;
  devCards: DevCard[]; // en mano
  devCardsBoughtThisTurn: DevCard[];
  knightsPlayed: number;
  stock: { roads: number; settlements: number; cities: number };
  connected: boolean;
}

type Phase =
  | { kind: 'lobby' }
  | { kind: 'setup'; round: 1 | 2; step: 'settlement' | 'road'; lastSettlement?: VertexId }
  | { kind: 'preRoll' }
  | {
      kind: 'discard';
      pending: Record<PlayerId, number>;
      source: 'seven'; // solo un 7 llega al descarte; el caballero no
      returnTo: 'main';
    }
  | { kind: 'moveRobber'; source: 'seven' | 'knight'; returnTo: 'preRoll' | 'main' }
  | { kind: 'steal'; candidates: PlayerId[]; returnTo: 'preRoll' | 'main' }
  | { kind: 'main' }
  | { kind: 'roadBuilding'; remaining: 1 | 2 }
  | { kind: 'gameOver'; winner: PlayerId };

interface GameState {
  version: number; // se incrementa en cada acción aplicada
  seed: number;
  rngState: number;
  board: BoardGraph;
  robberHex: HexId;
  buildings: Record<VertexId, { owner: PlayerId; type: 'settlement' | 'city' }>;
  roads: Record<EdgeId, PlayerId>;
  players: Player[];
  turnOrder: PlayerId[];
  currentPlayer: PlayerId;
  phase: Phase;
  lastRoll?: [number, number];
  bank: ResourceBundle;
  devDeck: DevCard[];
  devCardPlayedThisTurn: boolean;
  tradeOffers: TradeOffer[];
  largestArmy?: PlayerId;
  longestRoad?: { owner: PlayerId; length: number };
}
```

**El log no vive en el estado.** `applyAction` devuelve sus eventos y el consumidor los acumula: el hot-seat de debug ahora, el server en M6. Son dos razones:

- **Redundancia:** el estado se reconstruye con `seed` + la lista de acciones, así que un log adentro sería una segunda fuente de verdad.
- **Costo:** `applyAction` clona el estado en cada acción; un log que crece sin parar volvería cuadrático cualquier recorrido largo (el fuzz test, un replay).

En M6 el server filtra los eventos privados por jugador al emitirlos, que es el mismo criterio de `view.ts` aplicado al flujo de eventos en vez de al estado.

```ts
interface TradeOffer {
  id: string;
  from: PlayerId; // quién propone
  give: Partial<ResourceBundle>;
  want: Partial<ResourceBundle>;
  to: PlayerId[];
  responses: Record<PlayerId, 'pending' | 'accepted' | 'rejected'>;
  parentOfferId?: string; // si es una contraoferta
}
```

### 5.3 Acciones

```ts
type Action =
  | { type: 'placeSettlement'; vertex: VertexId }
  | { type: 'placeRoad'; edge: EdgeId }
  | { type: 'upgradeCity'; vertex: VertexId }
  | { type: 'rollDice' }
  | { type: 'discard'; cards: Partial<ResourceBundle> }
  | { type: 'moveRobber'; hex: HexId }
  | { type: 'steal'; target: PlayerId }
  | { type: 'buyDevCard' }
  | { type: 'playKnight' }
  | { type: 'playRoadBuilding' }
  | { type: 'playYearOfPlenty'; resources: [Resource, Resource] }
  | { type: 'playMonopoly'; resource: Resource }
  | { type: 'maritimeTrade'; give: Resource; want: Resource }
  | {
      type: 'createOffer';
      give: Partial<ResourceBundle>;
      want: Partial<ResourceBundle>;
      to: PlayerId[] | 'all';
    }
  | { type: 'respondOffer'; offerId: string; response: 'accept' | 'reject' }
  | {
      type: 'counterOffer';
      offerId: string;
      give: Partial<ResourceBundle>;
      want: Partial<ResourceBundle>;
    }
  | { type: 'confirmTrade'; offerId: string; withPlayer: PlayerId }
  | { type: 'cancelOffer'; offerId: string }
  | { type: 'endTurn' };
```

---

## 6. Motor de reglas

- La API central es `applyAction(state, playerId, action): { ok: true; state; events } | { ok: false; error: ErrorCode }`.
- Es una función **pura**: no usa `Math.random`, no hace I/O y no depende de la fecha. Toda la aleatoriedad (dados, mazo, robos y tablero) sale del PRNG con semilla guardado en el estado.
- `validate.ts` rechaza toda acción ilegal con un código de error tipado, por ejemplo `NOT_YOUR_TURN`, `WRONG_PHASE`, `INSUFFICIENT_RESOURCES`, `DISTANCE_RULE` o `NOT_CONNECTED`.
- `legal.ts` expone helpers para la UI: `legalSettlementSpots`, `legalRoadSpots`, `legalCitySpots`, `legalRobberHexes`, `legalStealTargets` y `availableMaritimeRates`. **El descarte no se enumera**: es una combinación de cartas, no una posición, así que el espacio es combinatorio. Para `discard` alcanza con `validate`.
- **Toda cantidad de recursos que llega en una acción** (`discard`, y el comercio desde M4) se valida como **entero no negativo**: `NaN`, decimales y negativos se rechazan con `INVALID_AMOUNT`. En M6 las acciones llegan por red, donde los tipos de TypeScript no existen: `validate` es la última línea de defensa.
- `view.ts` implementa `getPlayerView(state, playerId)`, que:
  - muestra tus recursos y tus cartas de desarrollo en detalle;
  - de los demás jugadores muestra solo cuántas cartas de recursos y cuántas de desarrollo tienen;
  - oculta el orden del mazo, el `rngState` y las cartas de PV ajenas;
  - en los eventos emitidos, muestra el recurso robado solo al que roba y al robado.
- **Event sourcing:** se guarda `seed` más la lista de acciones aplicadas. Reproducirlas reconstruye el estado exacto, lo que sirve para persistencia, debugging y replays.

### Algoritmo de camino más largo

Se hace un DFS sobre las aristas del jugador, arrancando desde cada vértice extremo o de cada arista. Cada arista se usa una sola vez por recorrido y no se atraviesa un vértice que tenga un edificio ajeno. Se recalcula para **todos** los jugadores después de cada camino o asentamiento colocado, porque un asentamiento puede cortar caminos ajenos.

---

## 7. Salas y red

### 7.1 Salas

- **Crear sala:** el host pone su nombre y recibe un código de 5 letras (por ejemplo `KPXQZ`).
- **Unirse:** con nombre y código. Máximo 4 jugadores y mínimo 3 para arrancar.
- **Lobby:** cada jugador elige color, marca "listo" y el host arranca la partida.
- Al entrar, el servidor le da a cada jugador un `playerToken` (UUID) que el cliente guarda en `localStorage`.
- **Reconexión:** al volver con el mismo token, el jugador recupera su asiento. Si se desconecta el jugador activo, el juego espera. Se muestra "Esperando a X…" y, pasados 2 minutos, el host puede forzar el fin de su turno.
- Las salas sin actividad por 24 horas se borran.

### 7.2 Protocolo (Socket.IO)

**Cliente → servidor**

| Evento          | Payload                                       |
| --------------- | --------------------------------------------- |
| `room:create`   | `{ name }`                                    |
| `room:join`     | `{ code, name, token? }`                      |
| `room:setColor` | `{ color }`                                   |
| `room:ready`    | `{ ready: boolean }`                          |
| `room:start`    | — (solo el host)                              |
| `game:action`   | `{ action: Action, expectedVersion: number }` |
| `chat:send`     | `{ text }`                                    |

**Servidor → cliente**

| Evento         | Payload                                      |
| -------------- | -------------------------------------------- |
| `room:state`   | jugadores, colores, estado de "listo" y host |
| `game:state`   | `PlayerView` filtrado para ese jugador       |
| `game:events`  | eventos nuevos para animaciones y log        |
| `game:error`   | `{ code, message }`                          |
| `chat:message` | `{ from, text, at }`                         |

- El servidor es **autoritativo**: el cliente nunca modifica el estado localmente, solo manda acciones.
- Si `expectedVersion` no coincide con la versión actual, la acción se rechaza con `STALE_STATE` y el cliente se resincroniza.
- Después de cada acción válida, el servidor manda un `game:state` filtrado a cada socket de la sala y persiste la acción en SQLite.

---

## 8. UI / UX

### Pantallas

1. **Home:** input de nombre y botones "Crear sala" y "Unirme con código".
2. **Lobby:** código grande con botón de copiar link, lista de jugadores, selector de color, botón "Listo" y botón "Arrancar" para el host.
3. **Partida:** layout principal (ver abajo).
4. **Fin de partida:** ganador, puntos de cada uno con desglose y botón de revancha (misma sala, tablero nuevo).

### Layout de la partida (desktop)

```
┌───────────────────────────────────────────┬──────────────┐
│                                           │ Jugadores    │
│              TABLERO (SVG)                │ (PV, cartas, │
│                                           │  bonos)      │
│                                           ├──────────────┤
│                                           │ Log / Chat   │
├───────────────────────────────────────────┴──────────────┤
│ Mano (recursos + cartas de desarrollo) │ Barra de acción  │
└──────────────────────────────────────────────────────────┘
```

### Interacción

- Al elegir "Construir camino", se resaltan **solo las aristas legales**. Lo mismo pasa con asentamientos, ciudades y el ladrón.
- Los botones de construcción muestran el costo y se deshabilitan si no te alcanzan los recursos (con tooltip de lo que falta).
- Tirada de dados con una animación corta. Los hexes que producen parpadean y las cartas "vuelan" a los jugadores.
- Indicador claro de turno ("Te toca, che" / "Le toca a Juan") y de la fase actual.
- Modales para descartar, elegir víctima del robo, año de abundancia y monopolio.
- **Panel de comercio:** selector de lo que das y lo que pedís, con botones para enviar a todos o a jugadores puntuales. Las ofertas entrantes aparecen como toasts con los botones Aceptar, Rechazar y Contraofertar.
- Sonidos opcionales, con botón de mute.
- Todo el copy de la UI va en **español rioplatense**, con voseo y tono informal.

### Copy de ejemplo

- "Te toca, tirá los dados."
- "Salió 7. Tenés más de 7 cartas, descartá 4."
- "Juan te afanó una lana."
- "No te alcanza: te falta 1 ladrillo."
- "¡Ganó Toto con 10 puntos!"

---

## 9. Testing

- **Motor (Vitest):** tests unitarios por regla: distancia, conexión, producción, escasez del banco, descarte, robo, cada carta de desarrollo, casos de camino más largo (incluido el corte y el empate) y gran ejército.
- **Fixtures:** tableros armados a mano para testear casos puntuales.
- **Fuzz test:** simular 1.000 partidas con acciones legales al azar y verificar invariantes después de cada acción:
  - Conservación de recursos: banco + manos = 19 por recurso.
  - Stock de piezas + piezas en el tablero = totales.
  - Nadie tiene recursos negativos.
  - PV calculados = PV derivados del tablero.
- **Replay:** la misma semilla y las mismas acciones producen exactamente el mismo estado.
- **Server:** test de integración con 3 clientes Socket.IO que juegan un setup completo.

---

## 10. Roadmap

| Hito   | Contenido                                                       | Resultado                                                      |
| ------ | --------------------------------------------------------------- | -------------------------------------------------------------- |
| **M0** | Monorepo, TS strict, ESLint, Prettier, Vitest y scripts         | `pnpm dev` levanta web y server                                |
| **M1** | Generación de tablero y render SVG                              | Tablero random visible                                         |
| **M2** | Motor: setup, dados, producción y construcción                  | Partida jugable en **modo hot-seat de debug** (local, sin red) |
| **M3** | 7, descarte, ladrón y robo                                      | —                                                              |
| **M4** | Comercio con banco y puertos                                    | —                                                              |
| **M5** | Cartas de desarrollo, bonos y victoria                          | Reglas base completas en local                                 |
| **M6** | Server, salas, lobby y sincronización                           | Partida online entre amigos                                    |
| **M7** | Comercio entre jugadores con contraofertas                      | —                                                              |
| **M8** | Reconexión, persistencia SQLite, chat, sonidos, pulido y deploy | Versión 1.0                                                    |

> El modo hot-seat de M2 es solo una herramienta de desarrollo para probar reglas sin levantar el server. Se puede dejar detrás de un flag `?debug=1`.

---

## 11. Instrucciones para el asistente de código

- Trabajar **hito por hito**, en orden. No avanzar sin tests verdes del hito anterior.
- **Nunca** meter lógica de reglas en `apps/web` ni en `apps/server`. Toda regla vive en `packages/engine`.
- El engine no usa `Math.random`, `Date` ni I/O.
- Toda acción nueva necesita: su tipo en `Action`, su validación, su caso en el reducer, sus eventos y sus tests.
- Si una regla de este documento resulta ambigua, preguntar antes de inventar.
- Código y nombres en inglés; copy de la UI en español rioplatense.
- Commits chicos y descriptivos, uno por feature.

---

## 12. Aclaraciones de reglas

Resoluciones de los casos que la sección 4 dejaba abiertos. Son vinculantes: el motor implementa esto.

### 12.1 Escasez del banco (aclara §4.7)

Se evalúa **recurso por recurso**: la escasez de uno no afecta a los demás.

- Si un **único** jugador tiene derecho a ese recurso y el banco no alcanza, recibe **lo que quede**. Ejemplo: le tocan 2 por una ciudad y en el banco queda 1 → recibe 1.
- Si **dos o más** jugadores tienen derecho a ese recurso y no alcanza para todos, **nadie** recibe ese recurso.

### 12.2 Camino más largo (aclara §4.11)

El umbral de 5 es **duro**: por debajo de 5 tramos no hay bono, aunque sea el camino más largo del tablero. Al recalcular después de cada camino o asentamiento colocado:

- El titular sigue con ≥5 y nadie lo supera estrictamente → **lo conserva** (aunque haya empate).
- Otro jugador lo supera estrictamente y tiene ≥5 → **pasa a ese jugador**.
- El titular baja a <5, o queda por debajo de otros empatados → si hay un **único** máximo ≥5, pasa a ese jugador; si hay **empate** en el máximo, o nadie llega a 5, el bono queda **vacante**.

### 12.3 Vuelta de fase del ladrón (aclara §4.6 y §5.2)

Las fases `moveRobber` y `steal` llevan `returnTo: 'preRoll' | 'main'`.

- Un **7** siempre vuelve a `main` (no hay producción).
- Un **caballero** vuelve a la fase donde se jugó: `preRoll` (todavía hay que tirar los dados) o `main`.

### 12.4 Chequeo de victoria (aclara §4.12)

Los PV se chequean **después de cada acción del jugador activo** y también **al inicio de su turno, antes de tirar**. Si un jugador llega a 10 PV durante el turno de otro (por ejemplo, porque le cortaron el camino al titular del bono), **gana al empezar su propio turno**.

### 12.5 Validez de una oferta de comercio (aclara §4.9)

- Ningún recurso puede aparecer a la vez en `give` y en `want`.
- Ambos lados tienen que tener **al menos 1 carta**: no se regala ni se comercia vacío.

### 12.6 Contraofertas (aclara §4.9)

- El jugador activo puede **confirmar una contraoferta directamente**, como si fuera una oferta más.
- Las contraofertas **no** cuentan contra el límite de 3 ofertas abiertas. Ese límite aplica solo a las ofertas creadas por el jugador activo.
- Cada jugador puede tener como máximo **1 contraoferta viva por oferta original**. Si manda otra, **reemplaza** a la anterior.
- **Un solo nivel:** no hay contra-contraofertas. Si el activo quiere seguir negociando, crea una oferta nueva.
- Al **cancelar** una oferta original se cancelan también **todas sus contraofertas**.

### 12.7 Robo obligatorio (aclara §4.8)

Si hay **al menos 1 candidato** válido, el robo es **obligatorio**: la fase `steal` no se puede saltear. Si no hay candidatos, no se roba y el turno sigue.

El robo es **siempre una acción explícita**, incluso con un solo candidato: el motor no lo resuelve solo. La UI puede preseleccionar al único candidato, pero la acción igual viaja. Los candidatos se calculan **al mover el ladrón** y quedan guardados en la fase `steal`; entre `moveRobber` y `steal` no hay ninguna otra acción legal, así que no pueden quedar desactualizados.

El descarte es la **única fase simultánea**: actúan todos los que deben cartas, sin importar de quién sea el turno. Cada uno descarta **exactamente** `floor(n/2)` en **un solo** `discard`; no hay descartes parciales. Las cartas descartadas **vuelven al banco**. El robo, en cambio, pasa **de mano a mano** y no toca el banco.

### 12.8 Construcción de caminos (aclara §4.10)

- Se colocan los caminos que se puedan (por stock o por falta de aristas legales) y la carta **se consume igual**.
- Si **no hay ninguna** colocación legal al momento de jugarla, la validación **rechaza** jugar la carta.

### 12.9 Defaults de generación del tablero

- El ladrón arranca en el **desierto**.
- **Terrenos y números se mezclan al azar** (no se usa el espiral fijo), con regeneración si quedan 6 y 8 adyacentes.
- Las **posiciones** de los 9 puertos son fijas; sus **tipos** se mezclan.

### 12.10 Layout de los puertos y recorrido del perímetro

Las posiciones de los puertos **no se hardcodean**: se calculan.

1. Se toman las **30 aristas del perímetro**: las que tocan un solo hex.
2. Se las recorre en **sentido horario** formando un ciclo.
3. El recorrido arranca en la arista de perímetro cuyo **punto medio tiene la `y` más chica** y, si hay empate, la **`x` más chica**. En el tablero radio 2 eso es la arista superior-izquierda del hex de arriba a la izquierda (`q=0, r=-2`). La regla se define por punto medio y no por nombre porque un hex _pointy-top_ **no tiene arista superior**: tiene un vértice arriba.
4. Los puertos van en los índices `0, 3, 6, 10, 13, 16, 20, 23, 26` de ese recorrido (saltos de 3, 3, 4 repetidos, que suman 30). Como ningún salto baja de 2, **dos puertos nunca comparten un vértice**: quedan 18 vértices con puerto.
5. `PORT_START_OFFSET` rota todos los puertos a lo largo de la costa. Es puramente cosmético: los invariantes valen con cualquier offset.
6. Los **tipos** (4 genéricos y 5 de 2:1, uno por recurso) se mezclan con el RNG de la partida.

### 12.11 Orden de consumo del RNG

El orden es **parte del contrato**: de él dependen el test de snapshot del tablero y la reproducción de una partida a partir de `seed` + acciones.

**En `generateBoard(seed)`:**

1. **Terrenos** — un Fisher-Yates sobre la bolsa de terrenos.
2. **Números** — un shuffle por intento, reintentando hasta que no queden dos fichas rojas adyacentes. Los terrenos **no** se remezclan entre intentos.
3. **Tipos de puerto** — un shuffle de los 9 tipos.

**En `createGame(seed, players)`**, continuando con el mismo estado del PRNG:

4. **Tablero** — los pasos 1 a 3. Va primero para que el snapshot de M1 siga valiendo.
5. **Orden de turnos** — un shuffle de los asientos, en el orden en que se recibieron.
6. **Mazo de desarrollo** — un shuffle de las 25 cartas. Se mezcla acá desde M2 aunque nadie robe hasta M5: meterlo después correría todas las tiradas de todas las semillas.

**Durante la partida:**

7. **Dados** — por cada `rollDice`, dos `rollDie`: primero d1, después d2.
8. **Robo del ladrón** — se expande la mano de la víctima en el orden fijo `wood, brick, sheep, wheat, ore`, una entrada por carta, y **una** extracción `nextInt(mano.length)` elige cuál. El orden de expansión es contrato: si cambia, cambian todos los robos de todas las semillas.

Si ese orden cambia, cambian todos los tableros y todas las partidas de todas las semillas, y el snapshot se rompe a propósito. Se actualiza de forma consciente, nunca regrabándolo a ciegas.
