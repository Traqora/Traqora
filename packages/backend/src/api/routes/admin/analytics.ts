import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../../utils/errorHandler';
import { AppDataSource } from '../../../db/dataSource';
import { Booking } from '../../../db/entities/Booking';
import { Flight } from '../../../db/entities/Flight';
import { Passenger } from '../../../db/entities/Passenger';
import { requireAdmin, requireRole } from '../../../middleware/adminAuth';
import { BadRequestError, TooManyRequestsError } from '../../../utils/errors';
import { SelectQueryBuilder } from 'typeorm';

const router = Router();
const MAX_EXPORT_ROWS = 100000;
const DAILY_EXPORT_LIMIT = 5;
const exportUsage = new Map<string, { day: string; count: number }>();

type ExportDataset = 'revenue' | 'bookings' | 'distribution-history' | 'collaborator-earnings';
type ExportFormat = 'json' | 'csv' | 'xlsx';
type ExportRow = Record<string, string | number | null>;

const exportQuerySchema = z.object({
    dataset: z.enum(['revenue', 'bookings', 'distribution-history', 'collaborator-earnings']).default('bookings'),
    format: z.enum(['json', 'csv', 'xlsx']).default('csv'),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(MAX_EXPORT_ROWS).default(10000),
});

function checkExportRateLimit(req: Request) {
    const key = req.admin?.adminId || req.ip;
    const day = new Date().toISOString().slice(0, 10);
    const current = exportUsage.get(key);

    if (!current || current.day !== day) {
        exportUsage.set(key, { day, count: 1 });
        return;
    }

    if (current.count >= DAILY_EXPORT_LIMIT) {
        throw new TooManyRequestsError('Analytics export limit exceeded. Try again tomorrow.');
    }

    current.count += 1;
}

function applyDateRange(
    qb: SelectQueryBuilder<Booking>,
    startDate?: Date,
    endDate?: Date
) {
    if (startDate) qb.andWhere('booking.createdAt >= :startDate', { startDate });
    if (endDate) qb.andWhere('booking.createdAt <= :endDate', { endDate });
    return qb;
}

function centsToDollars(cents: number) {
    return Number((cents / 100).toFixed(2));
}

function dateKey(date: Date) {
    return date.toISOString().slice(0, 10);
}

async function getFilteredBookings(startDate: Date | undefined, endDate: Date | undefined, limit: number) {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const qb = bookingRepo
        .createQueryBuilder('booking')
        .leftJoinAndSelect('booking.flight', 'flight')
        .leftJoinAndSelect('booking.passenger', 'passenger')
        .orderBy('booking.createdAt', 'DESC')
        .take(limit);

    return applyDateRange(qb, startDate, endDate).getMany();
}

async function buildExportRows(
    dataset: ExportDataset,
    startDate: Date | undefined,
    endDate: Date | undefined,
    limit: number
): Promise<ExportRow[]> {
    const bookings = await getFilteredBookings(startDate, endDate, limit);

    if (dataset === 'bookings') {
        return bookings.map((booking) => ({
            bookingId: booking.id,
            status: booking.status,
            amountCents: booking.amountCents,
            amountUsd: centsToDollars(booking.amountCents),
            createdAt: booking.createdAt.toISOString(),
            updatedAt: booking.updatedAt.toISOString(),
            flightNumber: booking.flight?.flightNumber ?? null,
            route: booking.flight ? `${booking.flight.fromAirport}-${booking.flight.toAirport}` : null,
            passengerEmail: booking.passenger?.email ?? null,
        }));
    }

    if (dataset === 'distribution-history') {
        return bookings.map((booking) => ({
            bookingId: booking.id,
            status: booking.status,
            sorobanTxHash: booking.sorobanTxHash ?? null,
            sorobanBookingId: booking.sorobanBookingId ?? null,
            amountCents: booking.amountCents,
            amountUsd: centsToDollars(booking.amountCents),
            attempts: booking.contractSubmitAttempts,
            lastError: booking.lastError ?? null,
            createdAt: booking.createdAt.toISOString(),
            updatedAt: booking.updatedAt.toISOString(),
        }));
    }

    if (dataset === 'collaborator-earnings') {
        const totals = new Map<string, ExportRow>();
        for (const booking of bookings) {
            const passenger = booking.passenger;
            const key = passenger?.id ?? 'unknown';
            const existing = totals.get(key) ?? {
                collaboratorId: key,
                email: passenger?.email ?? null,
                name: passenger ? `${passenger.firstName} ${passenger.lastName}`.trim() : null,
                bookingCount: 0,
                totalEarningsCents: 0,
                totalEarningsUsd: 0,
            };
            existing.bookingCount = Number(existing.bookingCount) + 1;
            existing.totalEarningsCents = Number(existing.totalEarningsCents) + booking.amountCents;
            existing.totalEarningsUsd = centsToDollars(Number(existing.totalEarningsCents));
            totals.set(key, existing);
        }
        return Array.from(totals.values());
    }

    const revenueByDay = new Map<string, { bookings: number; revenueCents: number }>();
    for (const booking of bookings) {
        const key = dateKey(booking.createdAt);
        const current = revenueByDay.get(key) ?? { bookings: 0, revenueCents: 0 };
        current.bookings += 1;
        if (['confirmed', 'paid', 'onchain_submitted', 'onchain_pending'].includes(booking.status)) {
            current.revenueCents += booking.amountCents;
        }
        revenueByDay.set(key, current);
    }

    return Array.from(revenueByDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, row]) => ({
            date,
            bookings: row.bookings,
            revenueCents: row.revenueCents,
            revenueUsd: centsToDollars(row.revenueCents),
        }));
}

