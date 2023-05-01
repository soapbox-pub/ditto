export const LOCAL_DOMAIN = Deno.env.get('LOCAL_DOMAIN') || 'http://localhost:8000';
export const POST_CHAR_LIMIT = Number(Deno.env.get('POST_CHAR_LIMIT') || 5000);
export const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') || 'webmaster@localhost';

export const poolRelays = (Deno.env.get('RELAY_POOL') || '').split(',').filter(Boolean);
export const publishRelays = ['wss://relay.mostr.pub'];
