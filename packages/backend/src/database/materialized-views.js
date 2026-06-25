/**
 * Materialized Views for Query Optimization (#247)
 *
 * Defines and manages materialized views for top 10 common analytics queries.
 * Materialized views pre-compute expensive aggregations to improve dashboard
 * performance by orders of magnitude.
 */

const MATERIALIZED_VIEWS = {
  /**
   * Daily revenue aggregated by route and airline.
   * Columns: route, airline, date, total_revenue, booking_count, avg_ticket_price
   */
  daily_revenue_by_route: `
    SELECT
      f.route,
      f.airline,
      DATE(b.created_at) AS date,
      SUM(b.total_amount) AS total_revenue,
      COUNT(b.id) AS booking_count,
      AVG(b.total_amount) AS avg_ticket_price
    FROM bookings b
    JOIN flights f ON b.flight_id = f.id
    WHERE b.status = 'completed'
    GROUP BY f.route, f.airline, DATE(b.created_at)
    ORDER BY DATE(b.created_at) DESC
  `,

  /**
   * Monthly active users and booking metrics.
   * Columns: month, active_users, new_users, total_bookings, total_revenue
   */
  monthly_user_metrics: `
    SELECT
      DATE_TRUNC('month', u.created_at) AS month,
      COUNT(DISTINCT u.id) AS active_users,
      COUNT(DISTINCT CASE WHEN u.created_at >= DATE_TRUNC('month', CURRENT_DATE) THEN u.id END) AS new_users,
      COUNT(DISTINCT b.id) AS total_bookings,
      COALESCE(SUM(b.total_amount), 0) AS total_revenue
    FROM users u
    LEFT JOIN bookings b ON u.id = b.user_id AND b.status = 'completed'
    GROUP BY DATE_TRUNC('month', u.created_at)
    ORDER BY month DESC
  `,

  /**
   * Top 10 most popular routes by booking volume.
   * Columns: route, airline, booking_count, total_revenue, avg_rating
   */
  top_routes: `
    SELECT
      f.route,
      f.airline,
      COUNT(b.id) AS booking_count,
      SUM(b.total_amount) AS total_revenue,
      COALESCE(AVG(fr.rating), 0) AS avg_rating
    FROM flights f
    JOIN bookings b ON f.id = b.flight_id AND b.status = 'completed'
    LEFT JOIN feedback_reviews fr ON b.id = fr.booking_id
    GROUP BY f.route, f.airline
    ORDER BY booking_count DESC
    LIMIT 10
  `,

  /**
   * Revenue trends by week for the last 12 weeks.
   * Columns: week_start, week_end, total_revenue, booking_count, refund_count, refund_amount
   */
  weekly_revenue_trend: `
    SELECT
      DATE_TRUNC('week', b.created_at) AS week_start,
      (DATE_TRUNC('week', b.created_at) + INTERVAL '6 days')::DATE AS week_end,
      SUM(CASE WHEN b.status = 'completed' THEN b.total_amount ELSE 0 END) AS total_revenue,
      COUNT(CASE WHEN b.status = 'completed' THEN 1 END) AS booking_count,
      COUNT(CASE WHEN b.status = 'refunded' THEN 1 END) AS refund_count,
      COALESCE(SUM(CASE WHEN b.status = 'refunded' THEN r.refund_amount ELSE 0 END), 0) AS refund_amount
    FROM bookings b
    LEFT JOIN refunds r ON b.id = r.booking_id
    WHERE b.created_at >= CURRENT_DATE - INTERVAL '12 weeks'
    GROUP BY DATE_TRUNC('week', b.created_at)
    ORDER BY week_start DESC
  `,

  /**
   * User loyalty tier distribution.
   * Columns: tier, user_count, total_points_earned, avg_points_per_user
   */
  loyalty_tier_distribution: `
    SELECT
      l.tier,
      COUNT(DISTINCT l.user_id) AS user_count,
      SUM(l.total_points_earned) AS total_points_earned,
      AVG(l.total_points_earned) AS avg_points_per_user
    FROM loyalty_accounts l
    GROUP BY l.tier
    ORDER BY user_count DESC
  `,

  /**
   * Refund analytics by reason and airline.
   * Columns: airline, refund_reason, refund_count, total_refund_amount, avg_processing_time_hours
   */
  refund_analytics: `
    SELECT
      f.airline,
      r.reason AS refund_reason,
      COUNT(r.id) AS refund_count,
      SUM(r.refund_amount) AS total_refund_amount,
      AVG(EXTRACT(EPOCH FROM (r.processed_at - r.created_at)) / 3600) AS avg_processing_time_hours
    FROM refunds r
    JOIN bookings b ON r.booking_id = b.id
    JOIN flights f ON b.flight_id = f.id
    WHERE r.status = 'completed'
    GROUP BY f.airline, r.reason
    ORDER BY refund_count DESC
  `,

  /**
   * Peak booking times by hour of day.
   * Columns: hour_of_day, day_of_week, booking_count, total_revenue
   */
  peak_booking_times: `
    SELECT
      EXTRACT(HOUR FROM b.created_at) AS hour_of_day,
      EXTRACT(DOW FROM b.created_at) AS day_of_week,
      COUNT(b.id) AS booking_count,
      SUM(b.total_amount) AS total_revenue
    FROM bookings b
    WHERE b.status = 'completed'
    GROUP BY EXTRACT(HOUR FROM b.created_at), EXTRACT(DOW FROM b.created_at)
    ORDER BY booking_count DESC
  `,

  /**
   * Airline performance comparison.
   * Columns: airline, total_flights, total_bookings, revenue, avg_ticket_price, on_time_percentage
   */
  airline_performance: `
    SELECT
      f.airline,
      COUNT(DISTINCT f.id) AS total_flights,
      COUNT(DISTINCT b.id) AS total_bookings,
      COALESCE(SUM(b.total_amount), 0) AS revenue,
      AVG(b.total_amount) AS avg_ticket_price,
      COALESCE(AVG(CASE WHEN f.status = 'on_time' THEN 100 ELSE 0 END), 0) AS on_time_percentage
    FROM flights f
    LEFT JOIN bookings b ON f.id = b.flight_id AND b.status = 'completed'
    GROUP BY f.airline
    ORDER BY revenue DESC
  `,

  /**
   * User retention cohorts.
   * Columns: cohort_month, total_users, month_1_retention, month_3_retention, month_6_retention
   */
  user_retention_cohorts: `
    SELECT
      DATE_TRUNC('month', u.created_at) AS cohort_month,
      COUNT(DISTINCT u.id) AS total_users,
      COUNT(DISTINCT CASE WHEN b.created_at >= u.created_at + INTERVAL '1 month' THEN u.id END)::FLOAT /
        NULLIF(COUNT(DISTINCT u.id), 0) * 100 AS month_1_retention,
      COUNT(DISTINCT CASE WHEN b.created_at >= u.created_at + INTERVAL '3 months' THEN u.id END)::FLOAT /
        NULLIF(COUNT(DISTINCT u.id), 0) * 100 AS month_3_retention,
      COUNT(DISTINCT CASE WHEN b.created_at >= u.created_at + INTERVAL '6 months' THEN u.id END)::FLOAT /
        NULLIF(COUNT(DISTINCT u.id), 0) * 100 AS month_6_retention
    FROM users u
    LEFT JOIN bookings b ON u.id = b.user_id AND b.status = 'completed'
    GROUP BY DATE_TRUNC('month', u.created_at)
    ORDER BY cohort_month DESC
  `,

  /**
   * Real-time dashboard summary metrics.
   * Columns: total_users_today, active_bookings, revenue_today, pending_refunds
   */
  dashboard_summary: `
    SELECT
      COUNT(DISTINCT u.id) AS total_users_today,
      COUNT(DISTINCT CASE WHEN b.status = 'confirmed' THEN b.id END) AS active_bookings,
      COALESCE(SUM(CASE WHEN b.status = 'completed' AND DATE(b.created_at) = CURRENT_DATE THEN b.total_amount END), 0) AS revenue_today,
      COUNT(DISTINCT CASE WHEN r.status = 'pending' THEN r.id END) AS pending_refunds
    FROM users u
    LEFT JOIN bookings b ON u.id = b.user_id
    LEFT JOIN refunds r ON b.id = r.booking_id
  `,
};