function toCsv(rows: ExportRow[]) {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const escape = (value: string | number | null) => {
        const text = value === null ? '' : String(value);
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n');
}

function crc32(buffer: Buffer) {
    let crc = -1;
    for (const byte of buffer) {
        crc ^= byte;
        for (let i = 0; i < 8; i += 1) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }
    return (crc ^ -1) >>> 0;
}

function zipStore(files: Array<{ name: string; data: Buffer }>) {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const file of files) {
        const name = Buffer.from(file.name);
        const crc = crc32(file.data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0, 6);
        local.writeUInt16LE(0, 8);
        local.writeUInt16LE(0, 10);
        local.writeUInt16LE(0, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(file.data.length, 18);
        local.writeUInt32LE(file.data.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        localParts.push(local, name, file.data);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0, 8);
        central.writeUInt16LE(0, 10);
        central.writeUInt16LE(0, 12);
        central.writeUInt16LE(0, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(file.data.length, 20);
        central.writeUInt32LE(file.data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt16LE(0, 30);
        central.writeUInt16LE(0, 32);
        central.writeUInt16LE(0, 34);
        central.writeUInt16LE(0, 36);
        central.writeUInt32LE(0, 38);
        central.writeUInt32LE(offset, 42);
        centralParts.push(central, name);
        offset += local.length + name.length + file.data.length;
    }

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, ...centralParts, end]);
}

function xmlEscape(value: string | number | null) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function columnName(index: number) {
    let name = '';
    let current = index + 1;
    while (current > 0) {
        const mod = (current - 1) % 26;
        name = String.fromCharCode(65 + mod) + name;
        current = Math.floor((current - mod) / 26);
    }
    return name;
}

function toXlsx(rows: ExportRow[]) {
    const headers = rows.length > 0 ? Object.keys(rows[0]) : ['message'];
    const dataRows: ExportRow[] = rows.length > 0 ? rows : [{ message: 'No rows matched the export filters' }];
    const sheetRows = [headers, ...dataRows.map((row) => headers.map((header) => row[header] ?? ''))]
        .map((row, rowIndex) => {
            const cells = row.map((value, columnIndex) => {
                const cellRef = `${columnName(columnIndex)}${rowIndex + 1}`;
                return `<c r="${cellRef}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
            });
            return `<row r="${rowIndex + 1}">${cells.join('')}</row>`;
        })
        .join('');

    const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;

    const files = [
        {
            name: '[Content_Types].xml',
            data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`),
        },
        {
            name: '_rels/.rels',
            data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
        },
        {
            name: 'xl/workbook.xml',
            data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Export" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
        },
        {
            name: 'xl/_rels/workbook.xml.rels',
            data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`),
        },
        { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(worksheet) },
    ];

    return zipStore(files);
}

function sendExport(res: Response, dataset: ExportDataset, format: ExportFormat, rows: ExportRow[]) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${dataset}-${timestamp}.${format}`;

    if (format === 'json') {
        return res.json({
            success: true,
            data: {
                dataset,
                count: rows.length,
                maxRows: MAX_EXPORT_ROWS,
                rows,
            },
        });
    }

    if (format === 'xlsx') {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(toXlsx(rows));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(toCsv(rows));
}

// GET /api/v1/admin/analytics
router.get('/', requireAdmin, requireRole('admin'), asyncHandler(async (_req: Request, res: Response) => {
    

    const bookingRepo = AppDataSource.getRepository(Booking);
    const flightRepo = AppDataSource.getRepository(Flight);
    const passengerRepo = AppDataSource.getRepository(Passenger);

    const [totalBookings, totalFlights, totalPassengers] = await Promise.all([
        bookingRepo.count(),
        flightRepo.count(),
        passengerRepo.count(),
    ]);

    // Aggregate revenue
    const revenueResult = await bookingRepo
        .createQueryBuilder('booking')
        .select('SUM(booking.amountCents)', 'total')
        .where("booking.status IN ('confirmed', 'paid', 'onchain_submitted', 'onchain_pending')")
        .getRawOne<{ total: string | null }>();

    const totalRevenueCents = Number(revenueResult?.total ?? 0);
    const averageFareCents = totalBookings > 0 ? Math.round(totalRevenueCents / totalBookings) : 0;

    // Per-status breakdown
    const statusCounts = await bookingRepo
        .createQueryBuilder('booking')
        .select('booking.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('booking.status')
        .getRawMany<{ status: string; count: string }>();

    const bookingsByStatus: Record<string, number> = {};
    for (const row of statusCounts) {
        bookingsByStatus[row.status] = Number(row.count);
    }

    return res.json({
        success: true,
        data: {
            totalBookings,
            totalRevenueCents,
            averageFareCents,
            bookingsByStatus,
            totalFlights,
            totalPassengers,
        },
    });
}));

// GET /api/v1/admin/analytics/export
router.get('/export', requireAdmin, requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
    const parsed = exportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        throw new BadRequestError('Validation Error', parsed.error.flatten());
    }

    const { dataset, format, startDate, endDate, limit } = parsed.data;
    if (startDate && endDate && startDate > endDate) {
        throw new BadRequestError('startDate must be before endDate');
    }

    checkExportRateLimit(req);
    const rows = await buildExportRows(dataset, startDate, endDate, limit);
    return sendExport(res, dataset, format, rows);
}));

export const adminAnalyticsRoutes = router;
