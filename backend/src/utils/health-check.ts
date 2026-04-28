import { getConfig } from '../config';
import { logger } from './logger';
import { createClient } from 'redis';
import { Client } from 'pg';
import { Horizon } from '@stellar/stellar-sdk';

export async function verifyConnectivity() {
  const config = getConfig();
  logger.info('Starting infrastructure connectivity checks...');

  const results = {
    database: false,
    redis: false,
    stellar: false
  };

  // 1. Check PostgreSQL
  try {
    const client = new Client({ connectionString: config.databaseUrl });
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    results.database = true;
    logger.info('✅ PostgreSQL connectivity verified');
  } catch (error) {
    logger.error('❌ PostgreSQL connectivity failed', error as Error);
  }

  // 2. Check Redis
  try {
    const client = createClient({ url: config.redisUrl });
    client.on('error', (err) => logger.error('Redis Client Error', err));
    await client.connect();
    await client.ping();
    await client.quit();
    results.redis = true;
    logger.info('✅ Redis connectivity verified');
  } catch (error) {
    logger.error('❌ Redis connectivity failed', error as Error);
  }

  // 3. Check Stellar Horizon
  try {
    const server = new Horizon.Server(config.horizonUrl);
    await server.ledgers().limit(1).call();
    results.stellar = true;
    logger.info('✅ Stellar Horizon connectivity verified');
  } catch (error) {
    logger.error('❌ Stellar Horizon connectivity failed', error as Error);
  }

  const allPassed = Object.values(results).every(v => v === true);

  if (!allPassed && config.environment === 'production') {
    logger.error('CRITICAL: Infrastructure health checks failed in production. Mandatory dependencies missing.');
    process.exit(1);
  }

  return results;
}
