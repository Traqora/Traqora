import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { requireAuth } from '../../middleware/authMiddleware';
import { initDataSource } from '../../db/dataSource';
import { DataSource } from 'typeorm';
import { logger } from '../../utils/logger';
import { Server, TransactionBuilder, Keypair, Networks, Asset, Operation } from '@stellar/stellar-sdk';
import { WalletAuthFactory } from '../../services/WalletSignatureAdapter';
import { config } from '../../config';

const router = Router();

// Validation schemas
const connectWalletSchema = z.object({
  walletType: z.enum(['freighter', 'albedo', 'rabet']),
  publicKey: z.string().length(56),
});

const sendTransactionSchema = z.object({
  to: z.string().length(56),
  amount: z.string().regex(/^\d+(\.\d+)?$/), // Positive number as string
  asset: z.string().optional(), // Asset code (defaults to XLM)
  memo: z.string().max(28).optional(),
});

const signTransactionSchema = z.object({
  transactionXdr: z.string().min(1),
  walletType: z.enum(['freighter', 'albedo', 'rabet']),
});

const balanceQuerySchema = z.object({
  asset: z.string().optional(),
});

// Helper function to get database connection
async function getDataSource(): Promise<DataSource> {
  return await initDataSource();
}

// Helper function to get Stellar server
function getStellarServer(): Server {
  const serverUrl = config.stellarNetwork === 'testnet' 
    ? 'https://horizon-testnet.stellar.org'
    : 'https://horizon.stellar.org';
  return new Server(serverUrl);
}

// Helper function to get network passphrase
function getNetworkPassphrase(): string {
  return config.stellarNetwork === 'testnet' 
    ? Networks.TESTNET
    : Networks.PUBLIC;
}

/**
 * @swagger
 * /api/v1/wallet/status:
 *   get:
 *     tags: [Wallet]
 *     summary: Check wallet connection status
 *     description: Retrieve the current wallet connection status and account details
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Wallet'
 *       401:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/status', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const walletAddress = (req as any).user?.walletAddress;
  
  if (!walletAddress) {
    return res.json({
      success: true,
      data: {
        connected: false,
        message: 'No wallet connected',
      },
    });
  }

  try {
    const server = getStellarServer();
    const account = await server.loadAccount(walletAddress);
    
    return res.json({
      success: true,
      data: {
        connected: true,
        address: walletAddress,
        sequence: account.sequenceNumber(),
        balances: account.balances,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('Failed to load wallet account', error);
    return res.json({
      success: true,
      data: {
        connected: true,
        address: walletAddress,
        error: 'Failed to load account details',
        lastUpdated: new Date().toISOString(),
      },
    });
  }
}));

/**
 * GET /api/v1/wallet/balance
 * Get wallet balance
 */
router.get('/balance', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const walletAddress = (req as any).user?.walletAddress;
  const query = balanceQuerySchema.parse(req.query);
  
  if (!walletAddress) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Wallet not connected',
        code: 'WALLET_NOT_CONNECTED',
      },
    });
  }

  try {
    const server = getStellarServer();
    const account = await server.loadAccount(walletAddress);
    
    let balances = account.balances;
    
    // Filter by specific asset if requested
    if (query.asset) {
      balances = balances.filter((balance: any) => {
        if (query.asset === 'XLM') {
          return balance.asset_type === 'native';
        }
        return balance.asset_code === query.asset;
      });
    }

    return res.json({
      success: true,
      data: {
        address: walletAddress,
        balances: balances.map((balance: any) => ({
          asset: balance.asset_type === 'native' ? 'XLM' : `${balance.asset_code}:${balance.asset_issuer}`,
          assetType: balance.asset_type,
          balance: balance.balance,
          limit: balance.limit || null,
          buyingLiabilities: balance.buying_liabilities || '0',
          sellingLiabilities: balance.selling_liabilities || '0',
          lastModified: balance.last_modified_ledger || null,
        })),
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error(`Failed to get balance for ${walletAddress}`, error);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve wallet balance',
        code: 'BALANCE_FETCH_FAILED',
        details: error.message,
      },
    });
  }
}));

/**
 * POST /api/v1/wallet/connect
 * Connect a wallet (initiate SEP-10 challenge)
 */
