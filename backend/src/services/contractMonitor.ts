import * as StellarSdk from '@stellar/stellar-sdk';
import { config } from '../config';
import { logger } from '../utils/logger';
import { recordContractEvent, updateWalletBalance, recordSorobanTransaction } from './metrics';

interface ContractEventListener {
  contractId: string;
  eventTypes: string[];
  handler: (event: any) => void;
}

class ContractMonitor {
  private server: StellarSdk.SorobanRpc.Server | null = null;
  private listeners: ContractEventListener[] = [];
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastCursor: string | null = null;

  constructor() {
    if (config.sorobanRpcUrl) {
      this.server = new StellarSdk.SorobanRpc.Server(config.sorobanRpcUrl);
    }
  }

  /**
   * Register a contract event listener
   */
  registerListener(contractId: string, eventTypes: string[], handler: (event: any) => void) {
    this.listeners.push({ contractId, eventTypes, handler });
    logger.info('Contract event listener registered', { contractId, eventTypes });
  }

  /**
   * Start monitoring contract events
   */
  async startMonitoring(intervalMs: number = 5000) {
    if (this.isMonitoring) {
      logger.warn('Contract monitoring already started');
      return;
    }

    if (!this.server) {
      logger.error('Soroban RPC server not configured');
      return;
    }

    this.isMonitoring = true;
    logger.info('Starting contract event monitoring', { intervalMs });

    // Initial fetch
    await this.fetchAndProcessEvents();

    // Set up periodic polling
    this.monitoringInterval = setInterval(async () => {
      await this.fetchAndProcessEvents();
    }, intervalMs);
  }

  /**
   * Stop monitoring contract events
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    logger.info('Contract event monitoring stopped');
  }

  /**
   * Fetch and process contract events
   */
  private async fetchAndProcessEvents() {
    if (!this.server) return;

    try {
      // Get latest ledger
      const latestLedger = await this.server.getLatestLedger();
      
      // Fetch events for each registered contract
      for (const listener of this.listeners) {
        try {
          const events = await this.server.getEvents({
            startLedger: this.lastCursor ? undefined : latestLedger.sequence - 100,
            filters: [
              {
                type: 'contract',
                contractIds: [listener.contractId],
              },
            ],
            limit: 100,
          });

          if (events.events && events.events.length > 0) {
            for (const event of events.events) {
              this.processEvent(listener, event);
            }
            
            // Update cursor
            if (events.latestLedger) {
              this.lastCursor = events.latestLedger.toString();
            }
          }
        } catch (error: any) {
          logger.error('Error fetching events for contract', {
            contractId: listener.contractId,
            error: error.message,
          });
        }
      }
    } catch (error: any) {
      logger.error('Error in contract event monitoring', { error: error.message });
    }
  }

  /**
   * Process a single contract event
   */
  private processEvent(listener: ContractEventListener, event: any) {
    try {
      // Extract event type from the event
      const eventType = this.extractEventType(event);
      
      if (!eventType || !listener.eventTypes.includes(eventType)) {
        return;
      }

      // Record metric
      recordContractEvent(listener.contractId, eventType);

      // Call the handler
      listener.handler(event);

      logger.debug('Contract event processed', {
        contractId: listener.contractId,
        eventType,
        ledger: event.ledger,
      });
    } catch (error: any) {
      logger.error('Error processing contract event', {
        contractId: listener.contractId,
        error: error.message,
      });
    }
  }

