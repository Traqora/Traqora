// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  RevenuePredictionModel,
  ChurnPredictionModel,
  AnomalyDetectionModel,
  RecommendationEngine,
} = require('../ml/models');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ModelTrainingPipeline } = require('../ml/training');

export interface RevenuePredictionPoint {
  day: number;
  predictedValue: number;
  lowerBound: number;
  upperBound: number;
  confidenceLevel: number;
}

export interface ChurnPredictionResult {
  score: number;
  riskLevel: 'low' | 'medium' | 'high';
  factors: Array<{ factor: string; impact: number; description: string }>;
}

export interface AnomalyResult {
  anomalies: Array<{
    index: number;
    timestamp: string | null;
    value: number;
    zScore: number;
    expectedValue: number;
    deviation: number;
    severity: 'low' | 'medium' | 'high';
  }>;
  stats: {
    mean: number;
    stdDev: number;
    threshold: number;
    totalPoints: number;
    anomalyCount: number;
  };
}

export interface RecommendationResult {
  itemId: string;
  score: string;
  reason: string;
}

export class MLServiceWrapper {
  private pipeline = new ModelTrainingPipeline();

  getRevenueModel(): typeof RevenuePredictionModel.prototype {
    return this.pipeline.getModel('revenue');
  }

  getChurnModel(): typeof ChurnPredictionModel.prototype {
    return this.pipeline.getModel('churn');
  }

  getAnomalyModel(): typeof AnomalyDetectionModel.prototype {
    return this.pipeline.getModel('anomaly');
  }

  getRecommendationEngine(): typeof RecommendationEngine.prototype {
    return this.pipeline.getModel('recommendation');
  }

  getPipeline(): typeof ModelTrainingPipeline.prototype {
    return this.pipeline;
  }
}

export const mlServiceWrapper = new MLServiceWrapper();
