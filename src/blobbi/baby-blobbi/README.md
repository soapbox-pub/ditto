# Baby Blobbi Module

Self-contained module for baby stage Blobbi visuals and customization.

## Overview

This module provides everything needed to render and customize baby stage Blobbis:

- **SVG Assets**: Base and sleeping variants
- **SVG Resolution**: Loading and variant selection
- **Customization**: Color and appearance customization
- **Type Safety**: Full TypeScript support

## Module Structure

```
src/blobbi/baby-blobbi/
├── assets/
│   ├── blobbi-baby-base.svg      # Awake baby variant
│   └── blobbi-baby-sleeping.svg   # Sleeping baby variant
├── lib/
│   ├── baby-svg-resolver.ts       # SVG loading and resolution
│   └── baby-svg-customizer.ts     # Color customization utilities
├── types/
│   └── baby.types.ts              # Type definitions
├── index.ts                       # Barrel exports
└── README.md                      # This file
```

## Usage

### Basic SVG Resolution

```typescript
import { resolveBabySvg, getBabyBaseSvg, getBabySleepingSvg } from '@/blobbi/baby-blobbi';

// Get specific variant
const awakeSvg = getBabyBaseSvg();
const sleepingSvg = getBabySleepingSvg();

// Resolve from Blobbi instance
const svg = resolveBabySvg(blobbi, { isSleeping: false });
```

### Color Customization

```typescript
import { customizeBabySvgFromBlobbi } from '@/blobbi/baby-blobbi';

// Get base SVG
const baseSvg = getBabyBaseSvg();

// Apply Blobbi's colors
const customizedSvg = customizeBabySvgFromBlobbi(baseSvg, blobbi, false);
```

### Preloading

```typescript
import { preloadBabySvgs } from '@/blobbi/baby-blobbi';

// Preload all baby SVGs for quick switching
preloadBabySvgs();
```

## Customization Options

The module supports three color customizations:

- **baseColor**: Primary body color
- **secondaryColor**: Secondary gradient color
- **eyeColor**: Pupil/eye color (not applied to sleeping variant)

## Design Principles

1. **Portability**: Self-contained, minimal external dependencies
2. **Type Safety**: Full TypeScript coverage
3. **Performance**: Eager loading via Vite for instant access
4. **Consistency**: Follows established patterns from egg module
5. **Separation**: Baby-specific logic isolated from adult/egg logic

## Integration

This module is designed to be:

- Imported via barrel exports from `@/blobbi/baby-blobbi`
- Used alongside egg and adult modules
- Easily moved to other projects with minimal changes

## Related Modules

- **Egg Module**: `src/egg/` - Egg stage visuals and incubation
- **Adult Module**: Adult stage visuals (to be refactored similarly)
