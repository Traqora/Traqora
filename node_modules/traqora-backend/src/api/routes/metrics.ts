import { Router, Request, Response } from 'express';
import { register, updateSystemHealth } from '../../services/metrics';
import { AppDataSource } from '../../db/dataSource';
import { logger } from '../../utils/logger';
import { HealthCheckService } from '../../services/healthCheckService';
import { UptimeTracker } from '../../services/uptimeTracker';
import { HealthAggregator } from '../../services/healthAggregator';
import { HealthHistoryStorage } from '../../services/healthHistoryStorage';
import { HealthAlertingService } from '../../services/healthAlertingService';
import { HealthDashboardService } from '../../services/healthDashboardService';

const router = Router();

// Initialize health monitoring services
let healthCheckService: HealthCheckService;
let uptimeTracker: UptimeTracker;
let healthAggregator: HealthAggregator;
let healthHistoryStorage: HealthHistoryStorage;
let healthAlertingService: HealthAlertingService;
let healthDashboardService: HealthDashboardService;

// Initialize services on first use
function initializeHealthServices() {
  if (!healthCheckService) {
    healthCheckService = new HealthCheckService();
    uptimeTracker = new UptimeTracker();
    healthAggregator = new HealthAggregator(healthCheckService, uptimeTracker);
    healthHistoryStorage = new HealthHistoryStorage(AppDataSource);
    healthAlertingService = new HealthAlertingService();
    healthDashboardService = new HealthDashboardService(
      healthCheckService,
      uptimeTracker,
      healthAggregator,
      healthHistoryStorage,
      healthAlertingService
    );
    
    // Initialize asynchronously
    healthCheckService.initialize(AppDataSource).catch(err => {
      logger.error('Failed to initialize health check service', { error: err });
    });
    uptimeTracker.initialize();
    healthAggregator.initialize();
    healthHistoryStorage.initialize().catch(err => {
      logger.error('Failed to initialize health history storage', { error: err });
    });
    healthAlertingService.initialize();
  }
}

// Prometheus metrics endpoint
router.get('/', async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error: any) {
    logger.error('Error generating metrics', { error: error.message });
    res.status(500).end('Error generating metrics');
  }
});

// Enhanced health check endpoint
router.get('/health', async (req: Request, res: Response) => {
  initializeHealthServices();
  
  try {
    const health = await healthCheckService.getSystemHealth();
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error: any) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({ 
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message 
    });
  }
});

// Detailed health check endpoint with all components
router.get('/health/detailed', async (req: Request, res: Response) => {
  initializeHealthServices();
  
  try {
    const aggregatedHealth = await healthAggregator.getAggregatedHealth();
    const statusCode = aggregatedHealth.overallStatus === 'healthy' ? 200 : 
                      aggregatedHealth.overallStatus === 'degraded' ? 200 : 503;
    res.status(statusCode).json(aggregatedHealth);
  } catch (error: any) {
    logger.error('Detailed health check failed', { error: error.message });
    res.status(503).json({ 
      overallStatus: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message 
    });
  }
});

// Health summary endpoint
router.get('/health/summary', async (req: Request, res: Response) => {
  initializeHealthServices();
  
  try {
    const summary = await healthAggregator.getHealthSummary();
    const statusCode = summary.status === 'healthy' ? 200 : 
                      summary.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(summary);
  } catch (error: any) {
    logger.error('Health summary failed', { error: error.message });
    res.status(503).json({ 
      status: 'unhealthy',
      error: error.message 
    });
  }
});

// Readiness check endpoint
router.get('/ready', async (req: Request, res: Response) => {
  initializeHealthServices();
  
  try {
    if (!AppDataSource.isInitialized) {
      return res.status(503).json({ ready: false, reason: 'Database not initialized' });
    }

    await AppDataSource.query('SELECT 1');
    res.json({ ready: true });
  } catch (error: any) {
    logger.error('Readiness check failed', { error: error.message });
    res.status(503).json({ ready: false, reason: error.message });
  }
});

