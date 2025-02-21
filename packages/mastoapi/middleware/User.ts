import type { NostrSigner, NRelay } from '@nostrify/nostrify';

export interface User<S extends NostrSigner = NostrSigner, R extends NRelay = NRelay> {
  signer: S;
  relay: R;
}
