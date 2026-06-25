/**
 * Analytics API Routes (#241)
 *
 * Express routes for analytics data, revenue forecasting,
 * and dashboard metrics with query optimization support.
 */

const express = require('express');
const router = express.Router();
const { RevenueForecastingService } = require('../analytics/forecasting');
const { CohortAnalysisService } = require('../analytics/cohort');
const { FunnelAnalysisService } = require('../analytics/funnel');
const { QueryCache } = require('../database/query-cache');

const forecastingService = new RevenueForecastingService();
const cohortAnalysisService = new CohortAnalysisService();
const funnelAnalysisService = new FunnelAnalysisService();
const queryCache = new QueryCache();

// Initialize cache on first load
queryCache.connect().catch(() => {});

/**
 * GET /api/analytics/forecast
 * Returns revenue forecasts for 7, 30, and 90 day horizons.
 */
router.get('/forecast', async (req, res) => {
  try {
    const { horizon } = req.query;
    const validHorizons = ['7d', '30d', '90d'];

    // In production, this would fetch from the database
    const historicalData = _getMockHistoricalData();

    const result = await forecastingService.forecast(historicalData);

    if (horizon && validHorizons.includes(horizon)) {
      const key = `forecast${horizon.charAt(0).toUpperCase() + horizon.slice(1)}`;
      const mapKey = { '7d': 'forecast7d', '30d': 'forecast30d', '90d': 'forecast90d' };
      return res.json({ horizon, data: result[mapKey[horizon]], metadata: result.metadata });
    }

    res.json(result);
  } catch (err) {
    console.error('[Analytics] Forecast error:', err);
    res.status(500).json({ error: 'Forecast generation failed', message: err.message });
  }
});

/**
 * GET /api/analytics/forecast/accuracy
 * Returns forecast accuracy metrics.
 */
