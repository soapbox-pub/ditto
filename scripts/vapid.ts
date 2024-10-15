import { generateVapidKeys } from '@negrel/webpush';
import { encodeBase64 } from '@std/encoding/base64';

const { privateKey } = await generateVapidKeys({ extractable: true });
const bytes = await crypto.subtle.exportKey('pkcs8', privateKey);

console.log(encodeBase64(bytes));
