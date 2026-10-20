import { parseRedisClusterNodes } from '../../src/cache/redisClusterConfig';

describe('parseRedisClusterNodes (issue #335)', () => {
  it('returns an empty array for undefined input', () => {
    expect(parseRedisClusterNodes(undefined)).toEqual([]);
  });

  it('returns an empty array for an empty/whitespace string', () => {
    expect(parseRedisClusterNodes('')).toEqual([]);
    expect(parseRedisClusterNodes('   ')).toEqual([]);
  });

  it('parses a single host:port entry', () => {
    expect(parseRedisClusterNodes('localhost:7000')).toEqual([{ host: 'localhost', port: 7000 }]);
  });

  it('parses multiple comma-separated entries and trims whitespace', () => {
    expect(parseRedisClusterNodes(' localhost:7000 , localhost:7001,localhost:7002 ')).toEqual([
      { host: 'localhost', port: 7000 },
      { host: 'localhost', port: 7001 },
      { host: 'localhost', port: 7002 },
    ]);
  });

  it('skips entries with a missing or non-numeric port', () => {
    expect(parseRedisClusterNodes('localhost:7000,localhost,localhost:abc,localhost:7001')).toEqual([
      { host: 'localhost', port: 7000 },
      { host: 'localhost', port: 7001 },
    ]);
  });

  it('skips entries with a non-positive port', () => {
    expect(parseRedisClusterNodes('localhost:0,localhost:-1,localhost:7000')).toEqual([
      { host: 'localhost', port: 7000 },
    ]);
  });
});