router.get('/forecast/accuracy', async (req, res) => {
  try {
    const metrics = forecastingService.getAccuracyMetrics(10);
    res.json({ metrics });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/analytics/forecast/compare
 * Compares forecast vs actual data.
 */
router.get('/forecast/compare', async (req, res) => {
  try {
    const historicalData = _getMockHistoricalData();
    const actualData = _getMockActualData();

    const result = await forecastingService.compareActualVsForecast(historicalData, actualData);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/analytics/dashboard
 * Returns dashboard summary metrics.
 */
router.get('/dashboard', async (req, res) => {
  try {
    // Try cache first
    const cacheKey = 'dashboard_summary';
    const cached = await queryCache.get(cacheKey, null);
    if (cached) {
      return res.json(cached);
    }

    // Mock dashboard metrics (would query DB in production)
    const dashboard = {
      totalRevenue: 1250000,
      revenueChange: 12.5,
      activeUsers: 8472,
      userChange: 8.3,
      totalBookings: 15423,
      bookingChange: -2.1,
      avgTicketPrice: 328.50,
      avgTicketChange: 3.7,
      conversionRate: 5.2,
      refundRate: 2.8,
      pendingRefunds: 47,
      topRoute: 'NYC -> LAX',
      periodRevenue: [
        { date: '2024-01', revenue: 185000 },
        { date: '2024-02', revenue: 210000 },
        { date: '2024-03', revenue: 195000 },
        { date: '2024-04', revenue: 230000 },
        { date: '2024-05', revenue: 215000 },
        { date: '2024-06', revenue: 245000 },
      ],
    };

    // Cache for 5 minutes
    await queryCache.set(cacheKey, null, dashboard, 300);
    res.json(dashboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/analytics/revenue
 * Revenue breakdown by period.
 */
router.get('/revenue', async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;

    const revenueData = {
      daily: _generateDailyRevenue(),
      weekly: _generateWeeklyRevenue(),
      monthly: _generateMonthlyRevenue(),
    };

    res.json(revenueData[period] || revenueData.monthly);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/analytics/top-routes
 * Top performing routes.
 */
router.get('/top-routes', async (req, res) => {
  try {
    const routes = [
      { route: 'NYC -> LAX', bookings: 2341, revenue: 892450, avgPrice: 381.25, growth: 12.3 },
      { route: 'LAX -> LHR', bookings: 1872, revenue: 2158340, avgPrice: 1153.50, growth: 8.7 },
      { route: 'LHR -> CDG', bookings: 1654, revenue: 568900, avgPrice: 344.00, growth: -1.2 },
      { route: 'CDG -> HND', bookings: 1432, revenue: 1897240, avgPrice: 1325.00, growth: 15.8 },
      { route: 'JFK -> MIA', bookings: 1289, revenue: 458920, avgPrice: 356.25, growth: 5.4 },
      { route: 'SFO -> ORD', bookings: 1123, revenue: 423450, avgPrice: 377.00, growth: 3.1 },
      { route: 'DXB -> LHR', bookings: 987, revenue: 1345670, avgPrice: 1363.50, growth: 22.4 },
      { route: 'SIN -> NRT', bookings: 876, revenue: 987650, avgPrice: 1127.50, growth: 10.2 },
      { route: 'HND -> SIN', bookings: 765, revenue: 876540, avgPrice: 1145.75, growth: -0.8 },
      { route: 'FRA -> JFK', bookings: 654, revenue: 765430, avgPrice: 1170.00, growth: 6.9 },
    ];

    res.json(routes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/analytics/user-metrics
 * User analytics and engagement metrics.
 */
router.get('/user-metrics', async (req, res) => {
  try {
    res.json({
      totalUsers: 45231,
      activeUsers: {
        daily: 8472,
        weekly: 21345,
        monthly: 35678,
      },
      newUsers: {
        today: 142,
        thisWeek: 987,
        thisMonth: 4230,
      },
      retention: {
        day1: 42.5,
        day7: 28.3,
        day30: 15.7,
        day90: 8.2,
      },
      userSegments: {
        new: { count: 8450, percentage: 18.7 },
        active: { count: 18340, percentage: 40.5 },
        atRisk: { count: 12340, percentage: 27.3 },
        churned: { count: 6101, percentage: 13.5 },
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/analytics/cohorts
 * Returns collaborator cohort analysis with retention, LTV, churn, and export data.
 */
router.get('/cohorts', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    res.json(cohortAnalysisService.getReport({ period }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/analytics/funnel
 * Returns royalty accrual to distribution funnel metrics.
 */
router.get('/funnel', async (req, res) => {
  try {
    res.json(funnelAnalysisService.getReport());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
/**
 * GET /api/analytics/cache-stats
 * Query cache statistics.
 */
router.get('/cache-stats', async (req, res) => {
  try {
    const stats = queryCache.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/analytics/cache/clear
 * Clear query cache.
 */
router.post('/cache/clear', async (req, res) => {
  try {
    await queryCache.clear();
    res.json({ message: 'Cache cleared successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// ===== Mock data helpers (replace with DB queries in production) =====

function _getMockHistoricalData() {
  const data = [];
  const startDate = new Date('2024-01-01');
  for (let i = 0; i < 180; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    data.push({
      date: date.toISOString().split('T')[0],
      value: 5000 + Math.sin(i / 7 * Math.PI) * 2000 + (i * 50) + (Math.random() - 0.5) * 1000,
      revenue: 5000 + Math.sin(i / 7 * Math.PI) * 2000 + (i * 50) + (Math.random() - 0.5) * 1000,
    });
  }
  return data;
}

function _getMockActualData() {
  const data = [];
  const startDate = new Date('2024-07-01');
  for (let i = 0; i < 30; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    data.push({
      date: date.toISOString().split('T')[0],
      value: 5000 + Math.sin(i / 7 * Math.PI) * 2000 + (i * 50) + (Math.random() - 0.5) * 1000,
    });
  }
  return data;
}

function _generateDailyRevenue() {
  return Array.from({ length: 30 }, (_, i) => ({
    date: new Date(2024, 5, i + 1).toISOString().split('T')[0],
    revenue: Math.round(40000 + Math.random() * 15000),
    bookings: Math.round(120 + Math.random() * 60),
  }));
}

function _generateWeeklyRevenue() {
  return Array.from({ length: 12 }, (_, i) => ({
    week: `Week ${i + 1}`,
    weekStart: new Date(2024, 2, i * 7 + 1).toISOString().split('T')[0],
    revenue: Math.round(280000 + Math.sin(i / 3) * 50000 + Math.random() * 30000),
    bookings: Math.round(840 + Math.random() * 200),
  }));
}

function _generateMonthlyRevenue() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months.map((month, i) => ({
    month,
    revenue: Math.round(1200000 + Math.sin(i / 2.5) * 300000 + (i * 40000) + Math.random() * 100000),
    bookings: Math.round(3600 + Math.sin(i / 2.5) * 800 + (i * 100) + Math.random() * 500),
  }));
}