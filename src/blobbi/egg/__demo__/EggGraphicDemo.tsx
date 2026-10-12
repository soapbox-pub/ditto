/**
 * Blobbi Egg Visual System - Demo Component
 *
 * This component demonstrates the EggGraphic component with various configurations.
 * Use this to verify the module works after copying to a new project.
 *
 * NOTE: This file is NOT exported from the module index - it's only for testing.
 */

import React, { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { EggGraphic } from '../components/EggGraphic';
import type { EggVisualBlobbi } from '../types/egg.types';

export const EggGraphicDemo: React.FC = () => {
  const intl = useIntl();
  const [animated, setAnimated] = useState(true);
  const [cracking, setCracking] = useState(false);

  // Demo eggs with different configurations
  const demoEggs: Array<{ key: string; name: string; egg: EggVisualBlobbi }> = [
    {
      key: 'basic',
      name: intl.formatMessage({ id: 'eggDemo.basicCommonEgg', defaultMessage: 'Basic Common Egg' }),
      egg: {
        baseColor: '#f2f2f2',
        lifeStage: 'egg',
      },
    },
    {
      key: 'specialMark',
      name: intl.formatMessage({ id: 'eggDemo.specialMarkEgg', defaultMessage: 'Egg with Special Mark' }),
      egg: {
        baseColor: '#ffffcc',
        specialMark: 'dot_center',
        lifeStage: 'egg',
      },
    },
    {
      key: 'rare',
      name: intl.formatMessage({ id: 'eggDemo.rareEgg', defaultMessage: 'Rare Egg with Title' }),
      egg: {
        baseColor: '#cc99ff',
        secondaryColor: '#ff99ff',
        specialMark: 'sigil_eye',
        title: 'The Primordial',
        lifeStage: 'egg',
      },
    },
    {
      key: 'divine',
      name: intl.formatMessage({ id: 'eggDemo.divineEgg', defaultMessage: 'Divine Egg' }),
      egg: {
        baseColor: '#55C4A2',
        specialMark: 'divine_wordmark',
        themeVariant: 'divine',
        crossoverApp: 'divine',
        lifeStage: 'egg',
        tags: [
          ['theme', 'divine'],
          ['crossover_app', 'divine'],
        ],
      },
    },
    {
      key: 'pattern',
      name: intl.formatMessage({ id: 'eggDemo.patternEgg', defaultMessage: 'Egg with Pattern' }),
      egg: {
        baseColor: '#99ccff',
        secondaryColor: '#ccffcc',
        pattern: 'gradient',
        specialMark: 'oval_spots',
        lifeStage: 'egg',
      },
    },
    {
      key: 'legendary',
      name: intl.formatMessage({ id: 'eggDemo.legendaryEgg', defaultMessage: 'Legendary Egg' }),
      egg: {
        baseColor: '#6633cc',
        secondaryColor: '#9933ff',
        specialMark: 'rune_top',
        title: 'Defender of the Grove',
        lifeStage: 'egg',
      },
    },
  ];

  return (
    <div style={{ padding: '2rem', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          <FormattedMessage id="eggDemo.title" defaultMessage="Blobbi Egg Visual System Demo" />
        </h1>

        <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={animated}
              onChange={(e) => setAnimated(e.target.checked)}
            />
            <FormattedMessage id="eggDemo.animated" defaultMessage="Animated" />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={cracking}
              onChange={(e) => setCracking(e.target.checked)}
            />
            <FormattedMessage id="eggDemo.cracking" defaultMessage="Cracking" />
          </label>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '2rem',
          }}
        >
          {demoEggs.map(({ key, name, egg }) => (
            <div
              key={key}
              style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '1.5rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
            >
              <h3
                style={{
                  fontSize: '1rem',
                  fontWeight: '600',
                  marginBottom: '1rem',
                  textAlign: 'center',
                }}
              >
                {name}
              </h3>

              {/* Container with fixed aspect ratio */}
              <div
                style={{
                  width: '100%',
                  aspectRatio: '1 / 1.25',
                  position: 'relative',
                }}
              >
                <EggGraphic blobbi={egg} animated={animated} cracking={cracking} />
              </div>

              {/* Egg properties */}
              <div
                style={{
                  marginTop: '1rem',
                  fontSize: '0.75rem',
                  color: '#666',
                  lineHeight: '1.4',
                }}
              >
                <div><FormattedMessage id="eggDemo.base" defaultMessage="Base: {value}" values={{ value: egg.baseColor }} /></div>
                {egg.secondaryColor && <div><FormattedMessage id="eggDemo.secondary" defaultMessage="Secondary: {value}" values={{ value: egg.secondaryColor }} /></div>}
                {egg.specialMark && <div><FormattedMessage id="eggDemo.mark" defaultMessage="Mark: {value}" values={{ value: egg.specialMark }} /></div>}
                {egg.pattern && <div><FormattedMessage id="eggDemo.pattern" defaultMessage="Pattern: {value}" values={{ value: egg.pattern }} /></div>}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: '3rem',
            padding: '1.5rem',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        >
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
            <FormattedMessage id="eggDemo.usage" defaultMessage="Usage Instructions" />
          </h2>
          <pre
            style={{
              backgroundColor: '#f5f5f5',
              padding: '1rem',
              borderRadius: '4px',
              overflow: 'auto',
              fontSize: '0.875rem',
            }}
          >
            {`import { EggGraphic } from './egg';

const myEgg = {
  baseColor: '#f2f2f2',
  specialMark: 'dot_center',
  lifeStage: 'egg',
};

<EggGraphic 
  blobbi={myEgg} 
  animated={true}
  cracking={false}
  warmth={50}  // fallback warmth for glow effect
/>`}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default EggGraphicDemo;
