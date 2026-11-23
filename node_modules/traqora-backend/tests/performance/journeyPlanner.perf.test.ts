/**
 * Performance regression tests for journeyPlanner.
 * Measures route optimization, template usage, and multi-stop planning.
 */

import { measurePerf, assertPerfThresholds } from './perf-utils';

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('JourneyPlanner Performance', () => {
  let journeyPlanner: any;

  beforeAll(() => {
    journeyPlanner = require('../../src/services/journeyPlanner');
  });

  describe('route optimization', () => {
    const stops = [
      { id: '1', city: 'New York', airportCode: 'JFK', arrivalDate: '2026-08-01', departureDate: '2026-08-03', activities: ['Sightseeing'], sequenceOrder: 0 },
      { id: '2', city: 'London', airportCode: 'LHR', arrivalDate: '2026-08-03', departureDate: '2026-08-07', activities: ['Museums'], sequenceOrder: 1 },
      { id: '3', city: 'Paris', airportCode: 'CDG', arrivalDate: '2026-08-07', departureDate: '2026-08-10', activities: ['Eiffel Tower'], sequenceOrder: 2 },
      { id: '4', city: 'Rome', airportCode: 'FCO', arrivalDate: '2026-08-10', departureDate: '2026-08-14', activities: ['Colosseum'], sequenceOrder: 3 },
      { id: '5', city: 'Tokyo', airportCode: 'HND', arrivalDate: '2026-08-14', departureDate: '2026-08-21', activities: ['Temples'], sequenceOrder: 4 },
    ];

    it('should optimize route with 5 stops within 100ms', async () => {
      const stats = await measurePerf(
        () => journeyPlanner.optimizeRoute(stops, 'JFK'),
        15
      );
      assertPerfThresholds(stats, { meanMaxMs: 100, maxMs: 200 });
    });

    it('should optimize route with 3 stops within 50ms', async () => {
      const shortStops = stops.slice(0, 3);

      const stats = await measurePerf(
        () => journeyPlanner.optimizeRoute(shortStops, 'JFK'),
        20
      );
      assertPerfThresholds(stats, { meanMaxMs: 50, maxMs: 100 });
    });
  });

  describe('template management', () => {
    it('should get available templates within 20ms', async () => {
      const stats = await measurePerf(
        () => journeyPlanner.getTemplates(),
        25
      );
      assertPerfThresholds(stats, { meanMaxMs: 20, maxMs: 50 });
    });

    it('should get template by id within 10ms', async () => {
      const stats = await measurePerf(
        () => journeyPlanner.getTemplateById('european-capitals'),
        25
      );
      assertPerfThresholds(stats, { meanMaxMs: 10, maxMs: 30 });
    });

    it('should get templates filtered by category within 10ms', async () => {
      const stats = await measurePerf(
        () => journeyPlanner.getTemplatesByCategory('adventure'),
        25
      );
      assertPerfThresholds(stats, { meanMaxMs: 10, maxMs: 30 });
    });
  });

  describe('journey calculations', () => {
    it('should calculate total days within 5ms', async () => {
      const testStops = [
        { departureDate: '2026-08-01', arrivalDate: '2026-08-03' },
        { departureDate: '2026-08-03', arrivalDate: '2026-08-07' },
        { departureDate: '2026-08-07', arrivalDate: '2026-08-10' },
      ] as any[];

      const stats = await measurePerf(
        () => journeyPlanner.calculateTotalDays(testStops),
        25
      );
      assertPerfThresholds(stats, { meanMaxMs: 5, maxMs: 10 });
    });

    it('should generate share token within 5ms', async () => {
      const stats = await measurePerf(
        () => journeyPlanner.generateShareToken(),
        25
      );
      assertPerfThresholds(stats, { meanMaxMs: 5, maxMs: 15 });
    });
  });
});
