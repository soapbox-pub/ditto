import { z } from '@/deps.ts';

type ElixirValue =
  | string
  | number
  | boolean
  | null
  | ElixirTuple
  | ElixirValue[]
  | { [key: string]: ElixirValue };

interface ElixirTuple {
  tuple: [string, ElixirValue];
}

interface Config {
  group: string;
  key: string;
  value: ElixirValue;
}

const baseElixirValueSchema: z.ZodType<ElixirValue> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.lazy(() => elixirValueSchema.array()),
  z.lazy(() => z.record(z.string(), elixirValueSchema)),
]);

const elixirTupleSchema: z.ZodType<ElixirTuple> = z.object({
  tuple: z.tuple([z.string(), z.lazy(() => elixirValueSchema)]),
});

const elixirValueSchema: z.ZodType<ElixirValue> = z.union([
  baseElixirValueSchema,
  elixirTupleSchema,
]);

const configSchema: z.ZodType<Config> = z.object({
  group: z.string(),
  key: z.string(),
  value: elixirValueSchema,
});

export { type Config, configSchema, type ElixirTuple, elixirTupleSchema, type ElixirValue };