router.post('/connect', asyncHandler(async (req: Request, res: Response) => {
  const parsed = connectWalletSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
    });
  }

  const { walletType, publicKey } = parsed.data;

  try {
    // Validate public key format
    Keypair.fromPublicKey(publicKey);
    
    // In a real implementation, this would generate a SEP-10 challenge transaction
    // For now, we'll return a mock challenge
    const challenge = {
      publicKey,
      walletType,
      challenge: `stellar_challenge_${Date.now()}`,
      networkPassphrase: getNetworkPassphrase(),
      domain: 'traqora.io',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
    };

    logger.info(`Wallet connection initiated for ${publicKey} (${walletType})`);

    return res.json({
      success: true,
      data: challenge,
    });
  } catch (error: any) {
    logger.error('Wallet connection failed', error);
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid public key or connection failed',
        code: 'CONNECTION_FAILED',
        details: error.message,
      },
    });
  }
}));

/**
 * POST /api/v1/wallet/verify
 * Verify wallet signature (complete SEP-10 flow)
 */
router.post('/verify', asyncHandler(async (req: Request, res: Response) => {
  const parsed = signTransactionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
    });
  }

  const { transactionXdr, walletType } = parsed.data;

  try {
    // In a real implementation, this would verify the SEP-10 challenge transaction
    // For now, we'll simulate verification
    const adapter = WalletAuthFactory.getAdapter(walletType);
    
    // Extract public key from transaction (simplified)
    const transaction = TransactionBuilder.fromXDR(transactionXdr, getNetworkPassphrase());
    const publicKey = transaction.source; // Simplified extraction
    
    // Verify signature
    const isValid = await adapter.verify(transactionXdr, publicKey);
    
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid signature',
          code: 'INVALID_SIGNATURE',
        },
      });
    }

    logger.info(`Wallet verified: ${publicKey} (${walletType})`);

    return res.json({
      success: true,
      data: {
        verified: true,
        publicKey,
        walletType,
        verifiedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('Wallet verification failed', error);
    return res.status(400).json({
      success: false,
      error: {
        message: 'Verification failed',
        code: 'VERIFICATION_FAILED',
        details: error.message,
      },
    });
  }
}));

/**
 * POST /api/v1/wallet/send
 * Send payment transaction
 */
router.post('/send', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const walletAddress = (req as any).user?.walletAddress;
  
  if (!walletAddress) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Wallet not connected',
        code: 'WALLET_NOT_CONNECTED',
      },
    });
  }

  const parsed = sendTransactionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
    });
  }

  const { to, amount, asset, memo } = parsed.data;

  try {
    const server = getStellarServer();
    const sourceAccount = await server.loadAccount(walletAddress);
    
    // Determine asset
    let assetObj: Asset;
    if (!asset || asset.toUpperCase() === 'XLM') {
      assetObj = Asset.native();
    } else {
      // For custom assets, issuer would be needed (simplified here)
      assetObj = new Asset(asset, walletAddress); // Simplified
    }

    // Build transaction
    const transaction = new TransactionBuilder(sourceAccount, {
      fee: '100', // 100 stroops (0.00001 XLM)
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(
        Operation.payment({
          destination: to,
          asset: assetObj,
          amount: amount,
        })
      )
      .setTimeout(30) // 30 seconds timeout
      .build();

    if (memo) {
      transaction.addMemo(memo);
    }

    // Return unsigned transaction for client to sign
    const transactionXdr = transaction.toXDR();

    logger.info(`Payment transaction created: ${walletAddress} -> ${to} (${amount} ${asset || 'XLM'})`);

    return res.json({
      success: true,
      data: {
        transactionXdr,
        networkPassphrase: getNetworkPassphrase(),
        message: 'Transaction created. Please sign and submit.',
        fee: '100',
        timeout: 30,
      },
    });
  } catch (error: any) {
    logger.error('Failed to create payment transaction', error);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create transaction',
        code: 'TRANSACTION_CREATION_FAILED',
        details: error.message,
      },
    });
  }
}));

/**
 * POST /api/v1/wallet/submit
 * Submit signed transaction
 */
