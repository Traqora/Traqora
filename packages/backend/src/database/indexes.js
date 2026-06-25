/**
 * Index Management & Recommendations (#247)
 *
 * Manages database indexes, provides index usage monitoring,
 * and recommends missing indexes based on query patterns.
 * Also enforces query timeout of 30 seconds and logs slow queries.
 */

const QUERY_TIMEOUT_MS = 30 * 1000; // 30 seconds

class IndexManager {
  constructor(pool) {
    this.pool = pool;
    this.slowQueries = [];
    this.maxSlowQueryLog = 1000;
  }

  /**
   * Get current indexes with usage statistics.
   */
  async getIndexUsage() {
    const result = await this.pool.query(`
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef,
        idx_scan AS index_scans,
        idx_tup_read AS tuples_read,
        idx_tup_fetch AS tuples_fetched
      FROM pg_stat_user_indexes
      ORDER BY idx_scan DESC
    `);
    return result.rows;
  }

  /**
   * Get unused indexes (not scanned in the last N days).
   */
  async getUnusedIndexes(daysThreshold = 7) {
    const result = await this.pool.query(`
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef,
        idx_scan AS total_scans,
        pg_size_pretty(pg_total_relation_size(schemaname || '.' || indexname::text)) AS index_size
      FROM pg_stat_user_indexes
      WHERE idx_scan = 0
        AND schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY pg_total_relation_size(schemaname || '.' || indexname::text) DESC
    `);
    return result.rows;
  }

  /**
   * Get the most frequently used indexes.
   */
  async getTopIndexes(limit = 20) {
    const result = await this.pool.query(`
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef,
        idx_scan AS total_scans,
        idx_tup_read AS total_tuples_read,
        pg_size_pretty(pg_total_relation_size(schemaname || '.' || indexname::text)) AS index_size
      FROM pg_stat_user_indexes
      ORDER BY idx_scan DESC
      LIMIT $1
    `, [limit]);
    return result.rows;
  }

