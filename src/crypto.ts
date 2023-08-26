import { Conf } from '@/config.ts';
import { nip04 } from '@/deps.ts';

/** Encrypt a message as the Ditto server account. */
function encryptAdmin(targetPubkey: string, message: string): Promise<string> {
  return nip04.encrypt(Conf.seckey, targetPubkey, message);
}

/** Decrypt a message as the Ditto server account. */
function decryptAdmin(targetPubkey: string, message: string): Promise<string> {
  return nip04.decrypt(Conf.seckey, targetPubkey, message);
}

export { decryptAdmin, encryptAdmin };
