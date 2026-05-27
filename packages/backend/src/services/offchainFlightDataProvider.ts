import { FlightRepository } from '../repositories/flightRepository';
import { Flight, FlightPagination, FlightSearchCriteria } from '../types/flight';

export interface OffchainFlightDataProvider {
  search(criteria: FlightSearchCriteria, pagination: FlightPagination): Promise<Flight[]>;
}

export class RepositoryOffchainFlightDataProvider implements OffchainFlightDataProvider {
  constructor(private readonly repository: FlightRepository) {}

  async search(criteria: FlightSearchCriteria, pagination: FlightPagination): Promise<Flight[]> {
    return this.repository.searchFlights(criteria, pagination);
  }
}
