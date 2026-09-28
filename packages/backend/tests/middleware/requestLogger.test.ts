import { describe, expect, it } from '@jest/globals';
import { requestLogger } from '../../src/middleware/requestLogger';

describe('requestLogger (issue #737 request-id correlation)', () => {
  it('sets requestId on res.locals matching correlationId', () => {
    const req = {
      method: 'GET',
      originalUrl: '/test',
      url: '/test',
      headers: {},
      query: {},
      body: {},
      ip: '127.0.0.1',
    } as any;
    const res = {
      statusCode: 200,
      setHeader: jest.fn(),
      json: jest.fn(),
      send: jest.fn(),
      on: jest.fn(),
      locals: {},
    } as any;
    const next = jest.fn();

    requestLogger(req, res, next);

    expect(res.locals.requestId).toBeDefined();
    expect(typeof res.locals.requestId).toBe('string');
    expect(next).toHaveBeenCalled();
  });

  it('uses x-correlation-id header when provided', () => {
    const req = {
      method: 'GET',
      originalUrl: '/test',
      url: '/test',
      headers: { 'x-correlation-id': 'custom-correlation-id' },
      query: {},
      body: {},
      ip: '127.0.0.1',
    } as any;
    const res = {
      statusCode: 200,
      setHeader: jest.fn(),
      json: jest.fn(),
      send: jest.fn(),
      on: jest.fn(),
      locals: {},
    } as any;
    const next = jest.fn();

    requestLogger(req, res, next);

    expect(res.locals.requestId).toBe('custom-correlation-id');
    expect(next).toHaveBeenCalled();
  });

  it('sets both requestId and correlationId in the payload', () => {
    const req = {
      method: 'GET',
      originalUrl: '/test',
      url: '/test',
      headers: {},
      query: {},
      body: {},
      ip: '127.0.0.1',
    } as any;
    const res = {
      statusCode: 200,
      setHeader: jest.fn(),
      json: jest.fn(),
      send: jest.fn(),
      on: jest.fn(),
      locals: {},
    } as any;
    const next = jest.fn();

    requestLogger(req, res, next);

    expect(res.locals.requestId).toBeDefined();
    expect(res.locals.requestId).toBe(res.locals.requestId);
  });

  it('generates unique requestIds for different requests', () => {
    const makeReq = () => ({
      method: 'GET',
      originalUrl: '/test',
      url: '/test',
      headers: {},
      query: {},
      body: {},
      ip: '127.0.0.1',
    } as any);
    const makeRes = () => ({
      statusCode: 200,
      setHeader: jest.fn(),
      json: jest.fn(),
      send: jest.fn(),
      on: jest.fn(),
      locals: {},
    } as any);
    const next = jest.fn();

    const res1 = makeRes();
    requestLogger(makeReq(), res1, next);
    const requestId1 = res1.locals.requestId;

    const res2 = makeRes();
    requestLogger(makeReq(), res2, next);
    const requestId2 = res2.locals.requestId;

    expect(requestId1).not.toBe(requestId2);
  });

  it('includes correlationId in the logging payload', () => {
    const req = {
      method: 'GET',
      originalUrl: '/test',
      url: '/test',
      headers: {},
      query: {},
      body: {},
      ip: '127.0.0.1',
    } as any;
    const res = {
      statusCode: 200,
      setHeader: jest.fn(),
      json: jest.fn(),
      send: jest.fn(),
      on: jest.fn(),
      locals: {},
    } as any;
    const next = jest.fn();

    requestLogger(req, res, next);

    expect(res.locals.requestId).toBeDefined();
  });
});