export interface RedisClusterNode {
  host: string;
  port: number;
}

/**
 * Parses the REDIS_CLUSTER_NODES env format ("host1:port1,host2:port2") into
 * ioredis Cluster node descriptors. Returns an empty array (single-node /
 * in-memory mode) for undefined, empty, or all-invalid input (issue #335).
 */
export const parseRedisClusterNodes = (raw?: string): RedisClusterNode[] => {
  if (!raw || raw.trim() === '') {
    return [];
  }

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<RedisClusterNode[]>((nodes, entry) => {
      const [host, portStr] = entry.split(':');
      const port = Number(portStr);

      if (!host || !Number.isInteger(port) || port <= 0) {
        return nodes;
      }

      nodes.push({ host, port });
      return nodes;
    }, []);
};
