import type { Terrain } from '@tierra-austral/engine';

/**
 * A texture per terrain, as SVG patterns.
 *
 * Colour alone is a weak signal — it fails for anyone colour-blind and it
 * washes out when the board is dimmed for the robber. Each terrain also has a
 * mark drawn from what it is: lenga trunks in the forest, furrows in the
 * fields, wind-bent grass on the steppe, contour hatching on the mountains.
 *
 * Patterns rather than images: a few hundred bytes, and they scale with the
 * board instead of blurring.
 */
export const TERRAIN_PATTERN_ID: Record<Terrain, string> = {
  forest: 'tx-forest',
  hills: 'tx-hills',
  pasture: 'tx-pasture',
  fields: 'tx-fields',
  mountains: 'tx-mountains',
  desert: 'tx-desert',
};

export function TerrainPatterns() {
  return (
    <defs>
      {/* Lenga trunks: thin verticals, unevenly spaced. */}
      <pattern
        id={TERRAIN_PATTERN_ID.forest}
        width="0.34"
        height="0.5"
        patternUnits="userSpaceOnUse"
      >
        <path
          d="M0.07 0 V0.5 M0.19 0.06 V0.5 M0.29 0 V0.42"
          stroke="#0f2a1b"
          strokeWidth="0.022"
          opacity="0.5"
        />
      </pattern>

      {/* Clay: stippling, like dry broken ground. */}
      <pattern
        id={TERRAIN_PATTERN_ID.hills}
        width="0.28"
        height="0.28"
        patternUnits="userSpaceOnUse"
      >
        <circle cx="0.07" cy="0.09" r="0.022" fill="#5e2414" opacity="0.5" />
        <circle cx="0.2" cy="0.2" r="0.018" fill="#5e2414" opacity="0.4" />
        <circle cx="0.24" cy="0.05" r="0.014" fill="#5e2414" opacity="0.35" />
      </pattern>

      {/* Steppe grass, all of it leaning the same way: the wind never stops. */}
      <pattern
        id={TERRAIN_PATTERN_ID.pasture}
        width="0.3"
        height="0.3"
        patternUnits="userSpaceOnUse"
      >
        <path
          d="M0.05 0.26 q0.03 -0.12 0.1 -0.17 M0.17 0.28 q0.03 -0.1 0.09 -0.15"
          stroke="#2f5230"
          strokeWidth="0.02"
          fill="none"
          opacity="0.55"
        />
      </pattern>

      {/* Furrows. */}
      <pattern
        id={TERRAIN_PATTERN_ID.fields}
        width="0.4"
        height="0.22"
        patternUnits="userSpaceOnUse"
      >
        <path d="M0 0.07 H0.4 M0 0.16 H0.4" stroke="#8a6a17" strokeWidth="0.02" opacity="0.45" />
      </pattern>

      {/* Contour hatching on the rock. */}
      <pattern
        id={TERRAIN_PATTERN_ID.mountains}
        width="0.32"
        height="0.32"
        patternUnits="userSpaceOnUse"
      >
        <path
          d="M0 0.24 L0.16 0.06 L0.32 0.24"
          stroke="#33414e"
          strokeWidth="0.024"
          fill="none"
          opacity="0.6"
        />
      </pattern>

      {/* Wind-rippled sand. */}
      <pattern
        id={TERRAIN_PATTERN_ID.desert}
        width="0.36"
        height="0.24"
        patternUnits="userSpaceOnUse"
      >
        <path
          d="M0 0.12 q0.09 -0.06 0.18 0 t0.18 0"
          stroke="#9c8259"
          strokeWidth="0.018"
          fill="none"
          opacity="0.5"
        />
      </pattern>

      {/* One soft inner shadow, reused by the enamel number discs. */}
      <radialGradient id="enamel-shade" cx="50%" cy="38%" r="65%">
        <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="100%" stopColor="#4a3f2e" stopOpacity="0.35" />
      </radialGradient>
    </defs>
  );
}
