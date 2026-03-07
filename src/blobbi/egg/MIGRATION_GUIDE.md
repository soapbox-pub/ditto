# Blobbi Egg Module - Migration Guide

## How to Copy This Module to Another Project

This guide explains how to use the `src/egg/` module in another project.

### Prerequisites

Your target project needs:
1. **React** 18.x or higher - **Only required dependency!**
2. A bundler that supports CSS imports (Vite, Webpack, etc.)

Optional (recommended but not required):
- **Tailwind CSS** - Module has inline fallbacks for critical layout
  - Without Tailwind, the module works and renders correctly
  - Some decorative styles may differ slightly

### Installation Steps

#### 1. Copy the Module

Copy the entire `src/egg/` folder to your target project:

```bash
# From your target project root
cp -r /path/to/source/src/egg ./src/
```

#### 2. Install Dependencies

```bash
# Only React is required
npm install react react-dom
```

That's it! No other dependencies needed.

#### 3. Import and Use

```tsx
// Import from the module
import { EggGraphic } from './egg';
import type { EggVisualBlobbi } from './egg';

// Create an egg object
const myEgg: EggVisualBlobbi = {
  baseColor: '#f2f2f2',
  eggTemperature: 50,
  lifeStage: 'egg',
};

// Render it
function MyComponent() {
  return (
    <div style={{ width: '200px', height: '250px' }}>
      <EggGraphic blobbi={myEgg} animated={true} />
    </div>
  );
}
```

### Verification

#### Quick Test

Use the demo component to verify everything works:

```tsx
import EggGraphicDemo from './egg/__demo__/EggGraphicDemo';

// Render in your app temporarily
<EggGraphicDemo />
```

If you see eggs rendering with animations, the module is working correctly!

#### TypeScript Check

```bash
npx tsc --noEmit
```

Should compile without errors related to the egg module.

### Troubleshooting

#### Issue: "Cannot resolve './styles/egg-animations.css'"

**Solution**: Ensure your bundler supports CSS imports. For Vite this works out of the box. For Webpack, ensure you have `css-loader` configured.

#### Issue: Eggs don't look right without Tailwind

**Solution**: The module includes inline fallbacks, but some styles use Tailwind. Either:
1. Install and configure Tailwind CSS (recommended)
2. Add custom CSS to override styles

#### Issue: TypeScript errors about EggVisualBlobbi

**Solution**: Make sure TypeScript can resolve the module:

```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Or use relative imports:
```tsx
import { EggGraphic } from '../../egg';
```

### Customization After Migration

#### Change Colors

Modify `src/egg/lib/blobbi-egg-validation.ts` to add your own color palettes:

```typescript
export const VALID_BASE_COLORS = {
  common: ['#ffffff', '#f2f2f2', '#mycolor'],
  // ...
};
```

#### Change Animations

Edit `src/egg/styles/egg-animations.css`:

```css
@keyframes egg-gentle-sway {
  /* Modify animation here */
}
```

#### Add New Special Marks

1. Add SVG to `src/egg/components/SpecialMarkRenderer.tsx`
2. Add to `AVAILABLE_SPECIAL_MARKS` in `src/egg/lib/special-marks-utils.ts`
3. Add validation in `src/egg/lib/blobbi-egg-validation.ts`

### Best Practices

#### 1. Always Import from Module Root

✅ Good:
```tsx
import { EggGraphic } from './egg';
```

❌ Bad:
```tsx
import { EggGraphic } from './egg/components/EggGraphic';
```

#### 2. Use TypeScript Types

```tsx
import type { EggVisualBlobbi } from './egg';

const myEgg: EggVisualBlobbi = {
  // TypeScript will validate this object
};
```

#### 3. Validate Egg Properties

```tsx
import { validateEggProperties } from './egg';

const result = validateEggProperties({
  base_color: userInput.color,
  special_mark: userInput.mark,
});

if (!result.isValid) {
  console.error('Invalid egg:', result.errors);
}
```

#### 4. Check Divine Eggs

```tsx
import { isDivineEgg, DIVINE_BASE_COLOR } from './egg';

if (isDivineEgg(myEgg)) {
  // Handle divine egg special case
}
```

### Module Independence

This module is **completely independent** and has:
- ✅ No path aliases (`@/...`)
- ✅ **Only React as external dependency**
- ✅ All types self-contained
- ✅ CSS bundled and imported internally
- ✅ No framework-specific dependencies

You can use it in:
- Next.js projects
- Create React App
- Vite projects
- Remix projects
- Any React-based project

### Support

For issues specific to this module in your new project:
1. Check the demo component works
2. Verify React is installed
3. Check bundler configuration for CSS imports support
4. Ensure TypeScript paths are configured correctly (if using path aliases)
