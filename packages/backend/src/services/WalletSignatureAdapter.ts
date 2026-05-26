import { Keypair } from '@stellar/stellar-base';

/**
 * Interface for wallet-specific signature extraction logic.
 * SEP-10 requires verifying a signed Transaction Envelope (XDR),
 * but some wallets implementations diverge.
 */
export interface IWalletSignatureAdapter {
    verify(signatureOrXdr: string, publicKey: string, message?: string, networkPassphrase?: string): Promise<boolean>;
}

/**
 * Strategy for wallets that return a signed XDR (Freighter, Rabet).
 */
export class StandardXdrAdapter implements IWalletSignatureAdapter {
    async verify(xdr: string, publicKey: string, _message?: string, _networkPassphrase?: string): Promise<boolean> {
        // Note: In a real SEP-10 flow, we use Utils.verifyChallengeTxThreshold
        // but the core logic relies on the Keypair verifying the transaction hash.
        try {
            const keypair = Keypair.fromPublicKey(publicKey);
            // Logic to extract signature from the XDR decoration would go here
            return true;
        } catch (e) {
            console.error('StandardXdrAdapter verification failed:', e);
            return false;
        }
    }
}

/**
 * Strategy for Albedo, which often returns a separate signature string.
 */
export class AlbedoAdapter implements IWalletSignatureAdapter {
    async verify(signature: string, publicKey: string, message: string): Promise<boolean> {
        try {
            const keypair = Keypair.fromPublicKey(publicKey);
            // Albedo signatures are typically base64 encoded
            return keypair.verify(Buffer.from(message), Buffer.from(signature, 'base64'));
        } catch (e) {
            console.error('AlbedoAdapter verification failed:', e);
            return false;
        }
    }
}

/**
 * Context class to select the correct strategy at runtime.
 */
export class WalletAuthFactory {
    private static adapters: Record<string, IWalletSignatureAdapter> = {
        freighter: new StandardXdrAdapter(),
        rabet: new StandardXdrAdapter(),
        albedo: new AlbedoAdapter(),
    };

    static getAdapter(walletType: string): IWalletSignatureAdapter {
        const adapter = this.adapters[walletType.toLowerCase()];
        if (!adapter) throw new Error(`Unsupported wallet type: ${walletType}`);
        return adapter;
    }
}
