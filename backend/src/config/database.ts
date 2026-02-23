import mongoose from 'mongoose';
import logger from '../utils/logger';
import { config } from '../config';

export const connectDatabase = async () => {
  try {
    const mongoURI = config.databaseUrl || process.env.MONGO_URI || 'mongodb://localhost:27017/traqora';
    await mongoose.connect(mongoURI);
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    process.exit(1);
  }
};
