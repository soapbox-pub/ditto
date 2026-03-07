# Blobbi Egg Visual System

A self-contained module for rendering Blobbi eggs with special marks, animations, and validation utilities.

## Features

- 🥚 **Self-contained**: Minimal external dependencies (only React required)
- 🎨 **Customizable**: Supports colors, patterns, special marks, and animations
- ✨ **Animated**: Smooth CSS animations for sway, warmth, and cracking effects
- 🔍 **Validated**: Built-in validation for all egg properties
- 📦 **Portable**: Can be copied to another project with minimal setup

## Installation

### Copy to Another Project

1. Copy the entire `src/egg/` folder to your project
2. Ensure you have React installed:
   ```bash
   npm install react
   ```
3. Import and use:
   ```tsx
   import { EggGraphic } from './egg';
   ```

### Required Dependencies

- **React** (18.x or higher) - **Only dependency required!**

### Optional Dependencies

- **Tailwind CSS** - Module includes Tailwind classes but has inline fallbacks for critical layout
  - Without Tailwind, the module still works and renders correctly
  - Some decorative styling may differ slightly without Tailwind
- **clsx** and **tailwind-merge** - Can be used by your host app for better class name merging, but the module itself doesn't require them

## Usage

### Basic Example

```tsx
import { EggGraphic } from './egg';

function MyComponent() {
  const egg = {
    baseColor: '#f2f2f2',
    eggTemperature: 50,
    lifeStage: 'egg',
  };

  return (
    <div style={{ width: '200px', height: '250px' }}>
      <EggGraphic blobbi={egg} animated={true} />
    </div>
  );
}
```

### With Special Marks

```tsx
const fancyEgg = {
  baseColor: '#cc99ff',
  secondaryColor: '#ff99ff',
  specialMark: 'sigil_eye',
  title: 'The Primordial',
  eggTemperature: 75,
  lifeStage: 'egg',
};

<EggGraphic blobbi={fancyEgg} animated={true} cracking={false} />
```

### Divine Egg

```tsx
const divineEgg = {
  baseColor: '#55C4A2',
  themeVariant: 'divine',
  crossoverApp: 'divine',
  eggTemperature: 70,
  lifeStage: 'egg',
  tags: [
    ['theme', 'divine'],
    ['crossover_app', 'divine'],
  ],
};

<EggGraphic blobbi={divineEgg} animated={true} />
```

## API Reference

### `<EggGraphic />`

Main component for rendering eggs.

**Props:**
- `blobbi?: EggVisualBlobbi` - Egg data object
- `sizeVariant?: 'tiny' | 'small' | 'medium' | 'large'` - Internal scaling (default: 'medium')
- `className?: string` - Additional CSS classes
- `animated?: boolean` - Enable animations (default: false)
- `cracking?: boolean` - Show cracking effect (default: false)
- `warmth?: number` - Temperature 0-100 (default: 50) - fallback if blobbi.eggTemperature not set

### `EggVisualBlobbi` Type

```typescript
type EggVisualBlobbi = {
  tags?: string[][];           // Nostr tags for metadata
  baseColor?: string;           // Primary egg color (hex)
  secondaryColor?: string;      // Secondary color for patterns (hex)
  pattern?: string;             // Pattern type (gradient, stripes, dots, swirl)
  specialMark?: string;         // Special visual mark
  eggTemperature?: number;      // Temperature 0-100
  title?: string;               // Special title (displays below egg)
  lifeStage?: 'egg' | 'baby' | 'adult';
  themeVariant?: string;        // Theme (e.g., 'divine')
  crossoverApp?: string | null; // Crossover app identifier
};
```

### Available Special Marks

- `dot_center` - Simple dot in center (common)
- `oval_spots` - Oval spots pattern (common)
- `ring_mark` - Ring marking (uncommon)
- `rune_top` - Mystical rune at top (rare)
- `sigil_eye` - Eye sigil marking (legendary)
- `shimmer_band` - Shimmering band effect (legendary)
- `glow_crack_pattern` - Glowing crack pattern (legendary)
- `divine_wordmark` - Special "diVine" wordmark (divine eggs only)

### Validation Utilities

```tsx
import {
  isValidBaseColor,
  isValidSecondaryColor,
  isValidSpecialMark,
  getColorRarity,
  validateEggProperties,
} from './egg';

// Validate individual properties
const valid = isValidBaseColor('#f2f2f2'); // true

// Get rarity
const rarity = getColorRarity('#6633cc', 'base'); // 'legendary'

// Validate complete egg
const result = validateEggProperties({
  base_color: '#f2f2f2',
  special_mark: 'sigil_eye',
});
// { isValid: true, errors: [] }
```

### Divine Utilities

```tsx
import { isDivineEgg, DIVINE_BASE_COLOR } from './egg';

const isDivine = isDivineEgg(myEgg); // boolean
```

### Hooks

```tsx
import { useSpecialMark } from './egg';

const specialMarkHook = useSpecialMark('sigil_eye', {
  animated: true,
  autoAnimate: true,
  performanceMode: false,
});

// Access state
const { isAnimated, opacity, isSupported } = specialMarkHook;
```

## Module Structure

```
src/egg/
├── components/
│   ├── EggGraphic.tsx           # Main egg rendering component
│   └── SpecialMarkRenderer.tsx  # Special marks SVG rendering
├── hooks/
│   └── useSpecialMark.ts        # Special mark state management
├── lib/
│   ├── blobbi-egg-validation.ts # Validation utilities
│   ├── blobbi-divine-utils.ts   # Divine theme utilities
│   ├── special-marks-utils.ts   # Special marks utilities
│   └── cn.ts                    # Class name utility
├── types/
│   └── egg.types.ts             # TypeScript types
├── styles/
│   └── egg-animations.css       # CSS animations
├── __demo__/
│   └── EggGraphicDemo.tsx       # Demo component (not exported)
├── index.ts                     # Public API exports
└── README.md                    # This file
```

## Demo

To see the module in action, import and render the demo component:

```tsx
import EggGraphicDemo from './egg/__demo__/EggGraphicDemo';

// In your app
<EggGraphicDemo />
```

**Note**: The demo component is not exported from the main module index.

## Customization

### Without Tailwind CSS

The module includes inline fallback styles for critical layout properties. It will work without Tailwind CSS, but you may want to add your own styles:

```tsx
<EggGraphic
  blobbi={myEgg}
  className="my-custom-egg-wrapper"
  animated={true}
/>
```

### Custom Animations

The module imports `./styles/egg-animations.css` automatically. To customize animations:

1. Modify `src/egg/styles/egg-animations.css`
2. Or override animation classes in your own CSS

## Browser Support

- Modern browsers with ES2020+ support
- CSS animations require modern browser
- Reduced motion preference is respected via `@media (prefers-reduced-motion: reduce)`

## License

This module is part of the Blobbi project.
