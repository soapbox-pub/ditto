import { NostrRelayOK } from '@nostrify/nostrify';

export type RelayErrorPrefix = 'duplicate' | 'pow' | 'blocked' | 'rate-limited' | 'invalid' | 'error';

/** NIP-01 command line result. */
export class RelayError extends Error {
  constructor(prefix: RelayErrorPrefix, message: string) {
    super(`${prefix}: ${message}`);
  }

  /** Construct a RelayError from the reason message. */
  static fromReason(reason: string): RelayError {
    const [prefix, ...rest] = reason.split(': ');
    return new RelayError(prefix as RelayErrorPrefix, rest.join(': '));
  }

  /** Throw a new RelayError if the OK message is false. */
  static assert(msg: NostrRelayOK): void {
    const [, , ok, reason] = msg;
    if (!ok) {
      throw RelayError.fromReason(reason);
    }
  }
}
