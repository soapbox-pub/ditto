import { Context, getPublicKey } from '@/deps.ts';

function getKeys(c: Context) {
  const auth = c.req.headers.get('Authorization') || '';

  if (auth.startsWith('Bearer ')) {
    const privatekey = auth.split('Bearer ')[1];
    const pubkey = getPublicKey(privatekey);

    return {
      privatekey,
      pubkey,
    };
  }
}

export { getKeys };
