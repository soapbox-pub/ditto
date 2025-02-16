import { DittoConf } from '@ditto/conf';

/** @deprecated Use middleware to set/get the config instead. */
export const Conf = new DittoConf(Deno.env);
