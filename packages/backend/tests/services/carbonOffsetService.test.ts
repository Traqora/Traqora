import { CarbonOffsetService, CarbonFootprint, OffsetCost, SustainabilityStats } from '../../src/services/carbonOffsetService';
import { AppDataSource } from '../../src/db/dataSource';
import { OffsetProject } from '../../src/db/entities/OffsetProject';
import { CarbonOffset } from '../../src/db/entities/CarbonOffset';
import { Flight } from '../../src/db/entities/Flight';

jest.mock('../../src/db/dataSource', () => ({
  AppDataSource: {
    getRepository: jest.fn(),
  },
}));

describe('CarbonOffsetService', () => {
  let service: CarbonOffsetService;
  let mockProjectRepo: any;
  let mockOffsetRepo: any;
  let mockFlightRepo: any;

  const mockFlight = {
    id: 'flight-1',
    flightNumber: 'DL1234',
    fromAirport: 'JFK',
    toAirport: 'LAX',
    airlineCode: 'DL',
    seatsAvailable: 50,
    priceCents: 45000,
    status: 'SCHEDULED',
    dataSource: 'MANUAL',
    syncStatus: 'EXACT_MATCH',
    syncAttempts: 0,
    departureTime: new Date('2025-01-15T08:30:00Z'),
    arrivalTime: new Date('2025-01-15T11:45:00Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockProject = {
    id: 'project-1',
    name: 'Amazon Rainforest Reforestation',
    type: 'reforestation' as const,
    pricePerTonCents: 1500,
    description: 'Reforestation project',
    certifications: ['Verra VCS'],
    status: 'active',
    totalOffsetTons: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockOffset = {
    id: 'offset-1',
    userId: 'user-1',
    flightId: 'flight-1',
    projectId: 'project-1',
    project: mockProject,
    amountCents: 1500,
    co2Kg: 1000,
    tonsOffset: 1,
    status: 'completed',
    bookingId: 'booking-1',
    certificateRef: 'CRB-ABC123',
    sorobanTxHash: '0xtxhash',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    CarbonOffsetService.resetForTesting();

    mockProjectRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
      increment: jest.fn(),
    };

    mockOffsetRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
    };

    mockFlightRepo = {
      findOne: jest.fn(),
    };

    (AppDataSource.getRepository as jest.Mock).mockImplementation((entity: any) => {
      if (entity === OffsetProject) return mockProjectRepo;
      if (entity === CarbonOffset) return mockOffsetRepo;
      if (entity === Flight) return mockFlightRepo;
      return {};
    });

    service = CarbonOffsetService.getInstance();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ensureDefaultProjects', () => {
    it('should seed default projects if none exist', async () => {
      mockProjectRepo.count.mockResolvedValue(0);
      mockProjectRepo.create.mockReturnValue(mockProject);
      mockProjectRepo.save.mockResolvedValue(mockProject);

      await service.ensureDefaultProjects();

      expect(mockProjectRepo.count).toHaveBeenCalled();
      expect(mockProjectRepo.create).toHaveBeenCalledTimes(3);
      expect(mockProjectRepo.save).toHaveBeenCalledTimes(3);
    });

    it('should not seed if projects already exist', async () => {
      mockProjectRepo.count.mockResolvedValue(3);

      await service.ensureDefaultProjects();

      expect(mockProjectRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('calculateFlightFootprint', () => {
    it('should calculate carbon footprint for a flight', async () => {
      mockFlightRepo.findOne.mockResolvedValue(mockFlight);

      const result: CarbonFootprint = await service.calculateFlightFootprint('flight-1', 'economy');

      expect(result.flightId).toBe('flight-1');
      expect(result.totalCO2kg).toBeGreaterThan(0);
      expect(result.cabinClassFactor).toBe(1);
      expect(result.distanceKm).toBeGreaterThan(0);
      expect(result.calculationMethod).toBe('ICAO_CARBON_EMISSIONS_CALCULATOR_V2');
    });

    it('should apply cabin class factor for business class', async () => {
      mockFlightRepo.findOne.mockResolvedValue(mockFlight);

      const economy = await service.calculateFlightFootprint('flight-1', 'economy');
      const business = await service.calculateFlightFootprint('flight-1', 'business');

      expect(business.totalCO2kg).toBeGreaterThan(economy.totalCO2kg);
      expect(business.cabinClassFactor).toBe(1.5);
    });

    it('should apply cabin class factor for first class', async () => {
      mockFlightRepo.findOne.mockResolvedValue(mockFlight);

      const economy = await service.calculateFlightFootprint('flight-1', 'economy');
      const first = await service.calculateFlightFootprint('flight-1', 'first');

      expect(first.totalCO2kg).toBe(economy.totalCO2kg * 2);
      expect(first.cabinClassFactor).toBe(2);
    });

    it('should throw NotFoundError for unknown flight', async () => {
      mockFlightRepo.findOne.mockResolvedValue(null);

      await expect(service.calculateFlightFootprint('nonexistent', 'economy')).rejects.toThrow('Flight not found');
    });
  });

  describe('getOffsetProjects', () => {
    it('should return active offset projects', async () => {
      mockProjectRepo.count.mockResolvedValue(3);
      mockProjectRepo.find.mockResolvedValue([mockProject]);

      const projects = await service.getOffsetProjects();

      expect(projects).toHaveLength(1);
      expect(mockProjectRepo.find).toHaveBeenCalledWith({ where: { status: 'active' } });
    });
  });

  describe('purchaseOffset', () => {
    it('should purchase a carbon offset', async () => {
      mockFlightRepo.findOne.mockResolvedValue(mockFlight);
      mockProjectRepo.findOne.mockResolvedValue(mockProject);
      mockOffsetRepo.create.mockReturnValue(mockOffset);
      mockOffsetRepo.save.mockResolvedValue(mockOffset);

      const result = await service.purchaseOffset({
        userId: 'user-1',
        flightId: 'flight-1',
        projectId: 'project-1',
        amountCents: 1500,
        bookingId: 'booking-1',
      });

      expect(result.certificateRef).toBeTruthy();
      expect(result.co2Kg).toBeGreaterThan(0);
      expect(result.tonsOffset).toBeGreaterThan(0);
      expect(result.purchaseId).toBeTruthy();
      expect(mockProjectRepo.increment).toHaveBeenCalled();
    });
  });

  describe('generateCertificate', () => {
    it('should generate a PDF certificate', async () => {
      mockOffsetRepo.findOne.mockResolvedValue(mockOffset);

      const pdf = await service.generateCertificate('offset-1');

      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(0);
    });

    it('should throw NotFoundError for unknown purchase', async () => {
      mockOffsetRepo.findOne.mockResolvedValue(null);

      await expect(service.generateCertificate('nonexistent')).rejects.toThrow('Offset purchase not found');
    });
  });

  describe('getUserSustainabilityStats', () => {
    it('should return sustainability stats', async () => {
      mockOffsetRepo.find.mockResolvedValue([mockOffset, mockOffset]);

      const stats: SustainabilityStats = await service.getUserSustainabilityStats('user-1');

      expect(stats.totalPurchases).toBe(2);
      expect(stats.totalCO2OffsetKg).toBe(2000);
      expect(stats.totalOffsetCents).toBe(3000);
      expect(stats.projectsSupported).toBe(1);
      expect(stats.treesEquivalent).toBeGreaterThanOrEqual(0);
      expect(stats.carsOffRoadEquivalent).toBeGreaterThanOrEqual(0);
    });

    it('should return empty stats for user with no purchases', async () => {
      mockOffsetRepo.find.mockResolvedValue([]);

      const stats: SustainabilityStats = await service.getUserSustainabilityStats('user-none');

      expect(stats.totalPurchases).toBe(0);
      expect(stats.totalCO2OffsetKg).toBe(0);
      expect(stats.totalOffsetCents).toBe(0);
      expect(stats.projectsSupported).toBe(0);
    });
  });
});
