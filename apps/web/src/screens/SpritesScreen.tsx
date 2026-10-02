import type { PlayerColor, Terrain } from '@tierra-austral/engine';
import { City, Road, Settlement } from '../components/board/Pieces.js';
import { HexIcon } from '../components/board/HexIcon.js';
import { TERRAIN_PATTERN_ID, TerrainPatterns } from '../components/board/TerrainPatterns.js';
import { PLAYER_COLORS, PLAYER_COLOR_LABELS } from '../lib/playerColors.js';
import { TERRAIN_STYLES } from '../lib/terrainStyles.js';

/**
 * Every piece, in every colour, on every terrain, at two sizes.
 *
 * It exists because the question "can you see the green pieces on the
 * pasture" cannot be answered by playing a game: you would have to wait for
 * the green player to build there. Twenty-four combinations on one screen
 * answers it in a glance, and catches the next colour or terrain that gets
 * added.
 *
 * It renders the *same components* the board renders, not copies of them, so
 * a change that fixes the gallery is a change that fixes the board.
 */

const COLORS: readonly PlayerColor[] = ['celeste', 'bordo', 'verde', 'amarillo'];
const TERRAINS: readonly Terrain[] = [
  'forest',
  'hills',
  'pasture',
  'fields',
  'mountains',
  'desert',
];

/** One piece over one terrain, in its own little square of board. */
function Swatch({
  terrain,
  color,
  size,
}: {
  readonly terrain: Terrain;
  readonly color: PlayerColor;
  readonly size: number;
}) {
  const fill = PLAYER_COLORS[color];
  return (
    <svg
      viewBox="-1.05 -0.62 2.1 1.24"
      width={size}
      height={size * 0.59}
      className="rounded-[4px]"
      role="img"
      aria-label={`${PLAYER_COLOR_LABELS[color]} sobre ${TERRAIN_STYLES[terrain].label}`}
    >
      <TerrainPatterns />
      <rect
        x={-1.05}
        y={-0.62}
        width={2.1}
        height={1.24}
        fill={TERRAIN_STYLES[terrain].fill}
        stroke="none"
      />
      <rect
        x={-1.05}
        y={-0.62}
        width={2.1}
        height={1.24}
        fill={`url(#${TERRAIN_PATTERN_ID[terrain]})`}
      />
      {/* The hex's own mark, so its contrast against each terrain is checked
          in the same place as the pieces'. */}
      <HexIcon center={{ x: 0, y: 0.26 }} terrain={terrain} />
      <Road a={{ x: -0.95, y: 0.42 }} b={{ x: 0.95, y: 0.42 }} fill={fill} />
      <Settlement x={-0.62} y={-0.04} fill={fill} />
      <City x={0.62} y={-0.04} fill={fill} />
    </svg>
  );
}

export function SpritesScreen() {
  return (
    <main className="min-h-dvh overflow-y-auto bg-noche p-6 text-guanaco">
      <h1 className="font-display text-2xl">Piezas sobre cada terreno</h1>
      <p className="mt-1 mb-6 max-w-2xl text-[13px] text-guanaco-apagado">
        El ícono del terreno, y el camino, el pueblo y la ciudad en los cuatro colores, sobre los
        seis terrenos. Arriba a 1x, que es el tamaño de una partida en 1366×768; abajo a 2x, para
        mirar la silueta. Si un color se pierde contra una textura, se ve acá y no en medio de una
        partida.
      </p>

      {[1, 2].map((zoom) => (
        <section key={zoom} className="mb-8">
          <h2 className="font-display mb-2 text-lg text-estepa">{zoom}x</h2>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="w-24 text-left text-[13px] font-semibold text-guanaco-apagado">
                    Terreno
                  </th>
                  {COLORS.map((color) => (
                    <th
                      key={color}
                      className="text-left text-[13px] font-semibold"
                      style={{ color: PLAYER_COLORS[color] }}
                    >
                      {PLAYER_COLOR_LABELS[color]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TERRAINS.map((terrain) => (
                  <tr key={terrain}>
                    <td className="pr-2 text-[13px] text-guanaco-apagado">
                      {TERRAIN_STYLES[terrain].label}
                    </td>
                    {COLORS.map((color) => (
                      <td key={color}>
                        <Swatch terrain={terrain} color={color} size={zoom === 1 ? 150 : 300} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </main>
  );
}
