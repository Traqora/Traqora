import test from 'node:test';
import assert from 'node:assert';
import { FlightSyncService } from './flightSync';

test('Flight Sync Batch Quarantine', async () => {
  const service = new FlightSyncService();
  const records = [
    { id: 'valid-1', providerId: 'p-1', flightNumber: 'AA123', origin: 'JFK', destination: 'LAX', departureTime: new Date().toISOString() },
    { id: 'invalid-1', flightNumber: '', origin: '', destination: '', departureTime: 'invalid-date' }
  ];

  const result = await service.synchronizeBatch(records as any);
  assert.strictEqual(result.quarantined.length, 1);
  assert.strictEqual(result.quarantined[0].record.id, 'invalid-1');
  assert.ok(result.quarantined[0].error);
});
