import { Conf } from '@/config.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';

/** Get NIP-46 `nostrconnect://` URI for the Ditto server. */
export async function getClientConnectUri(signal?: AbortSignal): Promise<string> {
  const uri = new URL('nostrconnect://');
  const { name, description } = await getInstanceMetadata(signal);

  const metadata = {
    name,
    description,
    url: Conf.localDomain,
  };

  uri.host = Conf.pubkey;
  uri.searchParams.set('relay', Conf.relay);
  uri.searchParams.set('metadata', JSON.stringify(metadata));

  return uri.toString();
}
