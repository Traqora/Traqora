import { AppDataSource } from '../../src/db/dataSource';
import { CheckIn } from '../../src/db/entities/CheckIn';
import {
  buildAppleWalletPass,
  DEFAULT_PASS_TYPE_IDENTIFIER,
  DEV_TEAM_IDENTIFIER,
  getAppleWalletConfig,
} from '../../src/services/walletPass';
import { CheckInService } from '../../src/services/checkinService';
import { ConflictError, InternalServerError, NotFoundError, UnprocessableEntityError } from '../../src/utils/errors';

const config = { passTypeIdentifier: 'pass.com.example.test', teamIdentifier: 'TEAM123', organizationName: 'Traqora' };

const makeCheckIn = (overrides: any = {}): CheckIn =>
  ({
    id: 'checkin-1',
    status: 'checked_in',
    seatNumber: '12A',
    boardingPassCode: 'ABCDEF1234567890',
    booking: {
      id: 'booking-1',
      status: 'confirmed',
      flight: {
        airlineCode: 'TQ',
        flightNumber: '101',
        fromAirport: 'LOS',
        toAirport: 'ACC',
        departureTime: new Date('2026-10-01T09:30:00.000Z'),
        gate: 'B4',
        terminal: '2',
      },
      passenger: { firstName: 'Ada', lastName: 'Obi' },
      ...(overrides.booking || {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== 'booking')),
  }) as unknown as CheckIn;

describe('buildAppleWalletPass', () => {
  it('builds a pass.json with top-level barcodes, identifiers and relevance dates', () => {
    const pass = buildAppleWalletPass(makeCheckIn(), config);

    expect(pass).toMatchObject({
      formatVersion: 1,
      passTypeIdentifier: 'pass.com.example.test',
      teamIdentifier: 'TEAM123',
      serialNumber: 'checkin-1',
      description: 'TQ101 boarding pass',
      organizationName: 'Traqora',
      relevantDate: '2026-10-01T09:30:00.000Z',
      expirationDate: '2026-10-02T09:30:00.000Z',
    });
    expect(pass.barcodes).toEqual([
      {
        format: 'PKBarcodeFormatQR',
        message: 'ABCDEF1234567890',
        messageEncoding: 'iso-8859-1',
        altText: 'ABCDEF1234567890',
      },
    ]);
    expect(pass.boardingPass).not.toHaveProperty('barcodes');
    expect(pass.boardingPass.transitType).toBe('PKTransitTypeAir');
    expect(pass.boardingPass.primaryFields.map((f) => f.value)).toEqual(['LOS', 'ACC']);
    expect(pass.boardingPass.secondaryFields).toContainEqual({ key: 'seat', label: 'SEAT', value: '12A' });
    expect(pass.boardingPass.headerFields).toEqual([{ key: 'gate', label: 'GATE', value: 'B4' }]);
  });

  it('falls back to placeholders for optional seat, gate and terminal', () => {
    const pass = buildAppleWalletPass(
      makeCheckIn({ seatNumber: null, booking: { flight: { ...makeCheckIn().booking.flight, gate: undefined, terminal: undefined } } }),
      config,
    );
    expect(pass.boardingPass.secondaryFields).toContainEqual({ key: 'seat', label: 'SEAT', value: 'N/A' });
    expect(pass.boardingPass.headerFields[0].value).toBe('TBD');
    expect(pass.boardingPass.auxiliaryFields).toContainEqual({ key: 'terminal', label: 'TERMINAL', value: 'TBD' });
  });

  it('rejects a check-in that is not checked in (409)', () => {
    expect(() => buildAppleWalletPass(makeCheckIn({ status: 'pending' }), config)).toThrow(ConflictError);
  });

  it.each(['failed', 'refunded'])('rejects %s bookings (409)', (status) => {
    expect(() => buildAppleWalletPass(makeCheckIn({ booking: { status } }), config)).toThrow(
      `Wallet pass is not available for ${status} bookings`,
    );
  });

  it.each([
    ['missing flight', { booking: { flight: undefined } }, /flight details/],
    ['missing passenger', { booking: { passenger: undefined } }, /passenger details/],
    ['missing boarding pass code', { boardingPassCode: '' }, /boarding pass code/],
    [
      'invalid departure time',
      { booking: { flight: { ...makeCheckIn().booking.flight, departureTime: 'not-a-date' } } },
      /departure time is invalid/,
    ],
  ])('rejects %s (422)', (_label, overrides, message) => {
    const run = () => buildAppleWalletPass(makeCheckIn(overrides), config);
    expect(run).toThrow(UnprocessableEntityError);
    expect(run).toThrow(message);
  });
});

describe('getAppleWalletConfig', () => {
  it('uses environment identifiers when set', () => {
    expect(
      getAppleWalletConfig({ NODE_ENV: 'production', APPLE_WALLET_PASS_TYPE_ID: 'pass.x', APPLE_WALLET_TEAM_ID: 'T1' }),
    ).toEqual({ passTypeIdentifier: 'pass.x', teamIdentifier: 'T1', organizationName: 'Traqora' });
  });

  it('falls back to dev identifiers outside production', () => {
    expect(getAppleWalletConfig({ NODE_ENV: 'test' })).toEqual({
      passTypeIdentifier: DEFAULT_PASS_TYPE_IDENTIFIER,
      teamIdentifier: DEV_TEAM_IDENTIFIER,
      organizationName: 'Traqora',
    });
  });

  it('fails in production when identifiers are missing', () => {
    expect(() => getAppleWalletConfig({ NODE_ENV: 'production', APPLE_WALLET_PASS_TYPE_ID: 'pass.x' })).toThrow(
      InternalServerError,
    );
  });
});

describe('CheckInService.generateWalletPass', () => {
  let repoSpy: jest.SpyInstance;
  let findOne: jest.Mock;

  beforeEach(() => {
    findOne = jest.fn();
    repoSpy = jest.spyOn(AppDataSource, 'getRepository').mockReturnValue({ findOne } as any);
  });

  afterEach(() => repoSpy.mockRestore());

  it('returns the pass plus a QR data URL for a checked-in booking', async () => {
    findOne.mockResolvedValue(makeCheckIn());
    const pass = await new CheckInService().generateWalletPass('booking-1');

    expect(pass.barcodes[0].message).toBe('ABCDEF1234567890');
    expect(pass.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('returns 404 when the booking has no check-in', async () => {
    findOne.mockResolvedValue(null);
    await expect(new CheckInService().generateWalletPass('missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses to issue a pass for a refunded booking', async () => {
    findOne.mockResolvedValue(makeCheckIn({ booking: { status: 'refunded' } }));
    await expect(new CheckInService().generateWalletPass('booking-1')).rejects.toBeInstanceOf(ConflictError);
  });
});
