import { DEV_SIGNUP_PUBKEY, recordDevSignupViolation } from '@/dev/devSignupArrival';

/**
 * The fake user handed to the application during a simulated signup.
 *
 * Shaped like an `NUser` in the only ways the arrival path actually reads: a
 * `pubkey`, a `method`, and a `signer`. Everything on the signer throws.
 *
 * Throwing rather than returning a stub is the point. Nothing can be published
 * without `signEvent`, and nothing can be written to encrypted settings without
 * `nip44.encrypt`, so a signer that refuses every call turns "we promise not to
 * publish" into something the code cannot do even by accident. The violation
 * counters on the dev page are read from these handlers, not decorated on.
 *
 * `nip44` is deliberately **absent** rather than throwing: `useEncryptedSettings`
 * reports `hasNip44Support: false` for a signer without it, which makes
 * `MissionEngine` skip initialization entirely. That is the difference between
 * "the settings write fails loudly" and "the settings write is never reached",
 * and the second is what keeps a run at zero attempts.
 */
function forbid(method: string): never {
  recordDevSignupViolation('signerCalls', `signer.${method}() was called`);
  throw new Error(
    `[dev-signup-arrival] signer.${method}() is not available in the simulation. ` +
      'Nothing may be signed or published by the fake account.',
  );
}

export interface DevSignupUser {
  pubkey: string;
  method: string;
  signer: {
    getPublicKey: () => Promise<string>;
    signEvent: (...args: unknown[]) => never;
    nip04?: undefined;
    nip44?: undefined;
  };
}

export function createDevSignupUser(): DevSignupUser {
  return {
    pubkey: DEV_SIGNUP_PUBKEY,
    method: 'x-dev-signup-arrival',
    signer: {
      // Safe: reading the key publishes nothing and is what identity checks use.
      getPublicKey: () => Promise.resolve(DEV_SIGNUP_PUBKEY),
      signEvent: () => forbid('signEvent'),
    },
  };
}
