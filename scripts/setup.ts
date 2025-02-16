import { generateVapidKeys } from '@negrel/webpush';
import { encodeBase64 } from '@std/encoding/base64';
import { exists } from '@std/fs/exists';
import { generateSecretKey, nip19 } from 'nostr-tools';
import question from 'question-deno';

import { Conf } from '../packages/ditto/config.ts';

console.log('');
console.log('Hello! Welcome to the Ditto setup tool. We will ask you a few questions to generate a .env file for you.');
console.log('');
console.log('- Ditto docs: https://docs.soapbox.pub/ditto/');

if (await exists('./.env')) {
  console.log('- Your existing .env file will be overwritten.');
}

console.log('- Press Ctrl+D to exit at any time.');
console.log('');

const vars: Record<string, string | undefined> = {};

const DITTO_NSEC = Deno.env.get('DITTO_NSEC');

if (DITTO_NSEC) {
  const choice = await question('list', 'Looks like you already have a DITTO_NSEC. Should we keep it?', [
    'keep',
    'create new (destructive)',
  ]);
  if (choice === 'keep') {
    vars.DITTO_NSEC = DITTO_NSEC;
  }
  if (choice === 'create new (destructive)') {
    vars.DITTO_NSEC = nip19.nsecEncode(generateSecretKey());
    console.log('  Generated secret key\n');
  }
} else {
  vars.DITTO_NSEC = nip19.nsecEncode(generateSecretKey());
  console.log('  Generated secret key\n');
}

const domain = await question('input', 'What is the domain of your instance? (eg ditto.pub)', Conf.url.host);
vars.LOCAL_DOMAIN = `https://${domain}`;

const DATABASE_URL = Deno.env.get('DATABASE_URL');

if (DATABASE_URL) {
  vars.DATABASE_URL = await question('input', 'Database URL', DATABASE_URL);
} else {
  const database = await question('list', 'Which database do you want to use?', ['postgres', 'pglite']);
  if (database === 'pglite') {
    const path = await question('input', 'Path to PGlite data directory', 'data/pgdata');
    vars.DATABASE_URL = `file://${path}`;
  }
  if (database === 'postgres') {
    const host = await question('input', 'Postgres host', 'localhost');
    const port = await question('input', 'Postgres port', '5432');
    const user = await question('input', 'Postgres user', 'ditto');
    const password = await question('password', 'Postgres password', true);
    const database = await question('input', 'Postgres database', 'ditto');
    vars.DATABASE_URL = `postgres://${user}:${password}@${host}:${port}/${database}`;
  }
}

vars.DITTO_UPLOADER = await question('list', 'How do you want to upload files?', [
  'nostrbuild',
  'blossom',
  's3',
  'ipfs',
  'local',
]);

if (vars.DITTO_UPLOADER === 'nostrbuild') {
  vars.NOSTRBUILD_ENDPOINT = await question('input', 'nostr.build endpoint', Conf.nostrbuildEndpoint);
}
if (vars.DITTO_UPLOADER === 'blossom') {
  vars.BLOSSOM_SERVERS = await question('input', 'Blossom servers (comma separated)', Conf.blossomServers.join(','));
}
if (vars.DITTO_UPLOADER === 's3') {
  vars.S3_ACCESS_KEY = await question('input', 'S3 access key', Conf.s3.accessKey);
  vars.S3_SECRET_KEY = await question('input', 'S3 secret key', Conf.s3.secretKey);
  vars.S3_ENDPOINT = await question('input', 'S3 endpoint', Conf.s3.endPoint);
  vars.S3_BUCKET = await question('input', 'S3 bucket', Conf.s3.bucket);
  vars.S3_REGION = await question('input', 'S3 region', Conf.s3.region);
  vars.S3_PATH_STYLE = String(await question('confirm', 'Use path style?', Conf.s3.pathStyle ?? false));
  const mediaDomain = await question('input', 'Media domain', `media.${domain}`);
  vars.MEDIA_DOMAIN = `https://${mediaDomain}`;
}
if (vars.DITTO_UPLOADER === 'ipfs') {
  vars.IPFS_API_URL = await question('input', 'IPFS API URL', Conf.ipfs.apiUrl);
  const mediaDomain = await question('input', 'Media domain', `media.${domain}`);
  vars.MEDIA_DOMAIN = `https://${mediaDomain}`;
}
if (vars.DITTO_UPLOADER === 'local') {
  vars.UPLOADS_DIR = await question('input', 'Local uploads directory', Conf.uploadsDir);
  const mediaDomain = await question('input', 'Media domain', `media.${domain}`);
  vars.MEDIA_DOMAIN = `https://${mediaDomain}`;
}

const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
if (VAPID_PRIVATE_KEY) {
  vars.VAPID_PRIVATE_KEY = VAPID_PRIVATE_KEY;
} else {
  const { privateKey } = await generateVapidKeys({ extractable: true });
  const bytes = await crypto.subtle.exportKey('pkcs8', privateKey);
  vars.VAPID_PRIVATE_KEY = encodeBase64(bytes);
}

console.log('Writing to .env file...');

const result = Object.entries(vars).reduce((acc, [key, value]) => {
  if (value) {
    return `${acc}${key}="${value}"\n`;
  }
  return acc;
}, '');

await Deno.writeTextFile('./.env', result);

console.log('Done');
