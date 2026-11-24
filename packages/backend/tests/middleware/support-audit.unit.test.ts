jest.mock('../../src/db/dataSource', () => {
  const repo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };
  return {
    AppDataSource: { getRepository: jest.fn(() => repo) },
    initDataSource: jest.fn().mockResolvedValue(undefined),
    __repo: repo,
  };
});

import { recordSupportAudit, appendAuditLog } from '../../src/middleware/audit';

const { __repo: repo } = jest.requireMock('../../src/db/dataSource') as {
  __repo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
};

describe('support action audit logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    repo.findOne.mockResolvedValue(null);
    repo.create.mockImplementation((data: Record<string, unknown>) => ({
      ...data,
      generateLogHash: jest.fn(() => 'generated-hash'),
    }));
    repo.save.mockImplementation(async (entity: Record<string, unknown>) => ({
      id: 'log-1',
      ...entity,
    }));
  });

  it('awaits a support access entry with actor, reason, reference and timestamp', async () => {
    const entry = await recordSupportAudit({
      action: 'support_booking_access',
      actorId: 'admin-1',
      actorEmail: 'support@example.com',
      reason: 'Passenger called about a missed connection',
      bookingReference: 'TQ-ABC123',
      bookingId: 'booking-1',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    });

    expect(entry.id).toBe('log-1');
    expect(repo.findOne).toHaveBeenCalledTimes(1);
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledTimes(1);

    const data = repo.create.mock.calls[0][0];
    expect(data.actorType).toBe('admin');
    expect(data.adminId).toBe('admin-1');
    expect(data.adminEmail).toBe('support@example.com');
    expect(data.userId).toBeNull();
    expect(data.action).toBe('support_booking_access');
    expect(data.resource).toBe('bookings');
    expect(data.resourceId).toBe('TQ-ABC123');
    expect(JSON.parse(data.details)).toEqual({
      reason: 'Passenger called about a missed connection',
      bookingId: 'booking-1',
    });
    expect(data.previousLogHash).toBeNull();
    expect(data.createdAt).toBeInstanceOf(Date);
    expect(data.ipAddress).toBe('127.0.0.1');
    expect(data.logHash).toBe('');
    expect(repo.save.mock.calls[0][0].logHash).toBe('generated-hash');
  });

  it('records change, denial and failure actions through the same chain', async () => {
    for (const action of [
      'support_booking_change',
      'support_access_denied',
      'support_change_failed',
    ] as const) {
      await recordSupportAudit({
        action,
        actorId: 'admin-2',
        reason: 'Refund review ticket 42',
        bookingReference: 'TQ-XYZ',
      });
    }

    expect(repo.save).toHaveBeenCalledTimes(3);
    expect(repo.create.mock.calls.map((call: any[]) => call[0].action)).toEqual([
      'support_booking_change',
      'support_access_denied',
      'support_change_failed',
    ]);
  });

  it('links each entry to the previous hash so the chain stays intact', async () => {
    repo.findOne.mockResolvedValue({ logHash: 'previous-hash' });

    await appendAuditLog({
      action: 'support_booking_access',
      resource: 'bookings',
      resourceId: 'TQ-CHAIN',
      actorType: 'user',
      actorId: 'user-1',
      actorEmail: 'traveler@example.com',
      details: { reason: 'Status enquiry' },
    });

    const data = repo.create.mock.calls[0][0];
    expect(data.previousLogHash).toBe('previous-hash');
    expect(data.userId).toBe('user-1');
    expect(data.adminId).toBeNull();
  });

  it('rejects an entry that is missing a reason, reference or actor', async () => {
    const base = {
      action: 'support_booking_access' as const,
      actorId: 'admin-1',
      reason: 'Valid reason',
      bookingReference: 'TQ-REF',
    };

    await expect(recordSupportAudit({ ...base, reason: '   ' })).rejects.toThrow(
      'Support audit requires a reason'
    );
    await expect(recordSupportAudit({ ...base, bookingReference: '' })).rejects.toThrow(
      'Support audit requires a booking reference'
    );
    await expect(recordSupportAudit({ ...base, actorId: '' })).rejects.toThrow(
      'Support audit requires an actor'
    );
    expect(repo.save).not.toHaveBeenCalled();
  });
});
