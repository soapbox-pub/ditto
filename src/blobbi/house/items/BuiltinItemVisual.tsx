// src/blobbi/house/items/BuiltinItemVisual.tsx

/**
 * BuiltinItemVisual — Renders a builtin catalog item as inline SVG/CSS.
 *
 * Each builtin item ID maps to a small, self-contained visual.
 * These are intentionally simple for Phase 1 — future phases will
 * support external SVG assets and Nostr event references.
 */

interface BuiltinItemVisualProps {
  /** Catalog item ID. */
  id: string;
}

/**
 * Renders a builtin item visual that fills its parent container.
 * The parent is expected to provide width/height via CSS.
 */
export function BuiltinItemVisual({ id }: BuiltinItemVisualProps) {
  const visual = ITEM_VISUALS[id];
  if (!visual) return null;

  return (
    <div className="w-full h-full pointer-events-none select-none">
      {visual}
    </div>
  );
}

// ─── Visual Registry ──────────────────────────────────────────────────────────

const ITEM_VISUALS: Record<string, React.ReactNode> = {
  poster_abstract: <PosterAbstract />,
  rug_round: <RugRound />,
  plant_potted: <PlantPotted />,
};

// ─── Individual Item Visuals ──────────────────────────────────────────────────

/** A framed abstract poster on the wall. */
function PosterAbstract() {
  return (
    <svg viewBox="0 0 80 110" className="w-full h-full" aria-label="Abstract poster">
      {/* Frame */}
      <rect x="2" y="2" width="76" height="106" rx="3" fill="#f5f0eb" stroke="#b8a28e" strokeWidth="2.5" />
      {/* Inner mat */}
      <rect x="8" y="8" width="64" height="94" rx="1" fill="#fff" />
      {/* Abstract shapes */}
      <circle cx="30" cy="40" r="16" fill="#e8927c" opacity="0.85" />
      <circle cx="52" cy="55" r="12" fill="#7cb5e8" opacity="0.75" />
      <rect x="20" y="65" width="40" height="8" rx="4" fill="#c4d88e" opacity="0.7" />
      <circle cx="40" cy="35" r="8" fill="#f0c86e" opacity="0.6" />
      {/* Hanging wire */}
      <path d="M 30 0 Q 40 -6 50 0" fill="none" stroke="#999" strokeWidth="1" />
    </svg>
  );
}

/** A round decorative rug on the floor. */
function RugRound() {
  return (
    <svg viewBox="0 0 200 100" className="w-full h-full" aria-label="Round rug">
      {/* Rug shape — ellipse to look like a circle in perspective */}
      <ellipse cx="100" cy="50" rx="95" ry="45" fill="#c4866e" opacity="0.55" />
      <ellipse cx="100" cy="50" rx="80" ry="38" fill="#d4a08e" opacity="0.5" />
      {/* Inner pattern rings */}
      <ellipse cx="100" cy="50" rx="60" ry="28" fill="none" stroke="#e8c4b0" strokeWidth="2" opacity="0.6" />
      <ellipse cx="100" cy="50" rx="40" ry="19" fill="none" stroke="#e8c4b0" strokeWidth="1.5" opacity="0.5" />
      {/* Center dot */}
      <ellipse cx="100" cy="50" rx="8" ry="4" fill="#b87460" opacity="0.5" />
    </svg>
  );
}

/** A small potted plant. */
function PlantPotted() {
  return (
    <svg viewBox="0 0 60 100" className="w-full h-full" aria-label="Potted plant">
      {/* Pot */}
      <path d="M 16 65 L 20 95 Q 30 100 40 95 L 44 65 Z" fill="#c4866e" />
      <rect x="13" y="60" width="34" height="8" rx="3" fill="#d4976e" />
      {/* Soil */}
      <ellipse cx="30" cy="64" rx="14" ry="4" fill="#6b4e3d" />
      {/* Stems */}
      <path d="M 30 62 Q 28 45 22 35" fill="none" stroke="#5a8a4a" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 30 62 Q 32 42 38 30" fill="none" stroke="#5a8a4a" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 30 62 Q 30 48 30 28" fill="none" stroke="#5a8a4a" strokeWidth="2" strokeLinecap="round" />
      {/* Leaves */}
      <ellipse cx="20" cy="32" rx="10" ry="6" fill="#6aad58" transform="rotate(-25 20 32)" opacity="0.9" />
      <ellipse cx="40" cy="28" rx="10" ry="6" fill="#78ba65" transform="rotate(20 40 28)" opacity="0.85" />
      <ellipse cx="30" cy="25" rx="8" ry="5" fill="#82c470" transform="rotate(-5 30 25)" opacity="0.8" />
      <ellipse cx="24" cy="42" rx="7" ry="4" fill="#6aad58" transform="rotate(-40 24 42)" opacity="0.7" />
      <ellipse cx="36" cy="38" rx="7" ry="4" fill="#78ba65" transform="rotate(35 36 38)" opacity="0.75" />
    </svg>
  );
}
