/**
 * THE KIT'S REFERENCE BLOBBIS: test fixture data.
 *
 * blobbi-kit pins `visual_algorithm = 1` with twelve complete V3 identities
 * (`packages/blobbi-renderer/src/artwork/v3/reference/cases.ts`, kit commit
 * f3acbf4). They are not exported by the package, so they are copied here,
 * literally (the same copy Blobbi Standalone carries), as TEST FIXTURE DATA
 * (the mouth and sanitizer tests sweep them): nothing is derived, and the
 * kit decides everything about how they look.
 *
 * Between them they carry every kind of every trait, a mark in every region,
 * and a very pale body with no accent colour. The last two are exactly what
 * creation gave their seeds.
 */
import type { BlobbiV3Identity } from '@blobbi-kit/renderer';

export interface ReferenceBlobbi {
  name: string;
  identity: BlobbiV3Identity;
}

export const V3_REFERENCE_BLOBBIS: readonly ReferenceBlobbi[] = [
  {
    name: 'plain',
    identity: {
      seed: 'b6b123d930eef236722122dc5c3aeb928b33e8903e87fb31c626abaede894f4d',
      algorithm: 1,
      colors: { base: '#eb66a0', secondary: '#ac1518', eye: '#430e1e' },
      traits: { antenna: 'none', horns: 'none', ears: 'none', tail: 'none', pattern: 'solid', specialMark: 'none', belly: false, freckles: false },
    },
  },
  {
    name: 'antennae',
    identity: {
      seed: '9efb6e660ccdeedb7cf739c667e71bc2842e2c2318aae499f2c70e11f2c7b42f',
      algorithm: 1,
      colors: { base: '#85e44f', secondary: '#009267', eye: '#0e2102' },
      traits: { antenna: 'double', horns: 'none', ears: 'none', tail: 'none', pattern: 'solid', specialMark: 'none', belly: false, freckles: false },
    },
  },
  {
    name: 'ears-and-horns',
    identity: {
      seed: '3182f34c27357835ea7b551f60b5ad0c32452f1ad98725c6e5dfb328d6a07f86',
      algorithm: 1,
      colors: { base: '#cd5eda', secondary: '#5a09ac', eye: '#431f31' },
      traits: { antenna: 'none', horns: 'side', ears: 'round', tail: 'none', pattern: 'solid', specialMark: 'none', belly: false, freckles: false },
    },
  },
  {
    name: 'tail',
    identity: {
      seed: '0e7fed6ddf4931589f0811a5cbf98f50d69c39f663940965e4c382acee280e1f',
      algorithm: 1,
      colors: { base: '#7a69e9', secondary: '#004684', eye: '#38214a' },
      traits: { antenna: 'none', horns: 'none', ears: 'none', tail: 'curl', pattern: 'solid', specialMark: 'none', belly: true, freckles: false },
    },
  },
  {
    name: 'spotted',
    identity: {
      seed: '32603d246c50229d05661a40986af7eca6146557b83448ec06574a0027894165',
      algorithm: 1,
      colors: { base: '#bb6be6', secondary: '#860065', eye: '#20320f', accent: '#9ada63' },
      traits: { antenna: 'single', horns: 'none', ears: 'none', tail: 'nub', pattern: 'spotted', specialMark: 'none', belly: false, freckles: false },
    },
  },
  {
    name: 'striped',
    identity: {
      seed: 'ebb5da1dda7f2fb2af3064c977606d853494d0a1f7bf2e2417ba1fbf9031c451',
      algorithm: 1,
      colors: { base: '#f05a2b', secondary: '#9b0048', eye: '#002c36', accent: '#5ab8d0' },
      traits: { antenna: 'none', horns: 'forehead', ears: 'none', tail: 'none', pattern: 'striped', specialMark: 'none', belly: false, freckles: true },
    },
  },
  {
    name: 'gradient',
    identity: {
      seed: '85f3acae8106e4998ad22d639a8b41d971bd0ace4633b4f31f4d2492363d1c40',
      algorithm: 1,
      colors: { base: '#52d399', secondary: '#008780', eye: '#00362c' },
      traits: { antenna: 'none', horns: 'none', ears: 'pointed', tail: 'leaf', pattern: 'gradient', specialMark: 'sparkle', belly: false, freckles: false },
    },
  },
  {
    name: 'special-mark',
    identity: {
      seed: '75e3f1e04e2d689ec403b47fa63a81bee90cfe616c09e380e6657652c0556bce',
      algorithm: 1,
      colors: { base: '#ae57dd', secondary: '#4300a7', eye: '#3a193f' },
      traits: { antenna: 'none', horns: 'none', ears: 'none', tail: 'none', pattern: 'solid', specialMark: 'star', belly: false, freckles: false },
    },
  },
  {
    name: 'crowded-crown',
    identity: {
      seed: 'e7ddbe425cbd343679da4e24d40628213cb88815b9c1bc96956191501e827aea',
      algorithm: 1,
      colors: { base: '#42a6ce', secondary: '#005c69', eye: '#341000', accent: '#e98956' },
      traits: { antenna: 'double', horns: 'top', ears: 'pointed', tail: 'curl', pattern: 'spotted', specialMark: 'heart', belly: true, freckles: true },
    },
  },
  {
    name: 'light-palette',
    identity: {
      seed: '3157f17cae76b9e062dd3eda81561af0d0cb48e0b51c049fd0bae94881518b3e',
      algorithm: 1,
      colors: { base: '#f4ead6', secondary: '#dcc79c', eye: '#6b4a2b' },
      traits: { antenna: 'single', horns: 'none', ears: 'round', tail: 'none', pattern: 'solid', specialMark: 'moon', belly: true, freckles: true },
    },
  },
  {
    name: 'as-created-1',
    identity: {
      seed: '31bb4983c5a1f44b80cdbebe9c0ec601ff9a37a845b8b8a4c4d37f32c2ff8b6e',
      algorithm: 1,
      colors: { base: '#4bd4a8', secondary: '#3e8026', eye: '#003229' },
      traits: { antenna: 'double', horns: 'forehead', ears: 'none', tail: 'curl', pattern: 'spotted', specialMark: 'none', belly: false, freckles: false },
    },
  },
  {
    name: 'as-created-2',
    identity: {
      seed: '87d874be679bdd9edb4a1f14712f15fac4979e1519516d68c9b6acd621f3b0c8',
      algorithm: 1,
      colors: { base: '#e456b9', secondary: '#8c002c', eye: '#0d3423', accent: '#63cf9d' },
      traits: { antenna: 'single', horns: 'none', ears: 'round', tail: 'nub', pattern: 'solid', specialMark: 'sparkle', belly: false, freckles: false },
    },
  },
];
