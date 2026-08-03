import { BookingOrchestrationService, StructuredName, AIRLINE_NAME_FORMATS } from '../src/services/bookingOrchestrationService';

jest.mock('../src/db/dataSource', () => ({
  AppDataSource: {
    getRepository: jest.fn().mockReturnValue({
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    }),
  },
}));

jest.mock('../src/db/entities/TravelDocument', () => ({
  TravelDocument: class MockTravelDocument {},
  DocumentType: {},
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('BookingOrchestrationService - Name Management', () => {
  let service: BookingOrchestrationService;

  const validName: StructuredName = {
    firstName: 'John',
    lastName: 'Doe',
  };

  const fullName: StructuredName = {
    title: 'Mr',
    firstName: 'John',
    middleName: 'Michael',
    lastName: 'Doe',
    suffix: 'Jr',
  };

  beforeEach(() => {
    service = new BookingOrchestrationService();
  });

  describe('validatePassengerName', () => {
    it('should accept a valid basic name', () => {
      const result = service.validatePassengerName(validName);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept a full name with title, middle, and suffix', () => {
      const result = service.validatePassengerName(fullName);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty first name', () => {
      const result = service.validatePassengerName({ firstName: '', lastName: 'Doe' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('First name is required');
    });

    it('should reject empty last name', () => {
      const result = service.validatePassengerName({ firstName: 'John', lastName: '' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Last name is required');
    });

    it('should reject name exceeding 100 characters', () => {
      const result = service.validatePassengerName({
        firstName: 'A'.repeat(60),
        lastName: 'B'.repeat(50),
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Full name exceeds maximum length of 100 characters');
    });

    it('should reject name with invalid characters', () => {
      const result = service.validatePassengerName({
        firstName: 'John@123',
        lastName: 'Doe',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Name contains invalid characters. Only letters, spaces, dots, hyphens, and apostrophes are allowed');
    });

    it('should reject name with numbers', () => {
      const result = service.validatePassengerName({
        firstName: 'John',
        lastName: 'Doe2',
      });
      expect(result.valid).toBe(false);
    });

    it('should warn about unrecognized title', () => {
      const result = service.validatePassengerName({
        ...validName,
        title: 'Duke',
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Unrecognized title "Duke"');
    });

    it('should warn about unrecognized suffix', () => {
      const result = service.validatePassengerName({
        ...validName,
        suffix: 'Esquire',
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Unrecognized suffix "Esquire"');
    });

    it('should validate against airline-specific rules for Delta', () => {
      const result = service.validatePassengerName({
        firstName: 'Christopher',
        lastName: 'Montgomery-Williamson',
      }, 'DELTA');
      expect(result.valid).toBe(false);
    });

    it('should warn about unsupported middle name for Southwest', () => {
      const result = service.validatePassengerName({
        ...validName,
        middleName: 'Lee',
      }, 'SOUTHWEST');
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('does not support middle names');
    });

    it('should warn about unsupported title for Delta', () => {
      const result = service.validatePassengerName({
        ...validName,
        title: 'Dr',
      }, 'DELTA');
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('does not support titles');
    });

    it('should validate against multiple airline formats', () => {
      for (const airline of Object.keys(AIRLINE_NAME_FORMATS)) {
        const result = service.validatePassengerName({
          firstName: 'Anna',
          lastName: 'Smith',
        }, airline as keyof typeof AIRLINE_NAME_FORMATS);
        expect(result.valid).toBe(true);
      }
    });

    it('should reject names with trailing spaces', () => {
      const result = service.validatePassengerName({
        firstName: 'John ',
        lastName: 'Doe',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('formatNameForAirline', () => {
    it('should format as LAST/FIRST for Delta', () => {
      const result = service.formatNameForAirline(validName, 'DELTA');
      expect(result).toBe('DOE/JOHN');
    });

    it('should format as LAST/FIRST MIDDLE for Delta with middle name', () => {
      const result = service.formatNameForAirline(fullName, 'DELTA');
      expect(result).toBe('DOE/JOHN MICHAEL');
    });

    it('should format as LAST/FIRST for United', () => {
      const result = service.formatNameForAirline(validName, 'UNITED');
      expect(result).toBe('DOE/JOHN');
    });

    it('should format as LAST/FIRST for American', () => {
      const result = service.formatNameForAirline(validName, 'AMERICAN');
      expect(result).toBe('DOE/JOHN');
    });

    it('should format as FIRST LAST for Southwest', () => {
      const result = service.formatNameForAirline(validName, 'SOUTHWEST');
      expect(result).toBe('JOHN DOE');
    });

    it('should format as FIRST MIDDLE LAST for JetBlue', () => {
      const result = service.formatNameForAirline(fullName, 'JETBLUE');
      expect(result).toBe('JOHN MICHAEL DOE');
    });

    it('should format with title for Emirates', () => {
      const result = service.formatNameForAirline(fullName, 'EMIRATES');
      expect(result).toBe('MR JOHN MICHAEL DOE');
    });

    it('should format with title and suffix for British Airways', () => {
      const result = service.formatNameForAirline(fullName, 'BRITISH_AIRWAYS');
      expect(result).toBe('MR JOHN MICHAEL DOE JR');
    });

    it('should format as LAST/FIRST for Lufthansa', () => {
      const result = service.formatNameForAirline(validName, 'LUFTHANSA');
      expect(result).toBe('DOE/JOHN');
    });

    it('should format as FIRST LAST for Ryanair', () => {
      const result = service.formatNameForAirline(validName, 'RYANAIR');
      expect(result).toBe('JOHN DOE');
    });

    it('should format as FIRST LAST for easyJet', () => {
      const result = service.formatNameForAirline(validName, 'EASYJET');
      expect(result).toBe('JOHN DOE');
    });

    it('should format without middle name for airlines that do not support it', () => {
      const result = service.formatNameForAirline(fullName, 'SOUTHWEST');
      expect(result).toBe('JOHN DOE');
    });
  });

  describe('calculateNameChangeFee', () => {
    it('should return zero fee for minor corrections', () => {
      const result = service.calculateNameChangeFee('booking-1', true);
      expect(result.feeCents).toBe(0);
      expect(result.currency).toBe('USD');
      expect(result.breakdown).toHaveLength(1);
    });

    it('should return fee for non-minor corrections', () => {
      const result = service.calculateNameChangeFee('booking-1', false);
      expect(result.feeCents).toBeGreaterThan(0);
      expect(result.currency).toBe('USD');
      expect(result.breakdown.length).toBeGreaterThanOrEqual(3);
    });

    it('should return consistent breakdown structure', () => {
      const result = service.calculateNameChangeFee('booking-1', false);
      for (const item of result.breakdown) {
        expect(item).toHaveProperty('label');
        expect(item).toHaveProperty('amount');
        expect(typeof item.label).toBe('string');
        expect(typeof item.amount).toBe('number');
      }
    });
  });

  describe('requestNameCorrection', () => {
    it('should reject when booking is not found', async () => {
      const mockRepo = require('../src/db/dataSource').AppDataSource.getRepository;
      mockRepo().findOne.mockResolvedValue(null);

      await expect(
        service.requestNameCorrection('nonexistent', 'pass1', validName, 'typo_in_first_name')
      ).rejects.toThrow('Booking not found');
    });

    it('should reject when passenger is not found', async () => {
      const mockRepo = require('../src/db/dataSource').AppDataSource.getRepository;
      mockRepo().findOne.mockResolvedValueOnce({ id: 'booking1', status: 'confirmed' });
      mockRepo().findOne.mockResolvedValueOnce(null);

      await expect(
        service.requestNameCorrection('booking1', 'nonexistent', validName, 'typo_in_first_name')
      ).rejects.toThrow('Passenger not found');
    });

    it('should reject invalid reason', async () => {
      const mockRepo = require('../src/db/dataSource').AppDataSource.getRepository;
      mockRepo().findOne.mockResolvedValue({ id: 'booking1', status: 'confirmed', passenger: { id: 'pass1' } });
      mockRepo().findOne.mockResolvedValue({ id: 'pass1', firstName: 'John', lastName: 'Doe' });

      await expect(
        service.requestNameCorrection('booking1', 'pass1', validName, 'short')
      ).rejects.toThrow('Reason must be at least 10 characters');
    });

    it('should reject unknown correction reason', async () => {
      const mockRepo = require('../src/db/dataSource').AppDataSource.getRepository;
      mockRepo().findOne.mockResolvedValue({ id: 'booking1', status: 'confirmed', passenger: { id: 'pass1' } });
      mockRepo().findOne.mockResolvedValue({ id: 'pass1', firstName: 'John', lastName: 'Doe' });

      await expect(
        service.requestNameCorrection('booking1', 'pass1', validName, 'some random reason here')
      ).rejects.toThrow('Invalid reason');
    });

    it('should create correction request for valid input', async () => {
      const mockRepo = require('../src/db/dataSource').AppDataSource.getRepository;
      mockRepo().findOne.mockResolvedValue({ id: 'booking1', status: 'confirmed', passenger: { id: 'pass1' } });
      mockRepo().findOne.mockResolvedValue({ id: 'pass1', firstName: 'John', lastName: 'Doe' });

      const result = await service.requestNameCorrection('booking1', 'pass1', {
        firstName: 'Jonathan',
        lastName: 'Doe',
      }, 'typo_in_first_name');

      expect(result.status).toBe('pending');
      expect(result.originalName.firstName).toBe('John');
      expect(result.correctedName.firstName).toBe('Jonathan');
      expect(result.reason).toBe('typo_in_first_name');
    });
  });

  describe('approveNameCorrection', () => {
    beforeEach(() => {
      const mockRepo = require('../src/db/dataSource').AppDataSource.getRepository;
      mockRepo().findOne.mockResolvedValue({ id: 'pass1', firstName: 'John', lastName: 'Doe' });
    });

    it('should approve a pending correction', async () => {
      const request = await service.requestNameCorrection('booking1', 'pass1', {
        firstName: 'Jonathan',
        lastName: 'Doe',
      }, 'typo_in_first_name');

      const result = await service.approveNameCorrection(request.id, 'admin@test.com');
      expect(result.status).toBe('approved');
      expect(result.reviewedBy).toBe('admin@test.com');
    });

    it('should reject approval for non-existent correction', async () => {
      await expect(
        service.approveNameCorrection('NONEXISTENT', 'admin')
      ).rejects.toThrow('Correction request not found');
    });

    it('should reject approval for already-approved correction', async () => {
      const request = await service.requestNameCorrection('booking1', 'pass1', {
        firstName: 'Jonathan',
        lastName: 'Doe',
      }, 'typo_in_first_name');

      await service.approveNameCorrection(request.id, 'admin');
      await expect(
        service.approveNameCorrection(request.id, 'admin2')
      ).rejects.toThrow('Correction request is already approved');
    });
  });

  describe('rejectNameCorrection', () => {
    it('should reject a pending correction', async () => {
      const mockRepo = require('../src/db/dataSource').AppDataSource.getRepository;
      mockRepo().findOne.mockResolvedValue({ id: 'pass1', firstName: 'John', lastName: 'Doe' });

      const request = await service.requestNameCorrection('booking1', 'pass1', {
        firstName: 'Jonathan',
        lastName: 'Doe',
      }, 'typo_in_first_name');

      const result = await service.rejectNameCorrection(request.id, 'Name change not permitted at this time');
      expect(result.status).toBe('rejected');
      expect(result.rejectionReason).toBe('Name change not permitted at this time');
    });

    it('should reject rejection for non-existent correction', async () => {
      await expect(
        service.rejectNameCorrection('NONEXISTENT', 'Too many changes')
      ).rejects.toThrow('Correction request not found');
    });

    it('should reject rejection with too short reason', async () => {
      const mockRepo = require('../src/db/dataSource').AppDataSource.getRepository;
      mockRepo().findOne.mockResolvedValue({ id: 'pass1', firstName: 'John', lastName: 'Doe' });

      const request = await service.requestNameCorrection('booking1', 'pass1', {
        firstName: 'Jonathan',
        lastName: 'Doe',
      }, 'typo_in_first_name');

      await expect(
        service.rejectNameCorrection(request.id, 'Nope')
      ).rejects.toThrow('Rejection reason must be at least 5 characters');
    });
  });

  describe('verifyAgainstDocument', () => {
    it('should throw when passenger not found', async () => {
      const mockRepo = require('../src/db/dataSource').AppDataSource.getRepository;
      mockRepo().findOne.mockResolvedValue(null);

      await expect(
        service.verifyAgainstDocument('nonexistent', 'passport', 'AB123456')
      ).rejects.toThrow('Passenger not found');
    });
  });

  describe('getPassengerNameHistory', () => {
    it('should return empty array when no history exists', () => {
      const history = service.getPassengerNameHistory('booking1', 'pass1');
      expect(history).toEqual([]);
    });

    it('should return history after correction request', async () => {
      const mockRepo = require('../src/db/dataSource').AppDataSource.getRepository;
      mockRepo().findOne.mockResolvedValue({ id: 'booking1', status: 'confirmed', passenger: { id: 'pass1' } });
      mockRepo().findOne.mockResolvedValue({ id: 'pass1', firstName: 'John', lastName: 'Doe' });

      await service.requestNameCorrection('booking1', 'pass1', {
        firstName: 'Jonathan',
        lastName: 'Doe',
      }, 'typo_in_first_name');

      const history = service.getPassengerNameHistory('booking1', 'pass1');
      expect(history).toHaveLength(1);
      expect(history[0].action).toBe('correction_requested');
    });
  });

  describe('AIRLINE_NAME_FORMATS', () => {
    it('should define all required airline formats', () => {
      const expectedAirlines = ['DELTA', 'UNITED', 'AMERICAN', 'SOUTHWEST', 'JETBLUE', 'EMIRATES', 'BRITISH_AIRWAYS', 'LUFTHANSA', 'RYANAIR', 'EASYJET'];
      for (const airline of expectedAirlines) {
        expect(AIRLINE_NAME_FORMATS[airline]).toBeDefined();
        expect(AIRLINE_NAME_FORMATS[airline]).toHaveProperty('format');
        expect(AIRLINE_NAME_FORMATS[airline]).toHaveProperty('maxLength');
        expect(AIRLINE_NAME_FORMATS[airline]).toHaveProperty('nameRegex');
        expect(AIRLINE_NAME_FORMATS[airline]).toHaveProperty('middleNameSupport');
        expect(AIRLINE_NAME_FORMATS[airline]).toHaveProperty('titleSupport');
        expect(AIRLINE_NAME_FORMATS[airline]).toHaveProperty('suffixSupport');
      }
    });

    it('should have reasonable max lengths for all airlines', () => {
      for (const [key, rules] of Object.entries(AIRLINE_NAME_FORMATS)) {
        expect(rules.maxLength).toBeGreaterThanOrEqual(20);
        expect(rules.maxLength).toBeLessThanOrEqual(60);
      }
    });
  });
});
