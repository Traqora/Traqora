import { Request, Response, NextFunction } from 'express';
import { initDataSource } from '../db/dataSource';

/**
 * Middleware to ensure the database connection is initialized before handling requests.
 * This replaces the repetitive call to initDataSource() in every route handler.
 */
export const dbInitMiddleware = async (_req: Request, _res: Response, next: NextFunction) => {
  try {
    await initDataSource();
    next();
  } catch (error) {
    next(error);
  }
};
