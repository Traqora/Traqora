import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Flight from '../../models/Flight';
import logger from '../../utils/logger';

const router = Router();

// Validation schema
const createFlightSchema = z.object({
  flightNumber: z.string().min(1),
  airline: z.string().min(1),
  origin: z.string().min(3),
  destination: z.string().min(3),
  departureTime: z.string().datetime(), // Expects ISO string
  arrivalTime: z.string().datetime(),
  basePrice: z.number().positive(),
  currency: z.string().default('USD'),
});

// List all flights
router.get('/', async (req, res) => {
  try {
    const flights = await Flight.find({ isActive: true }).limit(100);
    res.json(flights);
  } catch (error) {
    logger.error('Error fetching flights', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get flight by ID or Flight Number
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let flight;
    if (mongoose.Types.ObjectId.isValid(id)) {
        flight = await Flight.findById(id);
    } else {
        flight = await Flight.findOne({ flightNumber: id });
    }
    
    if (flight) {
      res.json(flight);
    } else {
      res.status(404).json({ message: 'Flight not found' });
    }
  } catch (error) {
    logger.error('Error fetching flight', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Create a new flight (Admin only typically)
router.post('/', async (req, res) => {
  try {
    const validatedData = createFlightSchema.parse(req.body);
    
    // Check if flight exists
    const existing = await Flight.findOne({ flightNumber: validatedData.flightNumber });
    if (existing) {
      return res.status(409).json({ error: 'Flight already exists' });
    }

    const newFlight = await Flight.create(validatedData);
    res.status(201).json(newFlight);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    logger.error('Error creating flight', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export const flightRoutes = router;
