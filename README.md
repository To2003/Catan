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

## Cómo jugar en local

```bash
pnpm dev
```

Abrí **tres ventanas de incógnito** (no tres pestañas de la misma ventana: comparten
`localStorage` y se pelean por el mismo asiento) en `http://localhost:5173/`.

1. En la primera: nombre → **Crear sala**. Sale un código de 5 letras.
2. En las otras dos: nombre + código → **Unirse**.
3. Cada una elige color y marca **Estoy listo**.
4. El host toca **Arrancar**.

Si cambiás el puerto de la web, el server necesita `WEB_ORIGIN` apuntando ahí o el
navegador bloquea el socket por CORS.

### Ver el final de una partida sin jugarla

Llegar a 10 PV a clics lleva una hora. Como una sala es `seed` + acciones, hay un comando de
desarrollo que juega una partida entera al azar, le recorta las últimas N acciones y la carga
como sala, con los tokens de los tres jugadores:

```bash
curl -s "http://localhost:3001/dev/fixture?back=1" | jq
```

Devuelve el código de sala, un token por jugador, los tres links listos para abrir (uno por
ventana de incógnito) y `nextActions`: las jugadas que recortó, la última de las cuales gana la
partida. Con `back=1` la partida queda **a una jugada del final**.

```json
{
  "code": "DEV60",
  "actionsKept": 909,
  "actionsDropped": 1,
  "nextActions": [{ "playerId": "…", "action": { "type": "playKnight" } }],
  "links": ["http://localhost:5173/?room=DEV60&token=…&name=Ana", "…"]
}
```

La ruta **no existe en producción** (`NODE_ENV=production` → 404), y hay un test que lo fija.

### Modos de desarrollo

| URL         | Qué es                                                                                |
| ----------- | ------------------------------------------------------------------------------------- |
| `/`         | El juego real, contra el server                                                       |
| `/?debug=1` | **Hot-seat**: partida local completa sin server, la forma más rápida de probar reglas |
| `/?board=1` | Visor de tablero de M1, con `&seed=` para repetir uno                                 |
| `&ids=1`    | Overlay con los ids de vértices, aristas y hexes                                      |

## Variables de entorno

**Server** (`apps/server`)

| Variable     | Default                    | Para qué                                               |
| ------------ | -------------------------- | ------------------------------------------------------ |
| `PORT`       | `3001`                     | Puerto HTTP y de Socket.IO                             |
| `WEB_ORIGIN` | `http://localhost:5173`    | Origen permitido por CORS: la URL del front desplegado |
| `DB_PATH`    | `./data/tierra-austral.db` | Archivo SQLite con las salas (`seed` + acciones)       |

**Web** (`apps/web`)

| Variable          | Default                 | Para qué                           |
| ----------------- | ----------------------- | ---------------------------------- |
| `VITE_SERVER_URL` | `http://localhost:3001` | A qué server se conecta el cliente |

## Deploy

El front va a Vercel y el server a Railway o Fly. **Vercel no sirve para el server**: no
mantiene WebSockets abiertos.

El orden importa: primero el server (para tener su URL), después el front (que la necesita),
y al final se vuelve al server a corregir `WEB_ORIGIN` con la URL real del front.

### 1. Server en Fly.io

```bash
fly launch --no-deploy            # usa el Dockerfile y el fly.toml del repo
fly volumes create tierra_austral_data --size 1 --region eze
fly secrets set WEB_ORIGIN=https://tierra-austral.vercel.app
fly deploy
```

- El `fly.toml` del repo ya deja `min_machines_running = 1` y `auto_stop_machines = false`:
  una máquina que se apaga corta los WebSockets de la partida en curso.
- El volumen montado en `/data` es lo que hace que un reinicio no se lleve las salas.
- Healthcheck: `GET /health`.

### 1-bis. Server en Railway (alternativa)

1. **New Project → Deploy from GitHub repo**, y elegir este repo.
2. Railway detecta el `Dockerfile` de la raíz.
3. Variables: `WEB_ORIGIN` con la URL del front y `DB_PATH=/data/tierra-austral.db`.
4. **Add Volume** montado en `/data`. Sin volumen, cada deploy arranca sin salas.
5. Copiar el dominio público que queda (`https://algo.up.railway.app`).

### 2. Front en Vercel

1. **Add New → Project**, importar el repo.
2. Framework preset: **Vite**.
3. Root directory: `apps/web`.
4. Build command: `pnpm install && pnpm --filter @tierra-austral/web build`
   (desde la raíz del monorepo; Vercel corre el install por su cuenta).
5. Output directory: `dist`.
6. Variable de entorno: `VITE_SERVER_URL` con la URL del server del paso 1.

Ojo: `VITE_SERVER_URL` se **hornea en el bundle** en tiempo de build. Si cambia, hay que
volver a buildear el front, no alcanza con cambiar la variable.

### 3. Cerrar el círculo

Volver al server y dejar `WEB_ORIGIN` con la URL final de Vercel (incluido el `https://`, sin
barra al final). Sin eso el navegador rechaza la conexión del socket y el front se queda en
"Conectando…".

### Probar el deploy

```bash
curl https://<server>/health     # {"ok":true,"hexes":19}
```

Después, tres ventanas de incógnito contra la URL de Vercel, igual que en local.

## Persistencia

Cada sala guarda **`seed` + la lista de acciones**, nada derivado: al arrancar, el server
reproduce las acciones y reconstruye el estado. Un reinicio en medio de una partida no se
nota más que en la reconexión de los clientes. Las salas sin actividad por 24 h se borran.

Se usa `node:sqlite`, que viene con Node: no hay módulo nativo que compilar en la imagen.
