import { DittoConf } from '@ditto/conf';
import { ApplicationServer, PushMessageOptions, PushSubscriber, PushSubscription } from '@negrel/webpush';
import { NStore } from '@nostrify/types';
import { logi } from '@soapbox/logi';

import { getInstanceMetadata } from '@/utils/instance.ts';

interface DittoPushOpts {
  conf: DittoConf;
  relay: NStore;
}

export class DittoPush {
  private server: Promise<ApplicationServer | undefined>;

  constructor(opts: DittoPushOpts) {
    const { conf } = opts;

    this.server = (async () => {
      const meta = await getInstanceMetadata(opts);
      const keys = await conf.vapidKeys;

      if (keys) {
        return await ApplicationServer.new({
          contactInformation: `mailto:${meta.email}`,
          vapidKeys: keys,
        });
      } else {
        logi({
          level: 'warn',
          ns: 'ditto.push',
          msg: 'VAPID keys are not set. Push notifications will be disabled.',
        });
      }
    })();
  }

  async push(
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