  /**
   * Analyze query plan for a given SQL statement.
   */
  async analyzeQueryPlan(query, params = []) {
    try {
      const explainSQL = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`;
      const result = await this.pool.query(explainSQL, params);
      return result.rows[0]['QUERY PLAN'];
    } catch (err) {
      throw new Error(`Query plan analysis failed: ${err.message}`);
    }
  }

  /**
   * Recommend missing indexes based on query analysis.
   * Uses pg_stat_user_tables to identify sequential scans on large tables.
   */
  async recommendIndexes() {
    const result = await this.pool.query(`
      SELECT
        schemaname,
        relname AS table_name,
        seq_scan AS sequential_scans,
        seq_tup_read AS tuples_read_by_seq,
        idx_scan AS index_scans,
        n_live_tup AS estimated_rows,
        pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) AS table_size
      FROM pg_stat_user_tables
      WHERE seq_scan > 1000
        AND seq_tup_read > 10000
        AND n_live_tup > 1000
      ORDER BY (seq_tup_read * seq_scan) DESC
      LIMIT 20
    `);

    const recommendations = [];
    for (const row of result.rows) {
      const tableName = `${row.schemaname}.${row.table_name}`;
      recommendations.push({
        table: tableName,
        sequentialScans: row.sequential_scans,
        estimatedRows: row.estimated_rows,
        tableSize: row.table_size,
        recommendation: `Table "${tableName}" has ${row.sequential_scans} sequential scans scanning ${row.tuples_read_by_seq} rows. Consider adding indexes on columns used in WHERE, JOIN, and ORDER BY clauses.`,
        priority: row.sequential_scans > 10000 ? 'high' : row.sequential_scans > 5000 ? 'medium' : 'low',
      });
    }

    return recommendations;
  }

  /**
   * Get detailed table statistics for monitoring.
   */
  async getTableStats() {
    const result = await this.pool.query(`
      SELECT
        schemaname,
        relname AS table_name,
        n_live_tup AS live_rows,
        n_dead_tup AS dead_rows,
        ROUND(n_dead_tup::NUMERIC / NULLIF(n_live_tup, 0) * 100, 2) AS dead_pct,
        last_autoanalyze,
        last_autovacuum,
        pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) AS total_size
      FROM pg_stat_user_tables
      ORDER BY n_live_tup DESC
    `);
    return result.rows;
  }

  /**
   * Execute a query with timeout enforcement.
   * Aborts if the query exceeds QUERY_TIMEOUT_MS.
   */
  async executeWithTimeout(query, params = []) {
    const startTime = Date.now();

    try {
      // Set statement timeout for this session, execute, then reset
      await this.pool.query(`SET LOCAL statement_timeout = '${QUERY_TIMEOUT_MS}ms'`);
      const result = await this.pool.query(query, params);
      const duration = Date.now() - startTime;

      // Log slow queries (> 1 second)
      if (duration > 1000) {
        this._logSlowQuery(query, params, duration);
      }

      return result.rows;
    } catch (err) {
      const duration = Date.now() - startTime;
      if (err.message.includes('canceling statement due to statement timeout')) {
        const timeoutErr = new Error(`Query exceeded timeout of ${QUERY_TIMEOUT_MS}ms`);
        timeoutErr.code = 'QUERY_TIMEOUT';
        timeoutErr.duration = duration;
        timeoutErr.query = query;
        this._logSlowQuery(query, params, duration, true);
        throw timeoutErr;
      }
      throw err;
    }
  }

  /**
   * Create a recommended index (if it doesn't exist).
   */
  async createIndex(table, column, options = {}) {
    const {
      unique = false,
      concurrently = true,
      method = 'btree',
      name = null,
    } = options;

    const indexName = name || `idx_${table.replace('.', '_')}_${column.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    const uniqueClause = unique ? 'UNIQUE ' : '';
    const concurrentlyClause = concurrently ? 'CONCURRENTLY ' : '';

    const sql = `
      CREATE ${uniqueClause}INDEX ${concurrentlyClause}IF NOT EXISTS ${indexName}
      ON ${table} USING ${method} (${column})
    `;

    try {
      await this.pool.query(sql);
      console.log(`[IndexManager] Created index ${indexName} on ${table}(${column})`);
      return { indexName, table, column, method };
    } catch (err) {
      console.error(`[IndexManager] Failed to create index ${indexName}:`, err.message);
      throw err;
    }
  }

  /**
   * Drop an index.
   */
  async dropIndex(indexName, options = {}) {
    const { concurrently = true } = options;
    const concurrentlyClause = concurrently ? 'CONCURRENTLY ' : '';

    try {
      await this.pool.query(`DROP INDEX ${concurrentlyClause}IF EXISTS ${indexName}`);
      console.log(`[IndexManager] Dropped index ${indexName}`);
    } catch (err) {
      console.error(`[IndexManager] Failed to drop index ${indexName}:`, err.message);
      throw err;
    }
  }

  /**
   * Get slow query log.
   */
  getSlowQueries(limit = 50) {
    return this.slowQueries.slice(0, limit);
  }

  /**
   * Clear slow query log.
   */
  clearSlowQueryLog() {
    this.slowQueries = [];
  }

  /**
   * Log a slow query for monitoring.
   */
  _logSlowQuery(query, params, durationMs, timedOut = false) {
    const entry = {
      timestamp: new Date().toISOString(),
      query: query.substring(0, 500), // Truncate long queries
      params: JSON.stringify(params).substring(0, 200),
      durationMs,
      timedOut,
    };
    this.slowQueries.unshift(entry);

    // Keep log bounded
    if (this.slowQueries.length > this.maxSlowQueryLog) {
      this.slowQueries.length = this.maxSlowQueryLog;
    }

    console.warn(`[SlowQuery] ${durationMs}ms${timedOut ? ' (TIMEOUT)' : ''}: ${entry.query}`);
  }
}

module.exports = { IndexManager, QUERY_TIMEOUT_MS };