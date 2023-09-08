import './precheck.ts';
import app from './app.ts';

Deno.serve(app.fetch);
