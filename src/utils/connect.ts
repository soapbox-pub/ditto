import { Conf } from '@/config.ts';
import { Storages } from '@/storages.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';

/** NIP-46 client-connect metadata. */
interface ConnectMetadata {
  name: string;
  description: string;
  url: string;
}

/** Get NIP-46 `nostrconnect://` URI for the Ditto server. */
export async function getClientConnectUri(signal?: AbortSignal): Promise<string> {
  const uri = new URL('nostrconnect://');
  const { name, tagline } = await getInstanceMetadata(await Storages.db(), signal);

  const metadata: ConnectMetadata = {
    name,
    description: tagline,
    url: Conf.localDomain,
  };

  uri.host = Conf.pubkey;
  uri.searchParams.set('relay', Conf.relay);
  uri.searchParams.set('metadata', JSON.stringify(metadata));

  return uri.toString();
}
