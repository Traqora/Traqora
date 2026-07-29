import { DataSourceService } from '../../../src/services/analytics/dataSourceService';

describe('DataSourceService', () => {
  let svc: DataSourceService;

  beforeEach(() => {
    svc = new DataSourceService();
  });

  describe('registerSource()', () => {
    it('adds source to catalog', () => {
      svc.registerSource({ id: 'src-1', name: 'Test API', type: 'rest', url: 'https://example.com/api' });
      const catalog = svc.getCatalog();
      expect(catalog).toHaveLength(1);
      expect(catalog[0].sourceId).toBe('src-1');
    });

    it('supports 5+ external sources', () => {
      for (let i = 0; i < 6; i++) {
        svc.registerSource({ id: `src-${i}`, name: `Source ${i}`, type: 'rest', url: `https://api${i}.example.com` });
      }
      expect(svc.getCatalog()).toHaveLength(6);
    });
  });

  describe('ingest()', () => {
    it('normalizes array payload into records', () => {
      svc.registerSource({ id: 'src-1', name: 'API', type: 'rest', url: 'https://example.com' });
      const records = svc.ingest('src-1', [{ price: 100 }, { price: 200 }]);
      expect(records).toHaveLength(2);
      expect(records[0].sourceId).toBe('src-1');
      expect(records[0].payload).toEqual({ price: 100 });
    });

    it('wraps non-array payload in single record', () => {
      svc.registerSource({ id: 'src-1', name: 'API', type: 'rest', url: 'https://example.com' });
      const records = svc.ingest('src-1', { price: 42 });
      expect(records).toHaveLength(1);
    });

    it('uses custom transform function when provided', () => {
      svc.registerSource({
        id: 'src-custom',
        name: 'Custom',
        type: 'graphql',
        url: 'https://graphql.example.com',
        transformFn: (raw) => {
          const d = raw as { items: { id: string }[] };
          return d.items.map((item) => ({
            sourceId: 'src-custom',
            recordedAt: new Date(),
            payload: { id: item.id },
            lineage: ['src-custom', 'transform-v1'],
          }));
        },
      });
      const records = svc.ingest('src-custom', { items: [{ id: 'a' }, { id: 'b' }] });
      expect(records).toHaveLength(2);
      expect(records[0].lineage).toContain('transform-v1');
    });

    it('throws for unknown source', () => {
      expect(() => svc.ingest('unknown', {})).toThrow('Unknown data source: unknown');
    });

    it('updates catalog record count after ingestion', () => {
      svc.registerSource({ id: 'src-1', name: 'API', type: 'rest', url: 'https://example.com' });
      svc.ingest('src-1', [{ a: 1 }, { a: 2 }, { a: 3 }]);
      const entry = svc.getCatalog().find((c) => c.sourceId === 'src-1');
      expect(entry?.recordCount).toBe(3);
      expect(entry?.lastIngested).toBeInstanceOf(Date);
    });
  });

  describe('getLineage()', () => {
    it('tracks data lineage per record', () => {
      svc.registerSource({ id: 'src-1', name: 'API', type: 'rest', url: 'https://example.com' });
      svc.ingest('src-1', [{ val: 1 }]);
      const lineage = svc.getLineage('src-1');
      expect(lineage).toHaveLength(1);
      expect(lineage[0]).toContain('src-1');
    });

    it('returns empty array for unknown source', () => {
      expect(svc.getLineage('no-such')).toHaveLength(0);
    });
  });

  describe('removeSource()', () => {
    it('removes source from catalog and clears records', () => {
      svc.registerSource({ id: 'src-1', name: 'API', type: 'rest', url: 'https://example.com' });
      svc.ingest('src-1', [{ v: 1 }]);
      svc.removeSource('src-1');
      expect(svc.getCatalog()).toHaveLength(0);
      expect(svc.getRecords('src-1')).toHaveLength(0);
    });
  });
});
