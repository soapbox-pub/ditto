// Starts up applications required to run before the HTTP server is on.
import { logi } from '@soapbox/logi';
import { encodeHex } from '@std/encoding/hex';

import { Conf } from '@/config.ts';
import { cron } from '@/cron.ts';
import { startFirehose } from '@/firehose.ts';
import { startNotify } from '@/notify.ts';

logi.handler = (log) => {
  console.log(JSON.stringify(log, (_key, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (value instanceof Uint8Array) {
      return '\\x' + encodeHex(value);
    }

    return value;
  }));
};

if (Conf.firehoseEnabled) {
  startFirehose();
}

if (Conf.notifyEnabled) {
  startNotify();
}

if (Conf.cronEnabled) {
  cron();
}
