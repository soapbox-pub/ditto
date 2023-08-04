import 'https://deno.land/std@0.197.0/dotenv/load.ts';

import app from './app.ts';

Deno.serve(app.fetch);