class MaterializedViewManager {
  constructor(pool) {
    this.pool = pool;
    this.viewNames = Object.keys(MATERIALIZED_VIEWS);
    this.refreshIntervalMs = 5 * 60 * 1000; // 5 minutes
    this.intervals = new Map();
  }

  /**
   * Create all materialized views.
   */
  async createAll() {
    for (const [name, query] of Object.entries(MATERIALIZED_VIEWS)) {
      await this.create(name, query);
    }
  }

  /**
   * Create a single materialized view.
   */
  async create(name, query) {
    const dropSQL = `DROP MATERIALIZED VIEW IF EXISTS mv_${name} CASCADE`;
    const createSQL = `CREATE MATERIALIZED VIEW mv_${name} AS ${query} WITH DATA`;
    const indexSQL = `CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_${name}_pk ON mv_${name} (${this._getPrimaryKeyColumns(name)})`;

    try {
      await this.pool.query(dropSQL);
      await this.pool.query(createSQL);
      await this.pool.query(indexSQL);
      console.log(`[MaterializedViews] Created mv_${name}`);
    } catch (err) {
      console.error(`[MaterializedViews] Failed to create mv_${name}:`, err.message);
    }
  }

  /**
   * Refresh all materialized views concurrently.
   */
  async refreshAll() {
    const results = await Promise.allSettled(
      this.viewNames.map((name) => this.refresh(name))
    );
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      console.error(`[MaterializedViews] ${failed.length} view(s) failed to refresh`);
    }
  }

  /**
   * Refresh a single materialized view.
   */
  async refresh(name) {
    try {
      await this.pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_${name}`);
    } catch (err) {
      throw new Error(`Failed to refresh mv_${name}: ${err.message}`);
    }
  }

  /**
   * Query a materialized view.
   */
  async query(name, filters = {}) {
    const validNames = this.viewNames;
    if (!validNames.includes(name)) {
      throw new Error(`Unknown materialized view: ${name}. Valid: ${validNames.join(', ')}`);
    }

    let sql = `SELECT * FROM mv_${name}`;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        conditions.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ' LIMIT 1000';

    const result = await this.pool.query(sql, params);
    return result.rows;
  }

  /**
   * Start periodic refresh of all views.
   */
  startAutoRefresh() {
    console.log(`[MaterializedViews] Auto-refresh every ${this.refreshIntervalMs / 1000}s`);
    this.refreshAll(); // Initial refresh
    const interval = setInterval(() => this.refreshAll(), this.refreshIntervalMs);
    this.intervals.set('auto-refresh', interval);
  }

  /**
   * Stop periodic refresh.
   */
  stopAutoRefresh() {
    for (const [key, interval] of this.intervals.entries()) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }

  /**
   * Get view metadata for monitoring.
   */
  async getMetadata() {
    const result = await this.pool.query(`
      SELECT
        schemaname,
        matviewname AS view_name,
        pg_size_pretty(pg_total_relation_size(schemaname || '.' || matviewname)) AS size,
        obj_description(c.oid, 'pg_class') AS comment
      FROM pg_matviews
      JOIN pg_class c ON c.relname = matviewname
      WHERE schemaname = 'public'
      ORDER BY matviewname
    `);
    return result.rows;
  }

  /**
   * Drop all materialized views.
   */
  async dropAll() {
    for (const name of this.viewNames) {
      try {
        await this.pool.query(`DROP MATERIALIZED VIEW IF EXISTS mv_${name} CASCADE`);
      } catch (err) {
        console.error(`[MaterializedViews] Failed to drop mv_${name}:`, err.message);
      }
    }
  }

  /**
   * Get primary key columns for a view (used for unique index).
   */
  _getPrimaryKeyColumns(name) {
    const pkMap = {
      daily_revenue_by_route: 'route, date',
      monthly_user_metrics: 'month',
      top_routes: 'route',
      weekly_revenue_trend: 'week_start',
      loyalty_tier_distribution: 'tier',
      refund_analytics: 'airline, refund_reason',
      peak_booking_times: 'hour_of_day',
      airline_performance: 'airline',
      user_retention_cohorts: 'cohort_month',
      dashboard_summary: '',
    };
    return pkMap[name] || '1'; // fallback to constant if no PK defined
  }
}

module.exports = { MaterializedViewManager, MATERIALIZED_VIEWS };