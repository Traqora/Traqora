// Mobile analytics routes
const express = require('express');
const router = express.Router();

router.get('/dashboard', (req, res) => {
    // Mobile-optimized API responses
    res.json({ message: 'Mobile analytics dashboard' });
});

router.post('/sync', (req, res) => {
    // Offline data sync
    res.json({ message: 'Offline data synced successfully' });
});

module.exports = router;
