import type { PortType, Resource, Terrain } from '@tierra-austral/engine';

interface TerrainStyle {
  /** Fill for the hex body. */
  readonly fill: string;
  /** Hex outline, a shade darker than the fill. */
  readonly stroke: string;
  /** Rioplatense label, shown in the debug overlay. */
  readonly label: string;
}

export const TERRAIN_STYLES: Record<Terrain, TerrainStyle> = {
  forest: { fill: '#2f5d3a', stroke: '#1d3b25', label: 'Bosque' },
  hills: { fill: '#a85432', stroke: '#6f3620', label: 'Colinas' },
  pasture: { fill: '#7cab52', stroke: '#52733a', label: 'Pastizal' },
  fields: { fill: '#e0b23f', stroke: '#9c7a26', label: 'Campos' },
  mountains: { fill: '#7b8794', stroke: '#4d565f', label: 'Montañas' },
  desert: { fill: '#ddc9a3', stroke: '#a8926f', label: 'Desierto' },
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
