import 'https://deno.land/std@0.177.0/dotenv/load.ts';

import app from './app.ts';

Deno.serve(app.fetch);
