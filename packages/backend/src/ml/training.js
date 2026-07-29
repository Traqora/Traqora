/**
 * ML Model Training Pipeline (#259)
 *
 * Orchestrates model training, data preprocessing, feature engineering,
 * evaluation, and retraining scheduling.
 */

const { RevenuePredictionModel, ChurnPredictionModel, AnomalyDetectionModel, RecommendationEngine } = require('./models');

class ModelTrainingPipeline {
  constructor() {
    this.models = {
      revenue: new RevenuePredictionModel(),
      churn: new ChurnPredictionModel(),
      anomaly: new AnomalyDetectionModel(),
      recommendation: new RecommendationEngine(),
    };
    this.trainingHistory = [];
    this.trainingIntervalMs = 24 * 60 * 60 * 1000; // Daily retraining
    this.intervals = new Map();
  }

  /**
   * Preprocess raw data for training.
   */
  preprocess(data, modelType) {
    switch (modelType) {
      case 'revenue':
        return this._preprocessRevenueData(data);
      case 'churn':
        return this._preprocessChurnData(data);
      case 'anomaly':
        return this._preprocessAnomalyData(data);
      case 'recommendation':
        return this._preprocessRecommendationData(data);
      default:
        throw new Error(`Unknown model type: ${modelType}`);
    }
  }

  /**
   * Train a specific model.
   */
  async trainModel(modelType, data) {
    const model = this.models[modelType];
    if (!model) throw new Error(`Unknown model type: ${modelType}`);

    const startTime = Date.now();
    const preprocessed = this.preprocess(data, modelType);

    try {
      const result = model.train(preprocessed);
      const duration = Date.now() - startTime;

      const record = {
        modelType,
        trainedAt: new Date().toISOString(),
        dataPoints: result.dataPoints || result.records || result.interactions || 0,
        durationMs: duration,
        success: true,
      };

      this.trainingHistory.push(record);
      console.log(`[ML-Training] ${modelType} model trained in ${duration}ms (${record.dataPoints} data points)`);
      return record;
    } catch (err) {
      const record = {
        modelType,
        trainedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        success: false,
        error: err.message,
      };
      this.trainingHistory.push(record);
      console.error(`[ML-Training] ${modelType} training failed:`, err.message);
      return record;
    }
  }

  /**
   * Train all models.
   */
  async trainAll(data) {
    const results = {};
    for (const modelType of Object.keys(this.models)) {
      results[modelType] = await this.trainModel(modelType, data[modelType] || data);
    }
    return results;
  }

  /**
   * Start scheduled retraining.
   */
  startScheduledRetraining(dataFetcher) {
    console.log(`[ML-Training] Starting scheduled retraining every ${this.trainingIntervalMs / (60 * 60 * 1000)}h`);

    const runTraining = async () => {
      try {
        const data = await dataFetcher();
        await this.trainAll(data);
      } catch (err) {
        console.error('[ML-Training] Scheduled retraining failed:', err.message);
      }
    };

    // Run immediately, then on interval
    runTraining();
    const interval = setInterval(runTraining, this.trainingIntervalMs);
    this.intervals.set('retraining', interval);
  }

  /**
   * Stop scheduled retraining.
   */
  stopScheduledRetraining() {
    for (const [key, interval] of this.intervals.entries()) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }

  /**
   * Get training history.
   */
  getTrainingHistory(limit = 50) {
    return this.trainingHistory.slice(-limit);
  }

  /**
   * Get a trained model instance.
   */
  getModel(modelType) {
    return this.models[modelType];
  }

  /**
   * Evaluate model performance on test data.
   */
  evaluate(modelType, testData) {
    const model = this.models[modelType];
    if (!model) throw new Error(`Unknown model type: ${modelType}`);

    switch (modelType) {
      case 'revenue':
        return this._evaluateRevenueModel(model, testData);
      case 'churn':
        return this._evaluateChurnModel(model, testData);
      default:
        return { message: 'Evaluation not implemented for this model type' };
    }
  }

