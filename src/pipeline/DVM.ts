import { NIP05, NostrEvent } from '@nostrify/nostrify';

import { Conf } from '@/config.ts';
import * as pipeline from '@/pipeline.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { Storages } from '@/storages.ts';

export class DVM {
  static async event(event: NostrEvent): Promise<void> {
    switch (event.kind) {
      case 5950:
        await DVM.nameRegistration(event);
        break;
    }
  }

  static async nameRegistration(event: NostrEvent): Promise<void> {
    const admin = await new AdminSigner().getPublicKey();
    const input = event.tags.find(([name]) => name === 'i')?.[1];
    const tagged = !!event.tags.find(([name, value]) => name === 'p' && value === admin);

    if (!input || !NIP05.regex().test(input)) {
      return DVM.feedback(event, 'error', `Invalid name: ${input}`);
    }

    const [user, host] = input.split('@');
    const nip05 = `${user}@${host}`;

    if ((Conf.url.host !== host) && tagged) {
      return DVM.feedback(event, 'error', `Unsupported domain: ${host}`);
    }

    if (user === '_') {
      return DVM.feedback(event, 'error', `Forbidden user: ${user}`);
    }

    const store = await Storages.db();

    const [label] = await store.query([{
      kinds: [1985],
      authors: [admin],
      '#L': ['nip05'],
      '#l': [nip05],
    }]);

    if (label) {
      return DVM.feedback(event, 'error', `Name already taken: ${nip05}`);
    }

    await DVM.label(nip05, event.pubkey);
    await DVM.result(event, nip05);
  }

  static async feedback(
    event: NostrEvent,
    status: 'payment-required' | 'processing' | 'error' | 'success' | 'partial',
    info = '',
  ): Promise<void> {
    const feedback = await new AdminSigner().signEvent({
      kind: 7000,
      content: '',
      tags: [
        ['status', status, info],
        ['e', event.id],
        ['p', event.pubkey],
      ],
      created_at: Math.floor(Date.now() / 1000),
    });
    return pipeline.handleEvent(feedback, AbortSignal.timeout(1000));
  }

  static async label(nip05: string, pubkey: string): Promise<void> {
    const label = await new AdminSigner().signEvent({
      kind: 1985,
      tags: [
        ['L', 'nip05'],
        ['l', nip05, 'nip05'],
        ['p', pubkey],
      ],
      content: '',
      created_at: Math.floor(Date.now() / 1000),
    });
    return pipeline.handleEvent(label, AbortSignal.timeout(1000));
  }

  static async result(event: NostrEvent, nip05: string): Promise<void> {
    const result = await new AdminSigner().signEvent({
      kind: 6950,
      content: nip05,
      tags: [
        ['request', JSON.stringify(event)],
        ['i', nip05, 'text'],
        ['e', event.id],
        ['p', event.pubkey],
      ],
      created_at: Math.floor(Date.now() / 1000),
    });
    return pipeline.handleEvent(result, AbortSignal.timeout(1000));
  }
}
