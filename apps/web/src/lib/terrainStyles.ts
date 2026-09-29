import type { PortType, Resource, Terrain } from '@tierra-austral/engine';

interface TerrainStyle {
  /** Fill for the hex body. */
  readonly fill: string;
  /** Hex outline, a shade darker than the fill. */
  readonly stroke: string;
  /** Rioplatense label, shown in the debug overlay. */
  readonly label: string;
}

/**
 * Terrain colours, pulled towards the palette in DESIGN.md: the greens go
 * colder and greyer the way southern vegetation does, the fields keep the dry
 * ochre of the steppe, and the rock is basalt rather than neutral grey.
 */
export const TERRAIN_STYLES: Record<Terrain, TerrainStyle> = {
  forest: { fill: '#2b5138', stroke: '#17301f', label: 'Bosque' },
  hills: { fill: '#9c4b2c', stroke: '#65301b', label: 'Colinas' },
  pasture: { fill: '#6d9250', stroke: '#47623a', label: 'Pastizal' },
  fields: { fill: '#cfa43a', stroke: '#8d7024', label: 'Campos' },
  mountains: { fill: '#6c7c8b', stroke: '#414e5a', label: 'Montañas' },
  desert: { fill: '#d6c09a', stroke: '#a08a66', label: 'Desierto' },
};

export const RESOURCE_LABELS: Record<Resource, string> = {
  wood: 'Madera',
  brick: 'Ladrillo',
  sheep: 'Lana',
  wheat: 'Trigo',
  ore: 'Mineral',
};

/** What a harbour trades, as shown on the board. */
export const portLabel = (type: PortType): string =>
  type === '3:1' ? '3:1' : `2:1 ${RESOURCE_LABELS[type]}`;

/** Three-letter resource tags for the dock badge, where a full word will not fit. */
export const RESOURCE_TAGS: Record<Resource, string> = {
  wood: 'MAD',
  brick: 'LAD',
  sheep: 'LAN',
  wheat: 'TRI',
  ore: 'MIN',
};

/** One glyph per resource, for counters and cards in flight. */
export const RESOURCE_ICONS: Record<Resource, string> = {
  wood: '🌲',
  brick: '🧱',
  sheep: '🐑',
  wheat: '🌾',
  ore: '⛰️',
};