  /**
   * Extract event type from event data
   */
  private extractEventType(event: any): string | null {
    try {
      if (event.topic && event.topic.length > 0) {
        // usually topic[0] is contract module (e.g., 'booking'), topic[1] is the event action (e.g., 'created')
        const topic = event.topic.length > 1 ? event.topic[1] : event.topic[0];
        return StellarSdk.scValToNative(topic).toString();
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Monitor wallet balances
   */
  async monitorWalletBalances(wallets: Array<{ address: string; type: string }>) {
    if (!this.server) {
      logger.warn('Soroban RPC server not configured, skipping wallet balance monitoring');
      return;
    }

    const horizonUrl = config.stellarNetwork === 'mainnet'
      ? 'https://horizon.stellar.org'
      : 'https://horizon-testnet.stellar.org';
    
    const horizonServer = new StellarSdk.Horizon.Server(horizonUrl);

    for (const wallet of wallets) {
      try {
        const account = await horizonServer.loadAccount(wallet.address);
        
        // Find XLM balance
        const xlmBalance = account.balances.find(
          (b: any) => b.asset_type === 'native'
        );
        
        if (xlmBalance) {
          const balance = parseFloat(xlmBalance.balance);
          updateWalletBalance(wallet.address, wallet.type, balance);
          
          // Log warning if balance is low
          const minBalance = 100; // 100 XLM minimum
          if (balance < minBalance) {
            logger.warn('Low wallet balance detected', {
              address: wallet.address,
              type: wallet.type,
              balance,
              minBalance,
            });
          }
        }
      } catch (error: any) {
        logger.error('Error monitoring wallet balance', {
          address: wallet.address,
          error: error.message,
        });
      }
    }
  }

  /**
   * Monitor transaction status and record metrics
   */
  async monitorTransaction(
    txHash: string,
    contract: string,
    method: string,
    startTime: number
  ): Promise<void> {
    if (!this.server) return;

    try {
      const response = await this.server.getTransaction(txHash);
      const duration = (Date.now() - startTime) / 1000;

      if (response.status === StellarSdk.SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        recordSorobanTransaction(contract, method, 'success', duration);
        logger.info('Transaction successful', { txHash, contract, method, duration });
      } else if (response.status === StellarSdk.SorobanRpc.Api.GetTransactionStatus.FAILED) {
        recordSorobanTransaction(contract, method, 'failed', duration);
        logger.error('Transaction failed', { txHash, contract, method, duration });
      }
    } catch (error: any) {
      logger.error('Error monitoring transaction', { txHash, error: error.message });
    }
  }
}

// Singleton instance
export const contractMonitor = new ContractMonitor();

// Register default event listeners
import { AppDataSource } from '../db/dataSource';
import { Booking } from '../db/entities/Booking';
import { webhookService } from './WebhookService';

export const setupDefaultEventListeners = () => {
  // Booking contract events
  if (config.contracts.booking) {
    contractMonitor.registerListener(
      config.contracts.booking,
      ['created', 'paid', 'released', 'refunded'],
      async (event) => {
        try {
          const value = StellarSdk.scValToNative(event.value);
          let bookingId: string;
          let amount: string | undefined;

          if (Array.isArray(value)) {
            bookingId = value[0].toString();
            amount = value[1].toString();
          } else {
            bookingId = value.toString();
          }

          logger.info(`Booking contract event`, { bookingId, amount, ledger: event.ledger });

          const eventType = StellarSdk.scValToNative(event.topic[1]).toString();
          const bookingRepo = AppDataSource.getRepository(Booking);
          const booking = await bookingRepo.findOne({
            where: { sorobanBookingId: bookingId },
            relations: ['passenger']
          });

          if (booking) {
            if (eventType === 'created') booking.status = 'onchain_submitted';
            else if (eventType === 'paid') booking.status = 'paid';
            else if (eventType === 'released') booking.status = 'confirmed';
            else if (eventType === 'refunded') booking.status = 'refunded';

            await bookingRepo.save(booking);

            if (booking.passenger?.sorobanAddress) {
              await webhookService.sendWebhook(
                booking.passenger.sorobanAddress,
                `booking_${eventType}`,
                { bookingId: booking.id, sorobanBookingId: bookingId, status: booking.status, amount }
              );
            }
          }
        } catch (e: any) {
          logger.error('Error processing booking event in listener', { error: e.message });
        }
      }
    );
  }

  // Refund contract events
  if (config.contracts.refund) {
    contractMonitor.registerListener(
      config.contracts.refund,
      ['RefundRequested', 'RefundProcessed', 'RefundRejected'],
      async (event) => {
        logger.info('Refund contract event', { event });
        // Handle refund events and trigger webhook
        try {
          const eventType = StellarSdk.scValToNative(event.topic.length > 1 ? event.topic[1] : event.topic[0]).toString();
          if (eventType === 'RefundProcessed') {
             const value = StellarSdk.scValToNative(event.value);
             let bookingId = Array.isArray(value) ? value[0].toString() : value.toString();
             
             const bookingRepo = AppDataSource.getRepository(Booking);
             const booking = await bookingRepo.findOne({ where: { sorobanBookingId: bookingId }, relations: ['passenger'] });
             if (booking && booking.passenger?.sorobanAddress) {
               await webhookService.sendWebhook(
                 booking.passenger.sorobanAddress,
                 'RefundProcessed',
                 { bookingId: booking.id, sorobanBookingId: bookingId }
               );
             }
          }
        } catch (e) {}
      }
    );
  }

  // Dispute contract events
  if (config.contracts.governance) {
    contractMonitor.registerListener(
      config.contracts.governance,
      ['DisputeCreated', 'DisputeResolved', 'VoteCast'],
      async (event) => {
        logger.info('Dispute contract event', { event });
        try {
          const eventType = StellarSdk.scValToNative(event.topic.length > 1 ? event.topic[1] : event.topic[0]).toString();
          if (eventType === 'DisputeResolved') {
             const value = StellarSdk.scValToNative(event.value);
             // We assume value contains dispute ID or booking ID. If it's booking ID, we can notify.
             let bookingId = Array.isArray(value) ? value[0].toString() : value.toString();
             
             const bookingRepo = AppDataSource.getRepository(Booking);
             const booking = await bookingRepo.findOne({ where: { sorobanBookingId: bookingId }, relations: ['passenger'] });
             if (booking && booking.passenger?.sorobanAddress) {
               await webhookService.sendWebhook(
                 booking.passenger.sorobanAddress,
                 'DisputeResolved',
                 { bookingId: booking.id, sorobanBookingId: bookingId }
               );
             }
          }
        } catch (e) {}
      }
    );
  }

  // Token contract events
  if (config.contracts.token) {
    contractMonitor.registerListener(
      config.contracts.token,
      ['Transfer', 'Mint', 'Burn'],
      (event) => {
        logger.info('Token contract event', { event });
      }
    );
  }
};

// Monitor wallet balances periodically (every 5 minutes)
export const startWalletBalanceMonitoring = (wallets: Array<{ address: string; type: string }>) => {
  // Initial check
  contractMonitor.monitorWalletBalances(wallets);

  // Periodic checks
  setInterval(() => {
    contractMonitor.monitorWalletBalances(wallets);
  }, 5 * 60 * 1000); // 5 minutes
};
