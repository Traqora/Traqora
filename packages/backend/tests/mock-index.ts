import { createApp } from '../src/app';

export const app = createApp();
export const appPromise = Promise.resolve(app);
export default app;
