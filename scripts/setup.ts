import { exists } from '@std/fs/exists';
import { generateSecretKey, nip19 } from 'nostr-tools';
import question from 'question-deno';

const vars: Record<string, string | undefined> = {};

if (await exists('./.env')) {
  const overwrite = await question('confirm', 'Overwrite existing .env file? (this is a destructive action)', false);
  if (!overwrite) {
    console.log('Aborted');
    Deno.exit(0);
  }
}

console.log('Generating secret key...');
const sk = generateSecretKey();
vars.DITTO_NSEC = nip19.nsecEncode(sk);

const domain = await question('input', 'What is the domain of your instance? (eg ditto.pub)');
vars.LOCAL_DOMAIN = `https://${domain}`;

const database = await question('list', 'Which database do you want to use?', ['postgres', 'sqlite']);
if (database === 'sqlite') {
  const path = await question('input', 'Path to SQLite database', 'data/db.sqlite3');
  vars.DATABASE_URL = `sqlite://${path}`;
}
if (database === 'postgres') {
  const host = await question('input', 'Postgres host', 'localhost');
  const port = await question('input', 'Postgres port', '5432');
  const user = await question('input', 'Postgres user', 'ditto');
  const password = await question('input', 'Postgres password', 'ditto');
  const database = await question('input', 'Postgres database', 'ditto');
  vars.DATABASE_URL = `postgres://${user}:${password}@${host}:${port}/${database}`;
}

vars.DITTO_UPLOADER = await question('list', 'How do you want to upload files?', [
  'nostrbuild',
  'blossom',
  's3',
  'ipfs',
  'local',
]);

if (vars.DITTO_UPLOADER === 'nostrbuild') {
  vars.NOSTRBUILD_ENDPOINT = await question('input', 'nostr.build endpoint', 'https://nostr.build/api/v2/upload/files');
}
if (vars.DITTO_UPLOADER === 'blossom') {
  vars.BLOSSOM_SERVERS = await question('input', 'Blossom servers (comma separated)', 'https://blossom.primal.net/');
}
if (vars.DITTO_UPLOADER === 's3') {
  vars.S3_ACCESS_KEY = await question('input', 'S3 access key');
  vars.S3_SECRET_KEY = await question('input', 'S3 secret key');
  vars.S3_ENDPOINT = await question('input', 'S3 endpoint');
  vars.S3_BUCKET = await question('input', 'S3 bucket');
  vars.S3_REGION = await question('input', 'S3 region');
  vars.S3_PATH_STYLE = String(await question('confirm', 'Use path style?', false));
  const mediaDomain = await question('input', 'Media domain', `media.${domain}`);
  vars.MEDIA_DOMAIN = `https://${mediaDomain}`;
}
if (vars.DITTO_UPLOADER === 'ipfs') {
  vars.IPFS_API_URL = await question('input', 'IPFS API URL', 'http://localhost:5001');
  const mediaDomain = await question('input', 'Media domain', `media.${domain}`);
  vars.MEDIA_DOMAIN = `https://${mediaDomain}`;
}
if (vars.DITTO_UPLOADER === 'local') {
  vars.UPLOADS_DIR = await question('input', 'Local uploads directory', 'data/uploads');
  const mediaDomain = await question('input', 'Media domain', `media.${domain}`);
  vars.MEDIA_DOMAIN = `https://${mediaDomain}`;
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
