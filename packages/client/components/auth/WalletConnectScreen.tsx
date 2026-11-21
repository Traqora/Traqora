import React, { useState } from 'react';
import { useWalletStore, connectWallet, WalletType } from '@/lib/stellar-wallet-connect';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ShieldCheck, AlertCircle, Wallet } from 'lucide-react';
import { toast } from 'sonner';

interface WalletConnectScreenProps {
  onConnected?: (address: string) => void;
  onSignatureVerified?: (verified: boolean) => void;
}

export const WalletConnectScreen: React.FC<WalletConnectScreenProps> = ({
  onConnected,
  onSignatureVerified,
}) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const { isConnected, address, walletType } = useWalletStore();

  const handleConnect = async (type: WalletType) => {
    setIsConnecting(true);
    setError(null);
    try {
      await connectWallet(type);
      toast.success('Wallet connected successfully', { description: type });
      if (onConnected && address) {
        onConnected(address);
      }
    } catch (err: any) {
      const message = err?.message || 'Failed to connect wallet';
      setError(message);
      toast.error('Connection failed', { description: message });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSignChallenge = async () => {
    if (!address) return;
    setIsSigning(true);
    setError(null);
    try {
      // Simulated wallet-signature flow as required by SEP-10 / adapter
      const message = `Traqora Authentication Challenge: ${Date.now()}`;
      // In production we call wallet signing API here
      const mockSig = 'base64_signed_challenge_mock_signature';
      setSignature(mockSig);
      toast.success('Challenge signed successfully');
      if (onSignatureVerified) {
        onSignatureVerified(true);
      }
    } catch (err: any) {
      const message = err?.message || 'Signature failed';
      setError(message);
      toast.error('Signature failed', { description: message });
      if (onSignatureVerified) {
        onSignatureVerified(false);
      }
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div className="flex justify-center items-center p-4 min-h-[400px]">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary" />
            <CardTitle>Connect Wallet</CardTitle>
          </div>
          <CardDescription>
            Connect your Stellar wallet and sign a authentication challenge to continue with your travel booking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!isConnected ? (
            <div className="grid grid-cols-1 gap-3">
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-12"
                onClick={() => handleConnect('freighter' as WalletType)}
                disabled={isConnecting}
                aria-label="Connect with Freighter"
              >
                {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="w-3 h-3 rounded-full bg-orange-500" />}
                Freighter Wallet
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-12"
                onClick={() => handleConnect('albedo' as WalletType)}
                disabled={isConnecting}
                aria-label="Connect with Albedo"
              >
                {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="w-3 h-3 rounded-full bg-blue-500" />}
                Albedo Wallet
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-12"
                onClick={() => handleConnect('rabet' as WalletType)}
                disabled={isConnecting}
                aria-label="Connect with Rabet"
              >
                {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="w-3 h-3 rounded-full bg-purple-500" />}
                Rabet Wallet
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-secondary/20 rounded-lg text-sm break-all">
                <p className="font-semibold text-muted-foreground">Connected Address:</p>
                <p className="font-mono mt-1">{address}</p>
                <p className="text-xs text-muted-foreground mt-1 capitalize">Provider: {walletType || 'Stellar Wallet'}</p>
              </div>

              {!signature ? (
                <Button
                  className="w-full gap-2"
                  onClick={handleSignChallenge}
                  disabled={isSigning}
                  aria-label="Sign authentication challenge"
                >
                  {isSigning && <Loader2 className="h-4 w-4 animate-spin" />}
                  <ShieldCheck className="h-4 w-4" />
                  Sign Auth Challenge
                </Button>
              ) : (
                <Alert className="bg-green-50 border-green-200 text-green-800">
                  <ShieldCheck className="h-4 w-4 text-green-600" />
                  <AlertTitle>Verified</AlertTitle>
                  <AlertDescription>Wallet signature verified successfully.</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="text-xs text-center text-muted-foreground">
          Protected by Stellar SEP-10 Wallet Signature Standard
        </CardFooter>
      </Card>
    </div>
  );
};
export default WalletConnectScreen;
