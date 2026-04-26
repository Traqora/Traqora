import * as StellarSdk from '@stellar/stellar-sdk';
import { config } from '../config';
import { Flight } from '../types/flight';
import { logger } from '../utils/logger';
import { executeSorobanOperation } from './soroban';

export interface FlightRegistryState {
  listed: boolean;
  reservable: boolean;
  contract_flight_id: string;
  available_seats: number;
}

export interface FlightRegistryService {
  getStates(flights: Flight[]): Promise<Record<string, FlightRegistryState>>;
}

class MockFlightRegistryService implements FlightRegistryService {
  async getStates(flights: Flight[]): Promise<Record<string, FlightRegistryState>> {
    return flights.reduce<Record<string, FlightRegistryState>>((acc, flight) => {
      acc[flight.id] = {
        listed: true,
        reservable: flight.available_seats > 0,
        contract_flight_id: flight.id,
        available_seats: flight.available_seats,
      };
      return acc;
    }, {});
  }
}

class SorobanFlightRegistryService implements FlightRegistryService {
  private readonly mockFallback = new MockFlightRegistryService();

  async getStates(flights: Flight[]): Promise<Record<string, FlightRegistryState>> {
    if (!config.contracts.flightRegistry) {
      return this.mockFallback.getStates(flights);
    }

    try {
      const server = new StellarSdk.SorobanRpc.Server(config.sorobanRpcUrl);
      const registryContract = new StellarSdk.Contract(config.contracts.flightRegistry);
      const source = await executeSorobanOperation(
        'soroban_get_account',
        () => server.getAccount(StellarSdk.Keypair.random().publicKey()),
        { component: 'flight_registry' }
      );
      const networkPassphrase =
        config.stellarNetwork === 'mainnet'
          ? StellarSdk.Networks.PUBLIC
          : StellarSdk.Networks.TESTNET;

      const states: Record<string, FlightRegistryState> = {};

      for (const flight of flights) {
        const tx = new StellarSdk.TransactionBuilder(source, {
          fee: StellarSdk.BASE_FEE,
          networkPassphrase,
        })
          .addOperation(
            registryContract.call(
              'get_flight_state',
              StellarSdk.nativeToScVal(flight.id, { type: 'string' })
            )
          )
          .setTimeout(30)
          .build();

        const simulated = await executeSorobanOperation(
          'soroban_simulate_flight_state',
          () => server.simulateTransaction(tx),
          { component: 'flight_registry', flightId: flight.id }
        );
        if (!StellarSdk.SorobanRpc.Api.isSimulationSuccess(simulated) || !simulated.result?.retval) {
          states[flight.id] = {
            listed: false,
            reservable: false,
            contract_flight_id: flight.id,
            available_seats: 0,
          };
          continue;
        }

        states[flight.id] = {
          listed: true,
          reservable: flight.available_seats > 0,
          contract_flight_id: flight.id,
          available_seats: flight.available_seats,
        };
      }

      return states;
    } catch (error) {
      logger.warn('Flight registry lookup failed. Falling back to mock registry state', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.mockFallback.getStates(flights);
    }
  }
}

export const createFlightRegistryService = (): FlightRegistryService => {
  return new SorobanFlightRegistryService();
};
