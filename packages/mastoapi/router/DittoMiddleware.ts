import type { MiddlewareHandler } from '@hono/hono';
import type { DittoEnv } from './DittoEnv.ts';

// deno-lint-ignore ban-types
export type DittoMiddleware<T extends {} = {}> = MiddlewareHandler<DittoEnv & { Variables: T }>;
