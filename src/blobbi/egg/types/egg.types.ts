/**
 * Minimal type for egg visual rendering.
 * This type contains only the properties needed for rendering the egg graphic,
 * making the module self-contained and portable.
 */
export type EggVisualBlobbi = {
  tags?: string[][];
  baseColor?: string;
  secondaryColor?: string;
  pattern?: string;
  specialMark?: string;
  eggTemperature?: number;
  title?: string;
  lifeStage?: 'egg' | 'baby' | 'adult';
  themeVariant?: string;
  crossoverApp?: string | null;
};
