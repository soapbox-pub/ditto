import 'https://deno.land/std@0.177.0/dotenv/load.ts';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

import app from './app.ts';

serve(app.fetch);
