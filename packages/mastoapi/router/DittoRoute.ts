import { type ErrorHandler, Hono } from '@hono/hono';
import { HTTPException } from '@hono/hono/http-exception';

import type { HonoOptions } from '@hono/hono/hono-base';
import type { DittoEnv } from './DittoEnv.ts';

/**
 * Ditto base route class.
 * Ensures that required variables are set for type safety.
 */
export class DittoRoute extends Hono<DittoEnv> {
  constructor(opts: HonoOptions<DittoEnv> = {}) {
    super(opts);

    this.use((c, next) => {
      this.assertVars(c.var);
      return next();
    });

    this.onError(this._errorHandler);
  }

  private assertVars(vars: Partial<DittoEnv['Variables']>): DittoEnv['Variables'] {
    if (!vars.db) this.throwMissingVar('db');
    if (!vars.conf) this.throwMissingVar('conf');
    if (!vars.relay) this.throwMissingVar('relay');
    if (!vars.signal) this.throwMissingVar('signal');

    return {
      ...vars,
      db: vars.db,
      conf: vars.conf,
      relay: vars.relay,
      signal: vars.signal,
    };
  }

  private throwMissingVar(name: string): never {
    throw new HTTPException(500, { message: `Missing required variable: ${name}` });
  }

  private _errorHandler: ErrorHandler = (error, c) => {
    if (error instanceof HTTPException) {
      if (error.res) {
        return error.res;
      } else {
        return c.json({ error: error.message }, error.status);
      }
    }

    return c.json({ error: 'Something went wrong' }, 500);
  };
}
