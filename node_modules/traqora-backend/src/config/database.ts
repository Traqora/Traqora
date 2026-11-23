import mongoose from 'mongoose';
import { logger } from '../utils/logger';
import { config } from '../config';

export const connectDatabase = async () => {
  const mongoURI = config.mongoUrl || process.env.MONGO_URI || '';

  if (!mongoURI) {
    logger.warn('No MongoDB URI provided, skipping connection');
    return;
  }

  // basic validation: ensure scheme starts with mongodb
  if (!mongoURI.startsWith('mongodb')) {
    logger.warn(`MongoDB URI does not look valid (${mongoURI}), skipping connection`);
    return;
  }

  try {
    await mongoose.connect(mongoURI);
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    process.exit(1);
  }
};
