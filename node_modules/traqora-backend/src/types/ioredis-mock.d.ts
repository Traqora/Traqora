declare module 'ioredis-mock' {
  import Redis from 'ioredis';
  const mock: typeof Redis;
  export default mock;
}