router.post('/submit', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const walletAddress = (req as any).user?.walletAddress;
  
  if (!walletAddress) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Wallet not connected',
        code: 'WALLET_NOT_CONNECTED',
      },
    });
  }

  const { transactionXdr } = req.body;
  
  if (!transactionXdr || typeof transactionXdr !== 'string') {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Transaction XDR is required',
        code: 'MISSING_TRANSACTION',
      },
    });
  }

  try {
    const server = getStellarServer();
    
    // Submit transaction
    const result = await server.submitTransaction(transactionXdr);

    logger.info(`Transaction submitted successfully: ${result.hash}`);

    return res.json({
      success: true,
      data: {
        hash: result.hash,
        ledger: result.ledger,
        envelopeXdr: result.envelopeXdr,
        resultXdr: result.resultXdr,
        resultMetaXdr: result.resultMetaXdr,
        submittedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('Failed to submit transaction', error);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to submit transaction',
        code: 'SUBMISSION_FAILED',
        details: error.message,
        resultCodes: error.resultCodes || null,
      },
    });
  }
}));

/**
 * GET /api/v1/wallet/transactions
 * Get transaction history
 */
router.get('/transactions', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const walletAddress = (req as any).user?.walletAddress;
  const { limit = 10, cursor } = req.query;
  
  if (!walletAddress) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Wallet not connected',
        code: 'WALLET_NOT_CONNECTED',
      },
    });
  }

  try {
    const server = getStellarServer();
    
    // Build transactions request
    let transactionsBuilder = server.transactions()
      .forAccount(walletAddress)
      .order('desc')
      .limit(Math.min(parseInt(limit as string), 100)); // Max 100
    
    if (cursor) {
      transactionsBuilder = transactionsBuilder.cursor(cursor as string);
    }

    const transactionsPage = await transactionsBuilder.call();
    
    const transactions = transactionsPage.records.map((tx: any) => ({
      hash: tx.hash,
      ledger: tx.ledger_attr,
      createdAt: tx.created_at,
      feePaid: tx.fee_paid,
      feeCharged: tx.fee_charged,
      maxFee: tx.max_fee,
      operationCount: tx.operation_count,
      memo: tx.memo || null,
      memoType: tx.memo_type || null,
      signatures: tx.signatures,
      successful: tx.successful,
      sourceAccount: tx.source_account,
    }));

    return res.json({
      success: true,
      data: {
        transactions,
        nextCursor: transactionsPage.next_cursor,
        prevCursor: transactionsPage.prev_cursor,
        self: transactionsPage.self,
        limit: parseInt(limit as string),
        count: transactions.length,
      },
    });
  } catch (error: any) {
    logger.error(`Failed to get transactions for ${walletAddress}`, error);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve transaction history',
        code: 'TRANSACTIONS_FETCH_FAILED',
        details: error.message,
      },
    });
  }
}));

/**
 * GET /api/v1/wallet/operations
 * Get operation history
 */
router.get('/operations', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const walletAddress = (req as any).user?.walletAddress;
  const { limit = 10, cursor, type } = req.query;
  
  if (!walletAddress) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Wallet not connected',
        code: 'WALLET_NOT_CONNECTED',
      },
    });
  }

  try {
    const server = getStellarServer();
    
    // Build operations request
    let operationsBuilder = server.operations()
      .forAccount(walletAddress)
      .order('desc')
      .limit(Math.min(parseInt(limit as string), 100));
    
    if (cursor) {
      operationsBuilder = operationsBuilder.cursor(cursor as string);
    }
    
    if (type) {
      operationsBuilder = operationsBuilder.includeFailed(false);
    }

    const operationsPage = await operationsBuilder.call();
    
    const operations = operationsPage.records.map((op: any) => ({
      id: op.id,
      transactionHash: op.transaction_hash,
      operationType: op.type,
      createdAt: op.created_at,
      sourceAccount: op.source_account,
      successful: op.successful,
      transactionSuccessful: op.transaction_successful,
      
      // Payment-specific fields
      ...(op.type === 'payment' && {
        to: op.to,
        from: op.from,
        amount: op.amount,
        asset: op.asset_type === 'native' ? 'XLM' : `${op.asset_code}:${op.asset_issuer}`,
      }),
      
      // Other operation types can be added as needed
    }));

    return res.json({
      success: true,
      data: {
        operations,
        nextCursor: operationsPage.next_cursor,
        prevCursor: operationsPage.prev_cursor,
        self: operationsPage.self,
        limit: parseInt(limit as string),
        count: operations.length,
      },
    });
  } catch (error: any) {
    logger.error(`Failed to get operations for ${walletAddress}`, error);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve operation history',
        code: 'OPERATIONS_FETCH_FAILED',
        details: error.message,
      },
    });
  }
}));

export { router as walletRoutes };
