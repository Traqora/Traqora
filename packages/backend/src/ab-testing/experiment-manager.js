/**
 * A/B Testing Framework - Experiment Manager (#248)
 *
 * Manages experiment lifecycle: creation, configuration,
 * variant assignment, metric tracking, and termination.
 */

const crypto = require('crypto');

class ExperimentManager {
  constructor() {
    this.experiments = new Map();
    this.metrics = new Map();
    this.results = new Map();
  }

  /**
   * Create a new experiment with variants.
   */
  createExperiment(config) {
    const {
      id,
      name,
      description,
      variants,
      trafficAllocation = 100,
      startDate = new Date(),
      endDate = null,
      metrics = [],
    } = config;

    if (!id) throw new Error('Experiment ID is required');
    if (!name) throw new Error('Experiment name is required');
    if (!variants || variants.length < 2) {
      throw new Error('At least 2 variants are required');
    }

    const totalWeight = variants.reduce((sum, v) => sum + (v.weight || 1), 0);
    if (totalWeight <= 0) {
      throw new Error('Variant weights must sum to > 0');
    }

    const experiment = {
      id,
      name,
      description: description || '',
      variants: variants.map((v) => ({
        id: v.id,
        name: v.name,
        description: v.description || '',
        weight: v.weight || 1,
        config: v.config || {},
      })),
      trafficAllocation: Math.min(Math.max(trafficAllocation, 0), 100),
      status: 'draft', // draft | running | paused | completed | terminated
      startDate,
      endDate,
      metrics,
      createdAt: new Date(),
      updatedAt: new Date(),
      assignments: new Map(), // userId -> variantId
      events: [], // experiment event log
    };

    this.experiments.set(id, experiment);
    this.metrics.set(id, {});
    this.results.set(id, null);

    console.log(`[A/B Test] Created experiment: ${id} (${name}) with ${variants.length} variants`);
    return experiment;
  }

  /**
   * Start an experiment.
   */
  startExperiment(id) {
    const experiment = this.experiments.get(id);
    if (!experiment) throw new Error(`Experiment ${id} not found`);
    if (experiment.status !== 'draft' && experiment.status !== 'paused') {
      throw new Error(`Cannot start experiment in status: ${experiment.status}`);
    }

    experiment.status = 'running';
    experiment.startDate = new Date();
    experiment.updatedAt = new Date();
    this._logEvent(experiment, 'started');
    return experiment;
  }

  /**
   * Pause an experiment.
   */
  pauseExperiment(id) {
    const experiment = this.experiments.get(id);
    if (!experiment) throw new Error(`Experiment ${id} not found`);
    if (experiment.status !== 'running') {
      throw new Error(`Cannot pause experiment in status: ${experiment.status}`);
    }

    experiment.status = 'paused';
    experiment.updatedAt = new Date();
    this._logEvent(experiment, 'paused');
    return experiment;
  }

  /**
   * Terminate an experiment.
   */
  terminateExperiment(id, reason = '') {
    const experiment = this.experiments.get(id);
    if (!experiment) throw new Error(`Experiment ${id} not found`);

    experiment.status = 'terminated';
    experiment.endDate = new Date();
    experiment.updatedAt = new Date();
    this._logEvent(experiment, 'terminated', { reason });

    // Calculate final results
    this.results.set(id, this.calculateResults(id));
    return experiment;
  }

  /**
   * Get experiment by ID.
   */
  getExperiment(id) {
    return this.experiments.get(id);
  }

  /**
   * List all experiments.
   */
  listExperiments(status = null) {
    const all = Array.from(this.experiments.values());
    if (status) {
      return all.filter((e) => e.status === status);
    }
    return all.map((e) => ({
      id: e.id,
      name: e.name,
      status: e.status,
      variants: e.variants.map((v) => ({ id: v.id, name: v.name })),
      startDate: e.startDate,
      endDate: e.endDate,
      totalAssignments: e.assignments.size,
      createdAt: e.createdAt,
    }));
  }

