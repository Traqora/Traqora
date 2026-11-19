import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { pendingBookingAgeSeconds } from '../src/services/metrics';
import {
    BookingAgeRepository,
    PendingBookingAgeService,
    PENDING_BOOKING_STATUSES,
} from '../src/services/pendingBookingAgeService';
import type { BookingStatus } from '../src/db/entities/Booking';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const alertsPath = path.join(repoRoot, 'monitoring', 'prometheus', 'alerts.yml');
const alertmanagerPath = path.join(
    repoRoot,
    'monitoring',
    'alertmanager',
    'alertmanager.yml',
);

interface AlertRule {
    alert: string;
    expr: string;
    labels: Record<string, string>;
    annotations?: Record<string, string>;
}

interface AlertsFile {
    groups: Array<{ name: string; rules: AlertRule[] }>;
}

interface AlertmanagerRoute {
    receiver: string;
    group_by?: string[];
    matchers?: string[];
    routes?: AlertmanagerRoute[];
}

interface AlertmanagerFile {
    route: AlertmanagerRoute;
    receivers: Array<{ name: string }>;
}

const loadYaml = <T>(file: string): T => YAML.parse(fs.readFileSync(file, 'utf8')) as T;

describe('Stuck booking alert configuration (#1174)', () => {
    const alerts = loadYaml<AlertsFile>(alertsPath);
    const allRules = alerts.groups.flatMap((group) => group.rules);

    const stuckAlerts = () => allRules.filter((rule) => rule.alert.startsWith('StuckBooking'));

    it('defines stuck booking alerts', () => {
        expect(stuckAlerts().length).toBeGreaterThanOrEqual(2);
    });

    it('uses only the low-cardinality pending-booking-age metric with a status label', () => {
        for (const rule of stuckAlerts()) {
            expect(rule.expr).toContain('traqora_pending_booking_age_seconds');
            expect(rule.expr).toContain('status');
            expect(rule.expr).not.toMatch(/bookingId|booking_id|id=/);
        }
    });

    it('attaches explicit owner and dedup_key labels', () => {
        for (const rule of stuckAlerts()) {
            expect(rule.labels.owner).toBe('bookings-oncall');
            expect(rule.labels.dedup_key).toMatch(/^stuck-booking/);
            expect(rule.annotations?.runbook).toContain('stuck-bookings.md');
        }
    });

    it('uses a constant dedup_key per alert so alert instance ids never become labels', () => {
        for (const rule of stuckAlerts()) {
            expect(rule.labels.dedup_key).not.toMatch(/\{\{|\}\}/);
        }
        const keys = stuckAlerts().map((rule) => rule.labels.dedup_key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('routes stuck booking alerts to a dedicated receiver grouped by dedup_key', () => {
        const config = loadYaml<AlertmanagerFile>(alertmanagerPath);
        const stuckRoute = config.route.routes?.find((route) =>
            route.matchers?.some((matcher) => matcher.includes('StuckBooking')),
        );

        expect(stuckRoute).toBeDefined();
        expect(stuckRoute?.group_by).toContain('dedup_key');
        expect(stuckRoute?.group_by).toContain('owner');
        expect(config.receivers.map((receiver) => receiver.name)).toContain(stuckRoute?.receiver);
    });
});

describe('PendingBookingAgeService (#1174)', () => {
    const nowMs = Date.UTC(2026, 10, 19, 12, 0, 0);
    const makeRepo = (
        rows: Partial<Record<BookingStatus, Date>>,
    ): BookingAgeRepository => ({
        findOldestByStatus: jest.fn(async (status: BookingStatus) => {
            const updatedAt = rows[status];
            return updatedAt ? { updatedAt } : null;
        }),
    });

    beforeEach(() => {
        pendingBookingAgeSeconds.reset();
    });

    it('sets one low-cardinality gauge series per pending status with an age', async () => {
        const repo = makeRepo({
            awaiting_payment: new Date(nowMs - 900_000),
            onchain_pending: new Date(nowMs - 1_800_000),
        });
        const service = new PendingBookingAgeService(repo, () => nowMs);

        const rows = await service.refresh();

        expect(rows).toEqual([
            { status: 'awaiting_payment', oldestAgeSeconds: 900 },
            { status: 'onchain_pending', oldestAgeSeconds: 1800 },
        ]);
        expect(PENDING_BOOKING_STATUSES).toContain('onchain_submitted');
    });

    it('clears stale series when a status no longer has pending bookings', async () => {
        pendingBookingAgeSeconds.set({ status: 'awaiting_payment' }, 9999);
        const service = new PendingBookingAgeService(makeRepo({}), () => nowMs);

        await service.refresh();

        const metrics = await pendingBookingAgeSeconds.get();
        expect(metrics.values).toHaveLength(0);
    });

    it('clamps negative ages to zero for clock skew', async () => {
        const service = new PendingBookingAgeService(
            makeRepo({ payment_processing: new Date(nowMs + 60_000) }),
            () => nowMs,
        );

        const rows = await service.refresh();

        expect(rows).toEqual([{ status: 'payment_processing', oldestAgeSeconds: 0 }]);
    });
});
