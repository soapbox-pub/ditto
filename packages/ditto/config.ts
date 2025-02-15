import { DittoConfig } from '@ditto/config';

/** @deprecated Use middleware to set/get the config instead. */
export const Conf = new DittoConfig(Deno.env);