  /**
   * Assign a user to a variant.
   * Uses deterministic hash-based assignment for consistency.
   */
  assignUser(experimentId, userId) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) throw new Error(`Experiment ${experimentId} not found`);
    if (experiment.status !== 'running') {
      throw new Error(`Experiment ${experimentId} is not running (status: ${experiment.status})`);
    }

    // Check if already assigned
    if (experiment.assignments.has(userId)) {
      return experiment.assignments.get(userId);
    }

    // Check traffic allocation
    const hash = crypto.createHash('md5').update(`${experimentId}:${userId}`).digest('hex');
    const hashPercent = parseInt(hash.substring(0, 8), 16) % 100;

    if (hashPercent >= experiment.trafficAllocation) {
      return null; // Not part of experiment
    }

    // Weighted random assignment based on hash
    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    const hashValue = parseInt(hash.substring(8, 16), 16) % totalWeight;

    let cumulativeWeight = 0;
    for (const variant of experiment.variants) {
      cumulativeWeight += variant.weight;
      if (hashValue < cumulativeWeight) {
        experiment.assignments.set(userId, variant.id);
        this._logEvent(experiment, 'assignment', { userId, variantId: variant.id });
        return variant.id;
      }
    }

    // Fallback to first variant
    const fallbackVariant = experiment.variants[0].id;
    experiment.assignments.set(userId, fallbackVariant);
    return fallbackVariant;
  }

  /**
   * Get the variant a user is assigned to.
   */
  getUserVariant(experimentId, userId) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) throw new Error(`Experiment ${experimentId} not found`);
    return experiment.assignments.get(userId) || null;
  }

  /**
   * Track a metric event for a user.
   */
  trackMetric(experimentId, userId, metricName, value = 1) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) throw new Error(`Experiment ${experimentId} not found`);

    if (!experiment.metrics.includes(metricName)) {
      experiment.metrics.push(metricName);
    }

    const variantId = this.getUserVariant(experimentId, userId);
    if (!variantId) return;

    const key = `${experimentId}:${variantId}:${metricName}`;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    this.metrics.get(key).push({
      userId,
      value,
      timestamp: new Date(),
    });

    this._logEvent(experiment, 'metric', { userId, variantId, metricName, value });
  }

  /**
   * Calculate statistical results for an experiment.
   */
  calculateResults(experimentId) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) throw new Error(`Experiment ${experimentId} not found`);

    const variantResults = [];
    for (const variant of experiment.variants) {
      const variantMetrics = {};
      for (const metric of experiment.metrics) {
        const key = `${experimentId}:${variant.id}:${metric}`;
        const data = this.metrics.get(key) || [];
        if (data.length === 0) {
          variantMetrics[metric] = { count: 0, mean: 0, stdDev: 0, values: [] };
          continue;
        }

        const values = data.map((d) => d.value);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
        const stdDev = Math.sqrt(variance);

        variantMetrics[metric] = {
          count: values.length,
          mean: parseFloat(mean.toFixed(4)),
          stdDev: parseFloat(stdDev.toFixed(4)),
          sum: parseFloat(values.reduce((a, b) => a + b, 0).toFixed(4)),
          values: values.slice(-100), // Last 100 for distribution
        };
      }

      variantResults.push({
        variantId: variant.id,
        variantName: variant.name,
        assignments: experiment.assignments.size,
        metrics: variantMetrics,
      });
    }

    // Calculate significance between primary metric of control vs each variant
    const significanceResults = this._calculateSignificance(experiment, variantResults);

    return {
      experimentId,
      experimentName: experiment.name,
      status: experiment.status,
      totalAssignments: experiment.assignments.size,
      duration: experiment.startDate && experiment.endDate
        ? Math.round((experiment.endDate - experiment.startDate) / (1000 * 60 * 60 * 24))
        : null,
      variants: variantResults,
      significance: significanceResults,
      calculatedAt: new Date(),
    };
  }

  /**
   * Get calculated results.
   */
  getResults(experimentId) {
    return this.results.get(experimentId);
  }

  /**
   * Get all metrics for a variant.
   */
  getVariantMetrics(experimentId, variantId, metricName) {
    const key = `${experimentId}:${variantId}:${metricName}`;
    return this.metrics.get(key) || [];
  }

  /**
   * Log an experiment event.
   */
  _logEvent(experiment, type, data = {}) {
    experiment.events.push({
      type,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Calculate statistical significance (t-test) between control and variants.
   */
  _calculateSignificance(experiment, variantResults) {
    const controlMetric = experiment.metrics[0];
    const controlVariant = variantResults[0];
    const controlData = controlVariant?.metrics[controlMetric];

    if (!controlData || controlData.count < 2) return [];

    const results = [];
    for (let i = 1; i < variantResults.length; i++) {
      const variant = variantResults[i];
      const variantData = variant.metrics[controlMetric];

      if (!variantData || variantData.count < 2) {
        results.push({
          variantId: variant.variantId,
          variantName: variant.variantName,
          metric: controlMetric,
          pValue: null,
          significant: false,
          error: 'Insufficient data',
        });
        continue;
      }

      // Welch's t-test
      const n1 = controlData.count;
      const n2 = variantData.count;
      const mean1 = controlData.mean;
      const mean2 = variantData.mean;
      const var1 = controlData.stdDev ** 2;
      const var2 = variantData.stdDev ** 2;

      const tStat = (mean2 - mean1) / Math.sqrt(var1 / n1 + var2 / n2);
      const df = Math.pow(var1 / n1 + var2 / n2, 2) /
        (Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1));
      const pValue = this._twoTailedPValue(Math.abs(tStat), df);
      const lift = mean1 !== 0 ? ((mean2 - mean1) / mean1) * 100 : 0;

      // Calculate confidence interval (95%)
      const se = Math.sqrt(var1 / n1 + var2 / n2);
      const ciLower = (mean2 - mean1) - 1.96 * se;
      const ciUpper = (mean2 - mean1) + 1.96 * se;

      results.push({
        variantId: variant.variantId,
        variantName: variant.variantName,
        metric: controlMetric,
        controlMean: parseFloat(mean1.toFixed(4)),
        variantMean: parseFloat(mean2.toFixed(4)),
        lift: parseFloat(lift.toFixed(2)),
        tStat: parseFloat(tStat.toFixed(4)),
        pValue: parseFloat(pValue.toFixed(6)),
        significant: pValue < 0.05,
        confidenceInterval: {
          lower: parseFloat(ciLower.toFixed(4)),
          upper: parseFloat(ciUpper.toFixed(4)),
        },
      });
    }

    return results;
  }

  /**
   * Calculate two-tailed p-value using the t-distribution approximation.
   */
  _twoTailedPValue(t, df) {
    // Better approximation using incomplete beta function
    // Use the regularized incomplete beta function for t-distribution
    const x = df / (df + t * t);
    const a = df / 2;
    const b = 0.5;
    const p = this._regularizedIncompleteBeta(x, a, b);
    return p;
  }

  /**
   * Regularized incomplete beta function approximation.
   */
  _regularizedIncompleteBeta(x, a, b) {
    if (x < 0 || x > 1) return 0;
    if (x === 0 || x === 1) return x;

    // Use continued fraction method
    const lbeta = this._logBeta(a, b);
    const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta - Math.log(a));
    const f = this._continuedFraction(x, a, b);

    return front * f / a;
  }

  /**
   * Log beta function.
   */
  _logBeta(a, b) {
    return this._logGamma(a) + this._logGamma(b) - this._logGamma(a + b);
  }

  /**
   * Log gamma function using Stirling's approximation.
   */
  _logGamma(x) {
    const coefs = [
      76.18009172947146,
      -86.50532032941677,
      24.01409824083091,
      -1.231739572450155,
      0.1208650973866179e-2,
      -0.5395239384953e-5,
    ];
    let y = x;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) {
      y += 1;
      ser += coefs[j] / y;
    }
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  /**
   * Lentz's continued fraction method.
   */
  _continuedFraction(x, a, b) {
    const MAX_ITER = 200;
    const TINY = 1e-30;

    let f = 1;
    let C = 1;
    let D = 1 - (a + b) * x / (a + 1);

    if (Math.abs(D) < TINY) D = TINY;
    D = 1 / D;
    f = D;

    for (let m = 1; m <= MAX_ITER; m++) {
      let numerator = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
      D = 1 + numerator * D;
      if (Math.abs(D) < TINY) D = TINY;
      C = 1 + numerator / C;
      if (Math.abs(C) < TINY) C = TINY;
      D = 1 / D;
      f *= D * C;

      numerator = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
      D = 1 + numerator * D;
      if (Math.abs(D) < TINY) D = TINY;
      C = 1 + numerator / C;
      if (Math.abs(C) < TINY) C = TINY;
      D = 1 / D;
      const delta = D * C;
      f *= delta;

      if (Math.abs(delta - 1) < 1e-10) break;
    }

    return f;
  }
}

module.exports = { ExperimentManager };