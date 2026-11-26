import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { getMetadataArgsStorage, IsNull, type ValueTransformer } from 'typeorm';
import { adminOperationsRoutes } from '../src/api/routes/admin/operations';
import { config } from '../src/config';
import { AppDataSource } from '../src/db/dataSource';
import { Booking } from '../src/db/entities/Booking';
import { errorHandler } from '../src/utils/errorHandler';
import { redactValue } from '../src/utils/structuredLogger';

jest.mock('../src/db/dataSource', () => ({
  AppDataSource: { getRepository: jest.fn() },
}));
jest.mock('../src/services/errorTracking', () => ({
  captureException: jest.fn(),
}));

const id = '1cdac91b-be61-411b-9596-43b66cf9ae31';
const path = `/bookings/${id}/supplier-reference`;
const reference = 'SUPPLIER-EXAMPLE';
const body = { supplierBookingReference: reference };

function auth(role: 'admin' | 'support'): string {
  return `Bearer ${jwt.sign({ adminId: 'operator', email: 'operator@example.com', role }, config.jwtSecret)}`;
}

describe('supplier booking reference routes', () => {
  const app = express().use(express.json(), adminOperationsRoutes, errorHandler);
  const update = jest.fn();
  const query = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  beforeEach(() => {
    update.mockReset();
    query.getOne.mockReset();
    jest.mocked(AppDataSource.getRepository).mockReturnValue({
      createQueryBuilder: () => query,
      update,
    } as unknown as ReturnType<typeof AppDataSource.getRepository>);
  });

  it('stores a valid confirmation without echoing it', async () => {
    update.mockResolvedValue({ affected: 1 });
    const response = await request(app).put(path).set('Authorization', auth('admin')).send(body);
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(update).toHaveBeenCalledWith({ id, supplierBookingReference: IsNull() }, body);
  });

  it('encrypts the reference column and excludes it from ordinary queries', () => {
    const column = getMetadataArgsStorage().columns.find(
      ({ target, propertyName }) => target === Booking && propertyName === 'supplierBookingReference',
    );
    expect(column?.options.select).toBe(false);
    const transformer = column?.options.transformer as ValueTransformer;
    const ciphertext = transformer.to(reference) as string;
    expect(ciphertext).not.toContain(reference);
    expect(transformer.from(ciphertext)).toBe(reference);
  });

  it('requires reconciliation permission to read or write', async () => {
    expect((await request(app).get(path)).status).toBe(401);
    const token = auth('support');
    expect((await request(app).get(path).set('Authorization', token)).status).toBe(403);
    expect((await request(app).put(path).set('Authorization', token).send(body)).status).toBe(403);
    expect(AppDataSource.getRepository).not.toHaveBeenCalled();
  });

  it('returns an explicitly selected reference only to an authorized operator', async () => {
    query.getOne.mockResolvedValue({ id, ...body });
    const response = await request(app).get(path).set('Authorization', auth('admin'));
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toEqual(body);
    expect(query.addSelect).toHaveBeenCalledWith('booking.supplierBookingReference');
    expect(redactValue({ data: body })).toEqual({
      data: { supplierBookingReference: '[REDACTED]' },
    });
  });

  it.each([
    [{ id, ...body }, 204],
    [{ id, supplierBookingReference: 'OTHER-EXAMPLE' }, 409],
    [null, 404],
  ])('handles a retry without replacing an existing confirmation (HTTP %s)', async (booking, status) => {
    update.mockResolvedValue({ affected: 0 });
    query.getOne.mockResolvedValue(booking);
    const response = await request(app).put(path).set('Authorization', auth('admin')).send(body);
    expect(response.status).toBe(status);
    expect(response.text).not.toContain(reference);
  });

  it('rejects invalid references and hides SQL error details', async () => {
    const token = auth('admin');
    const bad = await request(app).put(path).set('Authorization', token)
      .send({ supplierBookingReference: ' ' });
    expect(bad.status).toBe(400);
    expect(update).not.toHaveBeenCalled();

    update.mockRejectedValue(new Error(reference));
    const failed = await request(app).put(path).set('Authorization', token).send(body);
    expect(failed.status).toBe(500);
    expect(failed.text).not.toContain(reference);
  });
});
