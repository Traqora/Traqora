import "reflect-metadata";
import bcrypt from "bcryptjs";
import { AppDataSource } from "../dataSource";
import { AdminUser } from "../entities/AdminUser";
import { Flight } from "../entities/Flight";
import { Passenger } from "../entities/Passenger";
import { Booking } from "../entities/Booking";
import { User } from "../entities/User";
import { logger } from "../../utils/logger";

export const seedDatabase = async () => {
  logger.info("Initializing database seeding...");

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  // 1. Seed Admin Users
  const adminUserRepo = AppDataSource.getRepository(AdminUser);
  const existingAdmin = await adminUserRepo.findOne({ where: { email: "admin@traqora.com" } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash("TraqoraAdmin2026!", 10);
    const superAdmin = adminUserRepo.create({
      email: "admin@traqora.com",
      passwordHash,
      role: "super_admin",
      isActive: true,
    });
    await adminUserRepo.save(superAdmin);
    logger.info("Seeded super admin user (admin@traqora.com / TraqoraAdmin2026!)");
  } else {
    logger.info("Super admin already exists, skipping.");
  }

  // 2. Seed Users
  const userRepo = AppDataSource.getRepository(User);
  const existingUser = await userRepo.findOne({ where: { walletAddress: "GBXWZ2B74NZD54NIPD7S6C7IWRK2VWRHX4E3H7UHT5XU5Z73OOBQWJ2I" } });
  if (!existingUser) {
    const defaultUser = userRepo.create({
      walletAddress: "GBXWZ2B74NZD54NIPD7S6C7IWRK2VWRHX4E3H7UHT5XU5Z73OOBQWJ2I",
      walletType: "freighter",
      lastLoginAt: new Date(),
    });
    await userRepo.save(defaultUser);
    logger.info("Seeded default user wallet");
  }

  // 3. Seed Flights
  const flightRepo = AppDataSource.getRepository(Flight);
  const flightCount = await flightRepo.count();
  const seededFlights: Flight[] = [];
  if (flightCount === 0) {
    const flightsData = [
      {
        flightNumber: "TQ101",
        airlineCode: "TQ",
        fromAirport: "JFK",
        toAirport: "LHR",
        departureTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
        arrivalTime: new Date(Date.now() + 32 * 60 * 60 * 1000),
        seatsAvailable: 150,
        priceCents: 45000, // $450.00
        airlineSorobanAddress: "GCSW2J3WJ2CSW2J3WJ2CSW2J3WJ2CSW2J3WJ2CSW2J3WJ2CSW2J3WJ2CS",
        status: "SCHEDULED",
        dataSource: "AMADEUS",
      },
      {
        flightNumber: "TQ202",
        airlineCode: "TQ",
        fromAirport: "LAX",
        toAirport: "HND",
        departureTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
        arrivalTime: new Date(Date.now() + 60 * 60 * 60 * 1000),
        seatsAvailable: 200,
        priceCents: 85000, // $850.00
        airlineSorobanAddress: "GCSW2J3WJ2CSW2J3WJ2CSW2J3WJ2CSW2J3WJ2CSW2J3WJ2CSW2J3WJ2CS",
        status: "SCHEDULED",
        dataSource: "AMADEUS",
      },
      {
        flightNumber: "TQ303",
        airlineCode: "TQ",
        fromAirport: "CDG",
        toAirport: "DXB",
        departureTime: new Date(Date.now() + 12 * 60 * 60 * 1000),
        arrivalTime: new Date(Date.now() + 19 * 60 * 60 * 1000),
        seatsAvailable: 80,
        priceCents: 62000,
        airlineSorobanAddress: "GCSW2J3WJ2CSW2J3WJ2CSW2J3WJ2CSW2J3WJ2CSW2J3WJ2CSW2J3WJ2CS",
        status: "SCHEDULED",
        dataSource: "AMADEUS",
      },
    ];

    for (const flightData of flightsData) {
      const flight = flightRepo.create(flightData);
      const saved = await flightRepo.save(flight);
      seededFlights.push(saved);
    }
    logger.info(`Seeded ${seededFlights.length} flights`);
  } else {
    logger.info("Flights already exist, skipping.");
    const existing = await flightRepo.find({ take: 3 });
    seededFlights.push(...existing);
  }

  // 4. Seed Passenger and Booking (if flights exist)
  if (seededFlights.length > 0) {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const bookingCount = await bookingRepo.count();
    if (bookingCount === 0) {
      const passengerRepo = AppDataSource.getRepository(Passenger);
      const passenger = passengerRepo.create({
        email: "alice@example.com",
        firstName: "Alice",
        lastName: "Smith",
        phone: "+15550199",
        sorobanAddress: "GCSW2J3WJ2CSW2J3WJ2CSW2J3WJ2CSW2J3WJ2CSW2J3WJ2CSW2J3WJ2CS",
      });
      const savedPassenger = await passengerRepo.save(passenger);

      const booking = bookingRepo.create({
        flight: seededFlights[0],
        passenger: savedPassenger,
        status: "confirmed",
        amountCents: seededFlights[0].priceCents,
        stripePaymentIntentId: "pi_mock_12345",
        stripeClientSecret: "secret_mock_12345",
      });
      await bookingRepo.save(booking);
      logger.info("Seeded sample booking & passenger");
    }
  }

  logger.info("Database seeding completed successfully.");
};

if (require.main === module) {
  seedDatabase()
    .then(() => {
      logger.info("Seeding script completed.");
      process.exit(0);
    })
    .catch((err) => {
      logger.error("Seeding script failed:", err);
      process.exit(1);
    });
}