  /**
   * Preprocess revenue data.
   */
  _preprocessRevenueData(data) {
    if (!Array.isArray(data)) return [];
    return data.map((d, i) => ({
      ...d,
      day_of_week: d.date ? new Date(d.date).getDay() : i % 7,
      month: d.date ? new Date(d.date).getMonth() : 0,
      is_holiday: this._isHoliday(d.date || null),
    }));
  }

  /**
   * Preprocess churn data.
   */
  _preprocessChurnData(data) {
    if (!Array.isArray(data)) return [];
    return data.map((d) => ({
      ...d,
      refundRate: d.refundRate || (d.refundCount && d.totalBookings ? d.refundCount / d.totalBookings : 0),
      cancelationRate: d.cancelationRate || (d.canceledBookings && d.totalBookings ? d.canceledBookings / d.totalBookings : 0),
      bookingFrequency30d: d.bookingFrequency30d || (d.bookingsLast30d || 0) / 30,
    }));
  }

  /**
   * Preprocess anomaly data.
   */
  _preprocessAnomalyData(data) {
    if (!Array.isArray(data)) return [];
    return data.filter((d) => {
      const val = typeof d === 'number' ? d : d.value || d.revenue || 0;
      return val !== null && val !== undefined && !isNaN(val);
    });
  }

  /**
   * Preprocess recommendation data.
   */
  _preprocessRecommendationData(data) {
    if (!Array.isArray(data)) return [];
    return data;
  }

  /**
   * Evaluate revenue model.
   */
  _evaluateRevenueModel(model, testData) {
    const actuals = testData.map((d) => d.value || d.revenue || 0);
    const predictions = model.predict(testData, testData.length);

    if (predictions.length === 0) return { error: 'No predictions generated' };

    const mape = actuals.reduce((sum, actual, i) => {
      const predicted = predictions[i]?.predictedValue || 0;
      return sum + (actual !== 0 ? Math.abs((actual - predicted) / actual) : 0);
    }, 0) / Math.min(actuals.length, predictions.length);

    const mae = actuals.reduce((sum, actual, i) => {
      const predicted = predictions[i]?.predictedValue || 0;
      return sum + Math.abs(actual - predicted);
    }, 0) / Math.min(actuals.length, predictions.length);

    return {
      mape: parseFloat((mape * 100).toFixed(2)), // Mean Absolute Percentage Error
      mae: parseFloat(mae.toFixed(2)),            // Mean Absolute Error
      sampleSize: Math.min(actuals.length, predictions.length),
      accuracy: Math.max(0, 100 - mape * 100).toFixed(2) + '%',
    };
  }

  /**
   * Evaluate churn model.
   */
  _evaluateChurnModel(model, testData) {
    let correct = 0;
    let total = 0;

    for (const user of testData) {
      if (user.actualChurn === undefined) continue;
      const prediction = model.predictChurn(user);
      const predictedChurn = prediction.riskLevel === 'high';
      total++;
      if (predictedChurn === user.actualChurn) {
        correct++;
      }
    }

    return {
      accuracy: total > 0 ? parseFloat(((correct / total) * 100).toFixed(2)) + '%' : 'N/A',
      correctPredictions: correct,
      totalPredictions: total,
    };
  }

  /**
   * Check if a date is a known holiday.
   */
  _isHoliday(date) {
    if (!date) return false;

    const d = new Date(date);
    const month = d.getMonth() + 1;
    const day = d.getDate();

    // Major holidays
    const holidays = [
      { m: 1, d: 1 },   // New Year's Day
      { m: 12, d: 25 }, // Christmas
      { m: 12, d: 26 }, // Boxing Day
      { m: 7, d: 4 },   // Independence Day (US)
      { m: 11, d: 28 }, // Thanksgiving (simplified)
    ];

    return holidays.some((h) => h.m === month && h.d === day);
  }
}

module.exports = { ModelTrainingPipeline };