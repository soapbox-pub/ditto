import { z } from 'zod';

export const optionalBooleanSchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value !== undefined ? value === 'true' : undefined);

export const optionalNumberSchema = z
  .string()
  .optional()
  .transform((value) => value !== undefined ? Number(value) : undefined);
