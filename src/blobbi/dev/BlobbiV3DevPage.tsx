/**
 * /blobbi/dev/v3 — development only (the route exists only in `vite dev`).
 *
 * V3 Blobbis as Ditto draws them, for looking at: every Blobbi here is a kind
 * 31124 event's tags, parsed by the kit exactly as one from a relay would be,
 * and drawn by the same components the app uses (BlobbiStageVisual, the
 * floating companion's visual). Nothing is published.
 */

import { useRef, useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  KIND_BLOBBI_STATE,
  buildEggTags,
  deriveBlobbiSeedV1,
  getCanonicalBlobbiD,
  parseBlobbiEvent,
  updateBlobbiTags,
  type BlobbiCompanion,
  type BlobbiV3Identity,
  type BlobbiVisualGeneration,
} from '@blobbi-kit/core';

import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { BlobbiCompanionVisual } from '@/blobbi/companion/components/BlobbiCompanionVisual';
import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotion-types';
import { EMOTION_RECIPES } from '@/blobbi/ui/lib/recipe';

import { V3_REFERENCE_BLOBBIS } from './v3-reference';

const PUBKEY = 'd17c0de0'.repeat(8);
const CREATED_AT = 1_757_000_000;
type Stage = 'egg' | 'baby' | 'adult';

/** Not what its seed would choose (the identity Standalone's and Ditto's tests use). */
const UNUSUAL = (seed: string): BlobbiV3Identity => ({
  seed,
  algorithm: 1,
  colors: { base: '#2b3a67', secondary: '#ffd23f', eye: '#e85d75', accent: '#7ad3f4' },
  traits: { antenna: 'double', horns: 'side', ears: 'pointed', tail: 'leaf', pattern: 'striped', specialMark: 'moon', belly: true, freckles: true },
});

function companionOf(petId: string, stage: Stage, generation: BlobbiVisualGeneration, sleeping: boolean, identity?: BlobbiV3Identity): BlobbiCompanion | null {
  const options = generation === 'v3'
    ? { visualGeneration: 'v3' as const, v3: (seed: string) => (identity ? { ...identity, seed } : UNUSUAL(seed)) }
    : { visualGeneration: generation };
  let tags = buildEggTags(PUBKEY, petId, CREATED_AT, identity ? 'Ref' : 'Umber', options);
  if (identity) tags = tags.map((t) => (t[0] === 'seed' ? ['seed', identity.seed] : t));
  tags = updateBlobbiTags(tags, { stage, state: sleeping ? 'sleeping' : 'active' });
  const event: NostrEvent = { id: '0'.repeat(64), pubkey: PUBKEY, created_at: CREATED_AT, kind: KIND_BLOBBI_STATE, tags, content: '', sig: '0'.repeat(128) };
  return parseBlobbiEvent(event) ?? null;
}

const FULL_STATS = { hunger: 100, happiness: 100, health: 100, hygiene: 100, energy: 100 };
const EMOTIONS = Object.keys(EMOTION_RECIPES) as BlobbiEmotion[];

export function BlobbiV3DevPage() {
  const [emotion, setEmotion] = useState<BlobbiEmotion>('neutral');
  const [sleeping, setSleeping] = useState(false);
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const eyeOffsetRef = useRef({ x: 0, y: 0 });

  const unusual = (['egg', 'baby', 'adult'] as const).map((stage) => companionOf('00000000a7', stage, 'v3', sleeping));
  const walker = companionOf('00000000a7', 'adult', 'v3', false);
  const seed = deriveBlobbiSeedV1(PUBKEY, getCanonicalBlobbiD(PUBKEY, '00000000a7'), CREATED_AT);

  return (
    <main className="mx-auto max-w-5xl space-y-10 p-4 sm:p-8" data-testid="blobbi-v3-dev">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Blobbi V3 in Ditto (dev)</h1>
        <p className="text-muted-foreground">Parsed by the kit from 31124 tags, drawn by Ditto's own Blobbi components. Seed {seed.slice(0, 12)}…</p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">Emotion
            <select className="rounded border bg-background p-1" value={emotion} onChange={(e) => setEmotion(e.target.value as BlobbiEmotion)}>
              {EMOTIONS.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={sleeping} onChange={(e) => setSleeping(e.target.checked)} /> Sleeping
          </label>
          <span className="text-sm text-muted-foreground">Move the pointer: the eyes follow it.</span>
        </div>
      </header>

      <section className="space-y-3" id="unusual">
        <h2 className="text-xl font-semibold">Unusual identity: navy, yellow stripes, moon, double antennae, side horns, pointed ears, leaf tail, belly, freckles</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {unusual.map((c) => c && (
            <figure key={c.stage} className="flex flex-col items-center rounded-xl border p-4" data-stage={c.stage}>
              <BlobbiStageVisual companion={c} size="lg" animated emotion={emotion} className="size-56" />
              <figcaption className="mt-2 text-sm">{c.stage} · {c.visualGeneration}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="space-y-3" id="companion">
        <h2 className="text-xl font-semibold">Floating companion, walking</h2>
        <button className="rounded border px-3 py-1" onClick={() => setDirection((d) => (d === 'left' ? 'right' : 'left'))}>Walking {direction} (turn)</button>
        <div className="flex h-48 items-end justify-center rounded-xl border p-4">
          {walker && (
            <BlobbiCompanionVisual
              companion={{ d: walker.d, name: walker.name, stage: 'adult', visualTraits: walker.visualTraits, energy: 100, stats: FULL_STATS, state: 'active', seed: walker.seed, visualGeneration: walker.visualGeneration, v3Identity: walker.v3Identity }}
              size={140}
              eyeOffsetRef={eyeOffsetRef}
              direction={direction}
              isDragging={false}
              isWalking
              emotion={emotion}
            />
          )}
        </div>
      </section>

      <section className="space-y-3" id="references">
        <h2 className="text-xl font-semibold">The kit's twelve reference Blobbis (baby, adult)</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {V3_REFERENCE_BLOBBIS.map(({ name, identity }, i) => (
            <figure key={name} className="flex flex-col items-center rounded-xl border p-2">
              <div className="flex">
                {(['baby', 'adult'] as const).map((stage) => {
                  const c = companionOf(`0000000${(i + 16).toString(16)}0`.slice(-10), stage, 'v3', sleeping, identity);
                  return c && <BlobbiStageVisual key={stage} companion={c} size="md" emotion={emotion} />;
                })}
              </div>
              <figcaption className="text-xs">{name}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="space-y-3" id="legacy">
        <h2 className="text-xl font-semibold">V1 and V2 (Ditto's legacy pipeline, unchanged)</h2>
        <div className="flex flex-wrap gap-6">
          {(['v1', 'v2'] as const).flatMap((generation) => (['baby', 'adult'] as const).map((stage) => {
            const c = companionOf('00000000b1', stage, generation, sleeping);
            return c && (
              <figure key={`${generation}-${stage}`} className="flex flex-col items-center">
                <BlobbiStageVisual companion={c} size="lg" emotion={emotion} />
                <figcaption className="text-sm">{generation} {stage}</figcaption>
              </figure>
            );
          }))}
        </div>
      </section>
    </main>
  );
}
