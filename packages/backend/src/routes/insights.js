/**
 * ML Insights API Routes (#259)
 *
 * Express routes for ML-based analytics insights: churn prediction,
 * anomaly detection, smart recommendations, and revenue prediction.
 */

const express = require('express');
const router = express.Router();
const {
  RevenuePredictionModel,
  ChurnPredictionModel,
  AnomalyDetectionModel,
  RecommendationEngine,
} = require('../ml/models');

const revenueModel = new RevenuePredictionModel();
const churnModel = new ChurnPredictionModel();
const anomalyModel = new AnomalyDetectionModel();
const recommendationEngine = new RecommendationEngine();

/**
 * GET /api/insights/revenue-prediction
 * Predict future revenue based on historical data.
 */
router.get('/revenue-prediction', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const historicalData = _getMockRevenueHistory();
    const predictions = revenueModel.predict(historicalData, parseInt(days));

    res.json({
      model: 'RevenuePredictionModel',
      trained: revenueModel.trained,
      predictions,
      features: revenueModel.features,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/insights/revenue-prediction
 * Train/retrain the revenue prediction model.
 */
router.post('/revenue-prediction/train', async (req, res) => {
  try {
    const data = req.body.data || _getMockRevenueHistory();
    const result = revenueModel.train(data);
    res.json({ message: 'Revenue model trained successfully', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/insights/churn-risk/:userId
 * Get churn risk score for a specific user.
 */
router.get('/churn-risk/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Mock user profile (would fetch from DB in production)
    const userProfile = _getMockUserProfile(userId);

    const churnScore = churnModel.predictChurn(userProfile);
    res.json({
      userId,
      ...churnScore,
      features: churnModel.features,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/insights/churn-risk/batch
 * Batch churn risk assessment.
 */
router.post('/churn-risk/batch', async (req, res) => {
  try {
    const { userIds } = req.body;
    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json({ error: 'userIds array is required' });
    }

    const profiles = userIds.map((id) => _getMockUserProfile(id));
    const results = churnModel.batchPredict(profiles.map((p, i) => ({ id: userIds[i], ...p })));

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/insights/churn-risk/train
 * Train the churn prediction model.
 */
router.post('/churn-risk/train', async (req, res) => {
  try {
    const data = req.body.data || _getMockChurnTrainingData();
    const result = churnModel.train(data);
    res.json({ message: 'Churn model trained successfully', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/insights/anomalies
 * Detect anomalies in time series data.
 */
router.get('/anomalies', async (req, res) => {
  try {
    const { threshold = 2.5, source } = req.query;

    // Mock time series data
    const data = source === 'revenue'
      ? _getMockRevenueHistory()
      : source === 'bookings'
        ? _getMockBookingHistory()
        : _getMockRevenueHistory();

    const result = anomalyModel.detect(data, { threshold: parseFloat(threshold) });

    res.json({
      model: 'AnomalyDetectionModel',
      source: source || 'revenue',
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/insights/recommendations/:userId
 * Get personalized recommendations for a user.
 */
router.get('/recommendations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 5 } = req.query;

    const userProfile = _getMockUserProfile(userId);
    const catalog = _getMockCatalog();

    const recommendations = recommendationEngine.recommend(userProfile, catalog);

    res.json({
      userId,
      recommendations: recommendations.slice(0, parseInt(limit)),
      model: 'RecommendationEngine',
      trained: recommendationEngine.trained,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/insights/recommendations/train
 * Train the recommendation engine.
 */
router.post('/recommendations/train', async (req, res) => {
  try {
    const data = req.body.data || _getMockInteractionData();
    const result = recommendationEngine.train(data);
    res.json({ message: 'Recommendation engine trained successfully', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/insights/models
 * List all available ML models and their status.
 */
router.get('/models', async (req, res) => {
  try {
    res.json({
      models: [
        {
          name: 'RevenuePredictionModel',
          trained: revenueModel.trained,
          features: revenueModel.features,
        },
        {
          name: 'ChurnPredictionModel',
          trained: churnModel.trained,
          features: churnModel.features,
        },
        {
          name: 'AnomalyDetectionModel',
          trained: anomalyModel.trained,
          threshold: anomalyModel.threshold,
        },
        {
          name: 'RecommendationEngine',
          trained: recommendationEngine.trained,
        },
      ],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// ===== Mock data helpers =====

function _getMockRevenueHistory() {
  const data = [];
  for (let i = 0; i < 90; i++) {
    const date = new Date(2024, 0, i + 1);
    data.push({
      date: date.toISOString().split('T')[0],
      value: 15000 + Math.sin(i / 7 * Math.PI) * 5000 + (i * 100) + (Math.random() - 0.5) * 3000,
      revenue: 15000 + Math.sin(i / 7 * Math.PI) * 5000 + (i * 100) + (Math.random() - 0.5) * 3000,
    });
  }
  return data;
}

function _getMockBookingHistory() {
  return Array.from({ length: 60 }, (_, i) => ({
    date: new Date(2024, 1, i + 1).toISOString().split('T')[0],
    value: Math.round(50 + Math.sin(i / 5) * 20 + Math.random() * 30),
  }));
}

function _getMockUserProfile(userId) {
  return {
    id: userId,
    daysSinceLastBooking: Math.floor(Math.random() * 180),
    totalBookings: Math.floor(Math.random() * 20),
    totalRevenue: Math.floor(Math.random() * 10000),
    avgBookingValue: 300 + Math.random() * 700,
    refundRate: Math.random() * 0.5,
    supportTickets30d: Math.floor(Math.random() * 8),
    loyaltyTier: ['bronze', 'silver', 'gold', 'platinum'][Math.floor(Math.random() * 4)],
    daysSinceRegistration: 100 + Math.floor(Math.random() * 500),
    preferredAirlines: ['Delta', 'American', 'United', 'JetBlue'],
    preferredRoutes: ['NYC -> LAX', 'LAX -> LHR'],
    avgTicketPrice: 300 + Math.random() * 500,
  };
}

function _getMockChurnTrainingData() {
  return Array.from({ length: 100 }, (_, i) => ({
    id: `user_${i}`,
    daysSinceLastBooking: Math.floor(Math.random() * 365),
    totalBookings: Math.floor(Math.random() * 30),
    totalRevenue: Math.floor(Math.random() * 15000),
    avgBookingValue: 200 + Math.random() * 800,
    refundRate: Math.random() * 0.3,
    supportTickets30d: Math.floor(Math.random() * 10),
    loyaltyTier: ['bronze', 'silver', 'gold', 'platinum'][Math.floor(Math.random() * 4)],
    actualChurn: Math.random() > 0.7,
  }));
}

function _getMockCatalog() {
  return [
    { id: 'route_1', airline: 'Delta', route: 'NYC -> LAX', price: 350, popularity: 95, bookingCount: 2341 },
    { id: 'route_2', airline: 'American', route: 'LAX -> LHR', price: 1150, popularity: 88, bookingCount: 1872 },
    { id: 'route_3', airline: 'JetBlue', route: 'JFK -> MIA', price: 250, popularity: 82, bookingCount: 1654 },
    { id: 'route_4', airline: 'United', route: 'SFO -> ORD', price: 320, popularity: 75, bookingCount: 1432 },
    { id: 'route_5', airline: 'Delta', route: 'ATL -> LHR', price: 980, popularity: 72, bookingCount: 1289 },
    { id: 'route_6', airline: 'American', route: 'DFW -> NRT', price: 1250, popularity: 68, bookingCount: 1123 },
    { id: 'route_7', airline: 'Emirates', route: 'DXB -> LHR', price: 1360, popularity: 90, bookingCount: 987 },
    { id: 'route_8', airline: 'Singapore', route: 'SIN -> NRT', price: 1120, popularity: 65, bookingCount: 876 },
    { id: 'route_9', airline: 'ANA', route: 'HND -> SIN', price: 1145, popularity: 60, bookingCount: 765 },
    { id: 'route_10', airline: 'Lufthansa', route: 'FRA -> JFK', price: 1170, popularity: 58, bookingCount: 654 },
  ];
}

function _getMockInteractionData() {
  return Array.from({ length: 500 }, (_, i) => ({
    userId: `user_${Math.floor(Math.random() * 100)}`,
    routeId: `route_${Math.floor(Math.random() * 10) + 1}`,
    action: Math.random() > 0.5 ? 'booked' : 'viewed',
    timestamp: new Date(2024, 0, Math.floor(Math.random() * 90)).toISOString(),
  }));
}