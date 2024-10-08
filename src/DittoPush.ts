import { ApplicationServer, PushMessageOptions, PushSubscriber, PushSubscription } from '@negrel/webpush';

import { Conf } from '@/config.ts';
import { Storages } from '@/storages.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';

export class DittoPush {
  static _server: Promise<ApplicationServer> | undefined;

  static get server(): Promise<ApplicationServer> {
    if (!this._server) {
      this._server = (async () => {
        const store = await Storages.db();
        const meta = await getInstanceMetadata(store);

        return await ApplicationServer.new({
          contactInformation: `mailto:${meta.email}`,
          vapidKeys: await Conf.vapidKeys,
        });
      })();
    }

    return this._server;
  }

  static async push(
    subscription: PushSubscription,
    json: object,
    opts: PushMessageOptions = {},
  ): Promise<void> {
    const server = await this.server;
    const subscriber = new PushSubscriber(server, subscription);
    const text = JSON.stringify(json);
    return subscriber.pushTextMessage(text, opts);
  }
}
