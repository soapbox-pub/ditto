import { NSecSigner } from '@nostrify/nostrify';
import { Conf } from '@/config.ts';

/** Sign events as the Ditto server. */
export class AdminSigner extends NSecSigner {
  constructor() {
    super(Conf.seckey);
  }
}
