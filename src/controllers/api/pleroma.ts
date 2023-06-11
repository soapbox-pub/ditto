import { type AppController } from '@/app.ts';

const frontendConfigController: AppController = (c) => {
  return c.json({});
};

export { frontendConfigController };
