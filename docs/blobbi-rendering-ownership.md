# Blobbi rendering ownership

Who owns which part of a Blobbi on screen, after the migration to the shared
Blobbi foundation (blobbi-kit Milestone 3).

```
kind 31124 event
   ↓  @blobbi-kit/core          parse, validate, legacy detection, seed →
   ↓                            traits, adult form, visual identity
   ↓  @blobbi-kit/react         headless hooks (collection, actions, missions)
   ↓  Ditto adapters            BlobbiCompanion / CompanionData → RenderableBlobbi
   ↓                            (src/blobbi/ui/lib/adapters.ts, via getBlobbiVisualIdentity)
   ↓  @blobbi/renderer          the canonical BODY: anatomy, V1 forms, Baby V1,
   ↓                            trait colours, per-instance SVG ids, V2 views
   ↓                            (src/blobbi/ui/lib/canonical-base.ts)
   ↓  Ditto eye animation       blink clip-paths + gaze groups   (ui/lib/eye-animation.ts)
   ↓  Ditto expression recipes  emotions, status reactions, mouths, eyebrows,
   ↓                            body effects                      (ui/lib/recipe.ts …)
   ↓  Ditto sanitizer           output boundary                   (lib/sanitizeBlobbiSvg.ts)
   ↓  Ditto presentation        BlobbiStageVisual, companion shell, cards, HUD
```

## Ownership table

| Concern | Owner | Where |
| --- | --- | --- |
| Event parsing, validation, legacy detection | `@blobbi-kit/core` | `parseBlobbiEvent`, `isLegacyBlobbiEvent` |
| Adult form resolution (explicit → seed → default) | `@blobbi-kit/core` | `resolveAdultForm` |
| Visual identity projection | `@blobbi-kit/core` | `getBlobbiVisualIdentity` |
| Nostr/React data hooks | `@blobbi-kit/react` | `useBlobbisCollection`, care hooks |
| Base body: Adult V1 (16 forms), Baby V1, colours, ids | `@blobbi/renderer` | `renderBlobbiSvg` |
| Adult V2 anatomy, front/side/back views, closed eyes | `@blobbi/renderer` | same |
| Egg / incubation visuals and behaviour | Ditto | `src/blobbi/egg`, `BlobbiEggVisual` |
| Blink lifecycle, pointer eye tracking | Ditto | `useBlobbiEyes`, `useExternalEyeOffset` |
| Sleeping presentation (closed-eye overlay, Zzz) | Ditto | recipe `sleepy` + eye clip |
| Expressions, status reactions, body effects | Ditto | `ui/lib/recipe.ts`, `status-reactions.ts`, `bodyEffects` |
| Companion movement, drag, float, placement | Ditto | `src/blobbi/companion` |
| Sanitization before `dangerouslySetInnerHTML` | Ditto | `sanitizeBlobbiSvg` |
| Product UI (page, cards, HUD, rooms, shop) | Ditto | everywhere else |

## The one boundary

`renderCanonicalBaseSvg(blobbi, { stage, instanceId, facing })` in
`src/blobbi/ui/lib/canonical-base.ts` is the only place Ditto asks for a body.
It always requests the AWAKE drawing (sleeping is Ditto's overlay) with the
renderer's own gaze markup OFF (Ditto's eye hooks are the single eye transform
and RAF loop per visual), and it resolves the adult form with the domain kit
so a Blobbi without an explicit form keeps the body its seed always gave it.

Everything downstream is a string-to-string transformation that ran on the
old local generator and runs unchanged on the canonical one. The
`data-blobbi-body`, `data-blobbi-skip`, `<!-- Mouth -->` and `<!-- Pupils -->`
markers Ditto's layers look for are present in the canonical artwork.

## What changed visibly

Nothing, for V1, with two deliberate exceptions measured against the old
engine (all 16 forms and the baby, four colour sets, ten expression recipes,
normalised for whitespace, comments and XML declarations):

- **eyeColor now applies on all 16 adult forms.** Ditto's copy of the artwork
  had been minified and lost the `<!-- Pupils -->` block the flat-fill forms
  rely on, so twelve forms ignored the eye colour. The canonical artwork keeps
  the block.
- **Catti's expression mouth is centred.** Its mouth is two Q-curve halves;
  without the `<!-- Mouth -->` marker the regex fallback replaced only the
  first half (centre x = 91). With the marker both halves are replaced (x = 100).

Everything else is byte-identical after normalisation.

## Visual generation

`visual_generation` is identity, read by `@blobbi-kit/core`:

| tag | draws |
| --- | --- |
| absent (every existing Blobbi) | V1 |
| `["visual_generation", "v2"]` | Adult V2 (a V2 baby draws the V1 baby) |
| any other value | V1 |

The field flows `BlobbiCompanion.visualGeneration` → adapters →
`RenderableBlobbi.visualGeneration` → `CompanionData.visualGeneration` →
`renderCanonicalBaseSvg`. Ditto is compatible with V2 today (a synthetic V2
renders front/right/left/back through every layer, see
`BlobbiSvgRenderer.composition.test.tsx`), but **V2 rollout is not part of
this milestone**: nothing creates the tag, no Blobbi is converted, evolution
still produces V1, and there is no user-facing switch. Ditto's expression
recipes are V1-shaped (they detect circles/ellipses and Q-curve mouths) and
leave a V2 body untouched; teaching them the V2 `data-part` contract is future
work.

## Sanitizer

`sanitizeBlobbiSvg` still runs on every body. It admits exactly two things for
the canonical V2 artwork: `<filter>` containing `<feGaussianBlur>` (soft
shadows) and a fragment-only `href`/`xlink:href` on a gradient element
(gradient inheritance). Every other `href`, `<use>`, `<image>`, `<a>`, script,
event handler and filter primitive stays blocked.

## Dependencies (development)

The three packages are npm `file:` links to the sibling `blobbi-kit` checkout
(`@blobbi-kit/core` 0.5.1, `@blobbi-kit/react` 0.5.1, `@blobbi/renderer`
0.1.0) until they are published; `npm run build` in blobbi-kit refreshes them.
Vite serves the linked `dist/`, keeps them out of pre-bundling, pins React to
Ditto's copy and dedupes the context singletons. `src/blobbi/canonical-packages.test.tsx`
pins all of this and proves a single React runtime.