// Liveness check endpoint
router.get('/live', (req: Request, res: Response) => {
  res.json({ alive: true });
});

// Uptime report endpoint
router.get('/health/uptime', async (req: Request, res: Response) => {
  initializeHealthServices();
  
  try {
    const period = req.query.period ? parseInt(req.query.period as string) : undefined;
    const uptimeReport = uptimeTracker.getUptimeReport(period);
    res.json(uptimeReport);
  } catch (error: any) {
    logger.error('Uptime report failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Uptime statistics endpoint
router.get('/health/uptime/stats', (req: Request, res: Response) => {
  initializeHealthServices();
  
  try {
    const stats = uptimeTracker.getStatistics();
    res.json(stats);
  } catch (error: any) {
    logger.error('Uptime statistics failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Health events endpoint
router.get('/health/events', (req: Request, res: Response) => {
  initializeHealthServices();
  
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const events = uptimeTracker.getRecentEvents(limit);
    res.json({ events, count: events.length });
  } catch (error: any) {
    logger.error('Health events failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Alerts endpoint
router.get('/health/alerts', (req: Request, res: Response) => {
  initializeHealthServices();
  
  try {
    const filter: any = {};
    if (req.query.severity) filter.severity = req.query.severity;
    if (req.query.resolved !== undefined) filter.resolved = req.query.resolved === 'true';
    if (req.query.component) filter.component = req.query.component;
    
    const alerts = healthAggregator.getAlerts(filter);
    res.json({ alerts, count: alerts.length });
  } catch (error: any) {
    logger.error('Alerts retrieval failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Resolve alert endpoint
router.post('/health/alerts/:id/resolve', (req: Request, res: Response) => {
  initializeHealthServices();
  
  try {
    const resolved = healthAggregator.resolveAlert(req.params.id);
    if (resolved) {
      res.json({ success: true, message: 'Alert resolved' });
    } else {
      res.status(404).json({ success: false, message: 'Alert not found' });
    }
  } catch (error: any) {
    logger.error('Alert resolution failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Individual health check endpoint
router.get('/health/check/:name', async (req: Request, res: Response) => {
  initializeHealthServices();
  
  try {
    const result = await healthCheckService.runCheck(req.params.name);
    const statusCode = result.status === 'healthy' ? 200 : 
                      result.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(result);
  } catch (error: any) {
    logger.error('Individual health check failed', { error: error.message });
    res.status(503).json({ 
      name: req.params.name,
      status: 'unhealthy',
      error: error.message 
    });
  }
});

// Dashboard data endpoint
router.get('/health/dashboard', async (req: Request, res: Response) => {
  initializeHealthServices();
  
  try {
    const dashboardData = await healthDashboardService.getDashboardData();
    res.json(dashboardData);
  } catch (error: any) {
    logger.error('Dashboard data failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Health report endpoint
router.get('/health/report', async (req: Request, res: Response) => {
  initializeHealthServices();
  
  try {
    const startDate = req.query.start ? new Date(req.query.start as string) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const endDate = req.query.end ? new Date(req.query.end as string) : new Date();
    
    const report = await healthDashboardService.generateReport(startDate, endDate);
    res.json(report);
  } catch (error: any) {
    logger.error('Health report failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Real-time health summary endpoint
router.get('/health/realtime', async (req: Request, res: Response) => {
  initializeHealthServices();
  
  try {
    const summary = await healthDashboardService.getRealTimeSummary();
    res.json(summary);
  } catch (error: any) {
    logger.error('Real-time summary failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Health metrics for monitoring systems
router.get('/health/metrics', async (req: Request, res: Response) => {
  initializeHealthServices();
  
  try {
    const metrics = await healthDashboardService.getHealthMetrics();
    res.json(metrics);
  } catch (error: any) {
    logger.error('Health metrics failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export const metricsRoutes = router;
