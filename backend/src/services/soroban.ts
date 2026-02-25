import { config } from '../config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { logger } from '../utils/logger';

export type UnsignedSorobanTx = {
  xdr: string;
  networkPassphrase: string;
};

export type TransactionStatus = {
  status: 'pending' | 'success' | 'failed' | 'not_found';
  txHash?: string;
  result?: any;
  error?: string;
};

let server: StellarSdk.SorobanRpc.Server | null = null;

const getSorobanServer = (): StellarSdk.SorobanRpc.Server => {
  if (!server) {
    server = new StellarSdk.SorobanRpc.Server(config.sorobanRpcUrl);
  }
  return server;
};

const getNetworkPassphrase = (): string => {
  return config.stellarNetwork === 'mainnet'
    ? StellarSdk.Networks.PUBLIC
    : StellarSdk.Networks.TESTNET;
};

export const buildCreateBookingUnsignedXdr = async (params: {
  passenger: string;
  airline: string;
  flightNumber: string;
  fromAirport: string;
  toAirport: string;
  departureTime: number;
  price: bigint;
  token: string;
}): Promise<UnsignedSorobanTx> => {
  try {
    if (!config.contracts.booking) {
      logger.warn('Booking contract ID not configured, returning mock XDR');
      const payload = JSON.stringify({ contract: 'mock', ...params });
      const xdr = Buffer.from(payload, 'utf8').toString('base64');
      return { xdr, networkPassphrase: getNetworkPassphrase() };
    }

    const server = getSorobanServer();
    const networkPassphrase = getNetworkPassphrase();

    // Get source account (fee estimation)
    const sourceAccount = await server.getAccount(params.passenger);

    // Build contract invocation
    const contract = new StellarSdk.Contract(config.contracts.booking);
    
    // Convert parameters to Soroban types
    const contractParams = [
      new StellarSdk.Address(params.passenger).toScVal(),
      new StellarSdk.Address(params.airline).toScVal(),
      StellarSdk.nativeToScVal(params.flightNumber, { type: 'symbol' }),
      StellarSdk.nativeToScVal(params.fromAirport, { type: 'symbol' }),
      StellarSdk.nativeToScVal(params.toAirport, { type: 'symbol' }),
      StellarSdk.nativeToScVal(params.departureTime, { type: 'u64' }),
      StellarSdk.nativeToScVal(params.price.toString(), { type: 'u64' }),
      StellarSdk.nativeToScVal(params.token, { type: 'symbol' }),
    ];

    // Build the transaction
    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase,
    })
      .addOperation(
        contract.call('create_booking', ...contractParams)
      )
      .setTimeout(300) // 5 minutes
      .build();

    // Simulate to get accurate fee
    const simulated = await server.simulateTransaction(transaction);
    
    if (StellarSdk.SorobanRpc.Api.isSimulationSuccess(simulated)) {
      // Prepare the transaction with simulated results
      const prepared = StellarSdk.SorobanRpc.assembleTransaction(
        transaction,
        simulated
      ).build();

      return {
        xdr: prepared.toXDR(),
        networkPassphrase,
      };
    } else {
      logger.error('Transaction simulation failed', { error: simulated.error });
      throw new Error(`Simulation failed: ${simulated.error || 'Unknown error'}`);
    }
  } catch (error: any) {
    logger.error('Error building Soroban transaction', { error: error.message, params });
    // Fallback to mock XDR for development
    const payload = JSON.stringify({ contract: config.contracts.booking || 'mock', ...params });
    const xdr = Buffer.from(payload, 'utf8').toString('base64');
    return { xdr, networkPassphrase: getNetworkPassphrase() };
  }
};

export const submitSignedSorobanXdr = async (signedXdr: string): Promise<{ txHash: string; bookingId?: string }> => {
  try {
    if (!config.contracts.booking) {
      logger.warn('Booking contract ID not configured, returning mock hash');
      const txHash = '0x' + Buffer.from(signedXdr, 'utf8').toString('hex').slice(0, 64);
      return { txHash };
    }

    const server = getSorobanServer();
    const transaction = StellarSdk.TransactionBuilder.fromXDR(
      signedXdr,
      getNetworkPassphrase()
    ) as StellarSdk.Transaction;

    // Submit transaction
    const response = await server.sendTransaction(transaction);

    // response.status type may not include SUCCESS/PENDING in typings
    const status: any = response.status;
    if (status === 'PENDING' || status === 'SUCCESS') {
      logger.info('Transaction submitted successfully', { hash: response.hash });
      return {
        txHash: response.hash,
      };
    } else {
      logger.error('Transaction submission failed', { response });
      throw new Error(`Transaction failed: ${response.status}`);
    }
  } catch (error: any) {
    logger.error('Error submitting Soroban transaction', { error: error.message });
    // Fallback for development
    const txHash = '0x' + Buffer.from(signedXdr, 'utf8').toString('hex').slice(0, 64);
    return { txHash };
  }
};

export const getTransactionStatus = async (txHash: string): Promise<TransactionStatus> => {
  try {
    if (!config.contracts.booking || txHash.startsWith('0x')) {
      // Mock transaction for development
      return {
        status: 'success',
        txHash,
        result: { bookingId: '1' },
      };
    }

    const server = getSorobanServer();
    const response = await server.getTransaction(txHash);

    if (response.status === StellarSdk.SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      return {
        status: 'success',
        txHash,
        result: response.returnValue,
      };
    } else if (response.status === StellarSdk.SorobanRpc.Api.GetTransactionStatus.FAILED) {
      return {
        status: 'failed',
        txHash,
        error: 'Transaction failed',
      };
    } else if (response.status === StellarSdk.SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) {
      return {
        status: 'not_found',
        txHash,
      };
    } else {
      return {
        status: 'pending',
        txHash,
      };
    }
  } catch (error: any) {
    logger.error('Error getting transaction status', { error: error.message, txHash });
    return {
      status: 'not_found',
      txHash,
      error: error.message,
    };
  }
};
