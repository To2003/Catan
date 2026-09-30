import type { BoardGraph, EdgeId, PlayerId, VertexId } from '@tierra-austral/engine';
import { shadeOf } from '../../lib/playerColors.js';

interface PiecesProps {
  readonly board: BoardGraph;
  readonly buildings: Readonly<Record<VertexId, { owner: PlayerId; type: 'settlement' | 'city' }>>;
  readonly roads: Readonly<Record<EdgeId, PlayerId>>;
  readonly colorOf: (playerId: PlayerId) => string;
  /** Thicker outlines, for when the board is dimmed and the pieces are the point. */
  readonly emphasis?: boolean;
}

/**
 * How pieces stay visible on six different terrains.
 *
 * A single outline cannot do it: a dark one disappears into the forest, a
 * light one into the desert. So every piece is drawn three times — a dark
 * halo, then the body, then a thin light edge — which reads against anything
 * underneath without tinting the player's colour. Green on pasture was the
 * case that forced it.
 */
const HALO = '#0d141a';
const EDGE = '#e3d5bf';
const SHADOW = '#0b1117';

/** Everything scales off this, so the whole set grows with one number. */
const SCALE = 1.45;

const s = (units: number): number => units * SCALE;

/**
 * A settlement: one gabled house.
 *
 * Silhouette first. It and the city have to be told apart at a glance on a
 * busy board, so the difference is shape and not size — one roof against a
 * roof plus a tower.
 */
export function Settlement({
  x,
  y,
  fill,
  emphasis = false,
}: {
  readonly x: number;
  readonly y: number;
  readonly fill: string;
  readonly emphasis?: boolean;
}) {
  const w = s(0.13);
  const body = `M${x - w} ${y + s(0.12)} V${y - s(0.02)} L${x} ${y - s(0.17)} L${x + w} ${y - s(0.02)} V${y + s(0.12)} Z`;

  return (
    <g>
      <ellipse cx={x} cy={y + s(0.15)} rx={w * 1.05} ry={s(0.045)} fill={SHADOW} opacity={0.4} />
      <path d={body} fill="none" stroke={HALO} strokeWidth={s(0.09)} strokeLinejoin="round" />
      <path
        d={body}
        fill={fill}
        stroke={emphasis ? '#f2e9d5' : EDGE}
        strokeWidth={s(emphasis ? 0.05 : 0.03)}
        strokeLinejoin="round"
      />
      {/* One darker face, which is all the volume a piece this size needs. */}
      <path
        d={`M${x} ${y - s(0.17)} L${x + w} ${y - s(0.02)} V${y + s(0.12)} H${x} Z`}
        fill={shadeOf(fill)}
        opacity={0.85}
      />
    </g>
  );
}

/**
 * A city: a longer hall with a tower at one end.
 *
 * The tower is the whole point of the shape. Two houses of different sizes
 * are two houses; a tower against a roofline is a different building even at
 * six pixels tall.
 */
export function City({
  x,
  y,
  fill,
  emphasis = false,
}: {
  readonly x: number;
  readonly y: number;
  readonly fill: string;
  readonly emphasis?: boolean;
}) {
  const left = x - s(0.2);
  const hall = `M${left} ${y + s(0.14)} V${y - s(0.02)} L${left + s(0.11)} ${y - s(0.15)} L${left + s(0.22)} ${y - s(0.02)} V${y + s(0.14)} Z`;
  const tower = `M${x + s(0.02)} ${y + s(0.14)} V${y - s(0.26)} H${x + s(0.2)} V${y + s(0.14)} Z`;
  // Battlements: three notches along the top, so the tower is a tower.
  const crown = `M${x + s(0.02)} ${y - s(0.26)} h${s(0.05)} v${s(0.05)} h${s(0.04)} v${-s(0.05)} h${s(0.05)} v${s(0.05)} h${s(0.04)} v${-s(0.05)}`;

  return (
    <g>
      <ellipse cx={x} cy={y + s(0.17)} rx={s(0.23)} ry={s(0.05)} fill={SHADOW} opacity={0.4} />
      <path
        d={`${hall} ${tower}`}
        fill="none"
        stroke={HALO}
        strokeWidth={s(0.09)}
        strokeLinejoin="round"
      />
      <path
        d={hall}
        fill={fill}
        stroke={emphasis ? '#f2e9d5' : EDGE}
        strokeWidth={s(emphasis ? 0.05 : 0.03)}
        strokeLinejoin="round"
      />
      <path
        d={tower}
        fill={shadeOf(fill)}
        stroke={emphasis ? '#f2e9d5' : EDGE}
        strokeWidth={s(emphasis ? 0.05 : 0.03)}
        strokeLinejoin="round"
      />
      <path d={crown} fill="none" stroke={EDGE} strokeWidth={s(0.025)} strokeLinejoin="round" />
      {/* A lit window, which also says which way the thing is facing. */}
      <rect
        x={x + s(0.08)}
        y={y - s(0.14)}
        width={s(0.06)}
        height={s(0.08)}
        fill="#f2e9d5"
        opacity={0.55}
      />
    </g>
  );
}

/**
 * A road: a bevelled bar from one vertex to the other.
 *
 * It runs all the way to the centre of each vertex and is drawn before the
 * buildings, so a house sits on top of its own junction instead of leaving a
 * seam.
 */
export function Road({
  a,
  b,
  fill,
  emphasis = false,
}: {
  readonly a: { x: number; y: number };
  readonly b: { x: number; y: number };
  readonly fill: string;
  readonly emphasis?: boolean;
}) {
  const width = s(emphasis ? 0.13 : 0.11);
  return (
    <g>
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={HALO}
        strokeWidth={width + s(0.06)}
        strokeLinecap="round"
      />
      <line
        x1={a.x}
        y1={a.y + s(0.03)}
        x2={b.x}
        y2={b.y + s(0.03)}
        stroke={shadeOf(fill)}
        strokeWidth={width}
        strokeLinecap="round"
      />
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={fill}
        strokeWidth={width * 0.8}
        strokeLinecap="round"
      />
    </g>
  );
}

/** Settlements, cities and roads on the board, drawn in unit space. */
export function Pieces({ board, buildings, roads, colorOf, emphasis = false }: PiecesProps) {
  return (
    <g pointerEvents="none">
      {/* Roads first: a building belongs on top of the junction it sits on. */}
      {board.edgeIds.map((id) => {
        const owner = roads[id];
        if (owner === undefined) return null;
        const edge = board.edges[id];
        const a = edge && board.vertices[edge.vertices[0]];
        const b = edge && board.vertices[edge.vertices[1]];
        if (!a || !b) return null;
        return <Road key={id} a={a} b={b} fill={colorOf(owner)} emphasis={emphasis} />;
      })}

      {board.vertexIds.map((id) => {
        const building = buildings[id];
        if (!building) return null;
        const vertex = board.vertices[id];
        if (!vertex) return null;
        const fill = colorOf(building.owner);

        return building.type === 'city' ? (
          <City key={id} x={vertex.x} y={vertex.y} fill={fill} emphasis={emphasis} />
        ) : (
          <Settlement key={id} x={vertex.x} y={vertex.y} fill={fill} emphasis={emphasis} />
        );
      })}
    </g>
  );
}
