const redis = require('redis');

async function testRedis() {
  const redisUrl = process.env.REDIS_URL || 'redis://172.20.145.159:6379';
  console.log('Attempting to connect to Redis at:', redisUrl);
  
  const client = redis.createClient({ url: redisUrl });
  
  client.on('error', (err) => {
    console.error('❌ Redis specific error:', {
      message: err.message,
      code: err.code,
      syscall: err.syscall,
      address: err.address,
      port: err.port
    });
  });

  client.on('connect', () => console.log('✅ Redis connected successfully'));

  try {
    await client.connect();
    console.log('✅ Redis client connected');
    
    // Test basic operations
    await client.set('test-key', 'Hello from Windows!');
    const value = await client.get('test-key');
    console.log('✅ Redis test: retrieved value =', value);
    
    await client.quit();
  } catch (err) {
    console.error('❌ Redis connection failed:', err.message);
    console.error('Full error:', err);
  }
}

testRedis();