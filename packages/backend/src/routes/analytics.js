// General analytics routes
const express = require('express');
const router = express.Router();
const geographicAnalytics = require('../analytics/geographic');
const tokenAnalyticsDB = require('../database/analytics');

router.get('/geographic', (req, res) => {
    // Geographic heatmaps and regional performance comparison
    res.json({
        locations: geographicAnalytics.getCollaboratorLocations(),
        revenue: geographicAnalytics.getRevenueByRegion()
    });
});

router.get('/token-performance', (req, res) => {
    // Token leaderboard by revenue
    res.json(tokenAnalyticsDB.getTokenPerformance());
});

module.exports = router;