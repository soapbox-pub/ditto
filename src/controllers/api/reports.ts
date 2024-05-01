import { type AppController } from '@/app.ts';

const reportsController: AppController = (c) => {
  return c.json('Reports endpoint');
};

export { reportsController };
