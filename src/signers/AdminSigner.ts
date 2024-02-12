import { Conf } from '@/config.ts';
import { NSecSigner } from '@/deps.ts';

/** Sign events as the Ditto server. */
export class AdminSigner extends NSecSigner {
  constructor() {
    super(Conf.seckey);
  }
}
