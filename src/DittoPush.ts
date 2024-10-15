import { ApplicationServer, PushMessageOptions, PushSubscriber, PushSubscription } from '@negrel/webpush';

import { Conf } from '@/config.ts';
import { Storages } from '@/storages.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';

export class DittoPush {
  static _server: Promise<ApplicationServer | undefined> | undefined;

  static get server(): Promise<ApplicationServer | undefined> {
    if (!this._server) {
      this._server = (async () => {
        const store = await Storages.db();
        const meta = await getInstanceMetadata(store);
        const keys = await Conf.vapidKeys;

        if (keys) {
          return await ApplicationServer.new({
            contactInformation: `mailto:${meta.email}`,
            vapidKeys: keys,
          });
        } else {
          console.warn('VAPID keys are not set. Push notifications will be disabled.');
        }
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

    if (!server) {
      return;
    }

    const subscriber = new PushSubscriber(server, subscription);
    const text = JSON.stringify(json);
    return subscriber.pushTextMessage(text, opts);
  }
}
