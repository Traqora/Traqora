import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app';
import { AppDataSource, initDataSource } from '../../src/db/dataSource';
import { config } from '../../src/config';
import { TravelDocument } from '../../src/db/entities/TravelDocument';

const WALLET = 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA';
const OTHER_WALLET = 'GZYXWVUTSRQPONMLKJIHGFEDCBAZYXWVUTSRQPONMLKJIHGFEDCBA';

const token = jwt.sign({ walletAddress: WALLET, walletType: 'freighter' }, config.jwtSecret, {
  expiresIn: '1h',
});
const otherToken = jwt.sign(
  { walletAddress: OTHER_WALLET, walletType: 'freighter' },
  config.jwtSecret,
  { expiresIn: '1h' },
);

describe('user profile customization (issue #374)', () => {
  let app: import('express').Express;

  beforeAll(async () => {
    await initDataSource();
    app = await createApp({ globalRateLimit: false, tieredRateLimit: false });
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/users/profile');
    expect(res.status).toBe(401);
  });

  it('returns an empty default profile before any update', async () => {
    const res = await request(app)
      .get('/api/v1/users/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      userId: WALLET,
      displayName: null,
      bio: null,
      avatarUrl: null,
      travelPreferences: null,
      kycChecklist: {
        status: 'not_started',
        items: { identityDocument: false, identityVerified: false },
      },
    });
  });

  it('rejects an update with no fields', async () => {
    const res = await request(app)
      .patch('/api/v1/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('rejects an invalid avatarUrl', async () => {
    const res = await request(app)
      .patch('/api/v1/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: 'not-a-url' });

    expect(res.status).toBe(400);
  });

  it('rejects a displayName over 80 characters', async () => {
    const res = await request(app)
      .patch('/api/v1/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'x'.repeat(81) });

    expect(res.status).toBe(400);
  });

  it('creates a profile on first update and persists all fields', async () => {
    const res = await request(app)
      .patch('/api/v1/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        displayName: 'Ada Explorer',
        bio: 'Loves open-jaw itineraries.',
        avatarUrl: 'https://cdn.example.com/avatars/ada.png',
        travelPreferences: { seatPreference: 'window', preferredCabinClass: 'business' },
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      userId: WALLET,
      displayName: 'Ada Explorer',
      bio: 'Loves open-jaw itineraries.',
      avatarUrl: 'https://cdn.example.com/avatars/ada.png',
      travelPreferences: { seatPreference: 'window', preferredCabinClass: 'business' },
    });

    const getRes = await request(app)
      .get('/api/v1/users/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.body.data.displayName).toBe('Ada Explorer');
  });

  it('reports verified KYC after the traveler has a verified document', async () => {
    const documentRepo = AppDataSource.getRepository(TravelDocument);
    await documentRepo.save(documentRepo.create({
      walletAddress: WALLET,
      documentType: 'passport',
      documentNumber: 'P1234567',
      fullName: 'Ada Explorer',
      issuingCountry: 'GB',
      expiryDate: '2030-01-01',
      verificationStatus: 'verified',
      isPrimary: true,
      isDeleted: false,
    }));

    const res = await request(app)
      .get('/api/v1/users/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.kycChecklist).toEqual({
      status: 'verified',
      items: { identityDocument: true, identityVerified: true },
    });
  });

  it('does not treat a rejected document as verified KYC', async () => {
    const documentRepo = AppDataSource.getRepository(TravelDocument);
    await documentRepo.save(documentRepo.create({
      walletAddress: OTHER_WALLET,
      documentType: 'national_id',
      documentNumber: 'ID123456',
      fullName: 'Partial User',
      issuingCountry: 'US',
      expiryDate: '2030-01-01',
      verificationStatus: 'rejected',
      isPrimary: true,
      isDeleted: false,
    }));

    const res = await request(app)
      .get('/api/v1/users/profile')
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.kycChecklist).toEqual({
      status: 'rejected',
      items: { identityDocument: true, identityVerified: false },
    });
  });

  it('performs a partial update without clobbering other fields', async () => {
    await request(app)
      .patch('/api/v1/users/profile')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ displayName: 'Partial User', bio: 'original bio' });

    const res = await request(app)
      .patch('/api/v1/users/profile')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ bio: 'updated bio only' });

    expect(res.status).toBe(200);
    expect(res.body.data.displayName).toBe('Partial User');
    expect(res.body.data.bio).toBe('updated bio only');
  });

  it('scopes profiles per wallet', async () => {
    const res = await request(app)
      .get('/api/v1/users/profile')
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.body.data.userId).toBe(OTHER_WALLET);
    expect(res.body.data.displayName).toBe('Partial User');
  });
});
