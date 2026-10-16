import { mlServiceWrapper } from '../services/mlServiceWrapper';
import { MockFactories } from '../testing/mockFactories';

describe('ML Models Snapshot Tests', () => {
  test('RevenuePredictionModel baseline predictions snapshot', () => {
    const model = mlServiceWrapper.getRevenueModel();
    const historicalData = MockFactories.createMLHistoricalData(30);
    const predictions = model.predict(historicalData, 7);

    expect(predictions).toBeDefined();
    expect(predictions.length).toBe(7);
    expect(predictions[0]).toHaveProperty('predictedValue');
    expect(predictions[0]).toHaveProperty('confidenceLevel');
    expect(predictions).toMatchSnapshot();
  });

  test('ChurnPredictionModel baseline score snapshot', () => {
    const model = mlServiceWrapper.getChurnModel();
    const userProfile = MockFactories.createMLUserProfile();
    const churnResult = model.predictChurn(userProfile);

    expect(churnResult).toBeDefined();
    expect(churnResult.riskLevel).toBe('low');
    expect(churnResult).toMatchSnapshot();
  });

  test('AnomalyDetectionModel snapshot', () => {
    const model = mlServiceWrapper.getAnomalyModel();
    const data = [
      { date: '2026-01-01', value: 100 },
      { date: '2026-01-02', value: 105 },
      { date: '2026-01-03', value: 98 },
      { date: '2026-01-04', value: 102 },
      { date: '2026-01-05', value: 500 }, // anomaly
      { date: '2026-01-06', value: 101 },
    ];

    const result = model.detect(data, { threshold: 2.0 });
    expect(result).toBeDefined();
    expect(result.anomalies.length).toBeGreaterThan(0);
    expect(result).toMatchSnapshot();
  });

  test('RecommendationEngine baseline snapshot', () => {
    const engine = mlServiceWrapper.getRecommendationEngine();
    const catalog = [
      { id: 'item-1', popularity: 500, airline: 'TQ', route: 'JFK-LHR', price: 450 },
      { id: 'item-2', popularity: 1200, airline: 'BA', route: 'LHR-CDG', price: 200 },
      { id: 'item-3', popularity: 300, airline: 'AF', route: 'CDG-FCO', price: 150 },
    ];
    const userProfile = MockFactories.createMLUserProfile();

    const recommendations = engine.recommend(userProfile, catalog);
    expect(recommendations).toBeDefined();
    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations).toMatchSnapshot();
  });

  test('ModelTrainingPipeline evaluation snapshot', async () => {
    const pipeline = mlServiceWrapper.getPipeline();
    const testData = MockFactories.createMLHistoricalData(14);
    
    // Train revenue model first
    await pipeline.trainModel('revenue', testData);
    const evaluation = pipeline.evaluate('revenue', testData);

    expect(evaluation).toBeDefined();
    expect(evaluation).toHaveProperty('mape');
    expect(evaluation).toMatchSnapshot();
  });
});
