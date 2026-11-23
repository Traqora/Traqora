/**
 * Revenue Forecasting Service (#241)
 *
 * Provides 7-day, 30-day, and 90-day revenue forecasts with confidence
 * intervals, scenario modeling, and model accuracy metrics.
 */

const { RevenuePredictionModel } = require('../ml/models');

class RevenueForecastingService {
  constructor() {
    this.model = new RevenuePredictionModel();
    this.forecastHistory = [];
    this.accuracyMetrics = [];
  }

  /**
   * Generate revenue forecasts for multiple time horizons.
   */
  async forecast(historicalData, options = {}) {
    const {
      includeConfidenceIntervals = true,
      includeScenarioModeling = true,
    } = options;

    const forecasts = {
      forecast7d: this._forecastHorizon(historicalData, 7),
      forecast30d: this._forecastHorizon(historicalData, 30),
      forecast90d: this._forecastHorizon(historicalData, 90),
      metadata: {
        generatedAt: new Date().toISOString(),
        dataPoints: historicalData.length,
        historicalRange: this._getHistoricalRange(historicalData),
        includeConfidenceIntervals,
        includeScenarioModeling,
      },
    };

    if (includeScenarioModeling) {
      forecasts.scenarios = this._scenarioModeling(historicalData);
    }

    // Track forecast for accuracy comparison later
    this.forecastHistory.push({
      timestamp: new Date().toISOString(),
      forecasts: {
        '7d': forecasts.forecast7d.slice(-1)[0]?.predictedValue,
        '30d': forecasts.forecast30d.slice(-1)[0]?.predictedValue,
        '90d': forecasts.forecast90d.slice(-1)[0]?.predictedValue,
      },
    });

    return forecasts;
  }

  /**
   * Generate forecast for a specific horizon.
   */
  _forecastHorizon(historicalData, days) {
    return this.model.predict(historicalData, days);
  }

  /**
   * Scenario modeling: best case, worst case, and most likely.
   */
  _scenarioModeling(historicalData) {
    const baseForecast = this._forecastHorizon(historicalData, 30);
    if (baseForecast.length === 0) return null;

    const totalBase = baseForecast.reduce((sum, d) => sum + d.predictedValue, 0);

    // Calculate historical volatility
    const values = historicalData.map((d) => d.value || d.revenue || 0);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    const volatility = Math.sqrt(variance) / mean;

    return {
      baseCase: parseFloat(totalBase.toFixed(2)),
      bestCase: parseFloat((totalBase * (1 + volatility)).toFixed(2)),
      worstCase: parseFloat((totalBase * Math.max(0, 1 - volatility)).toFixed(2)),
      optimisticCase: parseFloat((totalBase * (1 + volatility * 0.5)).toFixed(2)),
      pessimisticCase: parseFloat((totalBase * Math.max(0, 1 - volatility * 0.5)).toFixed(2)),
      volatility: parseFloat((volatility * 100).toFixed(2)),
      confidenceLevel: Math.max(0, Math.min(100, (1 - volatility) * 100)).toFixed(1),
    };
  }

  /**
   * Compare forecast against actual values and calculate accuracy.
   */
  async compareActualVsForecast(historicalData, actualData) {
    const forecast30d = this._forecastHorizon(historicalData, 30);
    const comparison = [];
    let totalError = 0;
    let count = 0;

    for (let i = 0; i < Math.min(forecast30d.length, actualData.length); i++) {
      const forecasted = forecast30d[i].predictedValue;
      const actual = actualData[i].value || actualData[i].revenue || 0;
      const error = actual - forecasted;
      const absPercentError = actual !== 0 ? Math.abs(error / actual) * 100 : 0;
      totalError += absPercentError;
      count++;

      comparison.push({
        day: i + 1,
        forecasted: parseFloat(forecasted.toFixed(2)),
        actual: parseFloat(actual.toFixed(2)),
        error: parseFloat(error.toFixed(2)),
        absPercentError: parseFloat(absPercentError.toFixed(2)),
      });
    }

    const mape = count > 0 ? totalError / count : 0;

    const metric = {
      timestamp: new Date().toISOString(),
      mape: parseFloat(mape.toFixed(2)),
      accuracy: Math.max(0, 100 - mape).toFixed(2) + '%',
      dataPoints: count,
      comparison: comparison.slice(-30), // Last 30 comparisons
    };

    this.accuracyMetrics.push(metric);

    return metric;
  }

  /**
   * Get model accuracy metrics over time.
   */
  getAccuracyMetrics(limit = 10) {
    return this.accuracyMetrics.slice(-limit);
  }

  /**
   * Get the historical data date range.
   */
  _getHistoricalRange(historicalData) {
    if (!historicalData || historicalData.length === 0) return null;
    const dates = historicalData
      .map((d) => d.date || d.timestamp)
      .filter(Boolean)
      .sort();
    return {
      start: dates[0] || 'unknown',
      end: dates[dates.length - 1] || 'unknown',
    };
  }

  /**
   * Train the forecasting model with historical data.
   */
  async train(data) {
    return this.model.train(data);
  }

  /**
   * Get a specific day's forecast detail.
   */
  getDayForecast(historicalData, day) {
    const forecast = this._forecastHorizon(historicalData, day);
    return forecast.length > 0 ? forecast[forecast.length - 1] : null;
  }

  /**
   * Aggregate forecast into weekly buckets.
   */
  aggregateWeekly(historicalData, weeks = 13) {
    const daily = this._forecastHorizon(historicalData, weeks * 7);
    const weekly = [];

    for (let w = 0; w < weeks; w++) {
      const weekDays = daily.slice(w * 7, (w + 1) * 7);
      if (weekDays.length === 0) break;

      weekly.push({
        week: w + 1,
        weekStart: `Week ${w + 1}`,
        total: parseFloat(weekDays.reduce((sum, d) => sum + d.predictedValue, 0).toFixed(2)),
        avg: parseFloat((weekDays.reduce((sum, d) => sum + d.predictedValue, 0) / weekDays.length).toFixed(2)),
        min: parseFloat(Math.min(...weekDays.map((d) => d.lowerBound)).toFixed(2)),
        max: parseFloat(Math.max(...weekDays.map((d) => d.upperBound)).toFixed(2)),
        confidenceLevel: parseFloat((weekDays.reduce((sum, d) => sum + (d.confidenceLevel || 0), 0) / weekDays.length).toFixed(4)),
      });
    }

    return weekly;
  }
}

module.exports = { RevenueForecastingService };