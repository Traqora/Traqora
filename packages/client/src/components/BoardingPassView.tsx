import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Plane, Download, Wallet, Printer, WifiOff } from 'lucide-react';
import { apiClient, CheckInRecord } from '@/lib/api';

interface BoardingPassViewProps {
  bookingId: string;
  checkIn: CheckInRecord;
  fromAirport?: string;
  toAirport?: string;
  flightNumber?: string;
  airlineCode?: string;
  passengerName?: string;
  departureTime?: string;
  gate?: string;
  terminal?: string;
  /** True when the pass is being served from the offline cache. */
  isFromCache?: boolean;
}

export function BoardingPassView({
  bookingId,
  checkIn,
  fromAirport,
  toAirport,
  flightNumber,
  airlineCode,
  passengerName,
  departureTime,
  gate,
  terminal,
  isFromCache = false,
}: BoardingPassViewProps) {
  const pdfUrl = apiClient.getBoardingPassPdfUrl(bookingId);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [walletError, setWalletError] = useState<string | null>(null);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-4 space-y-4">
      {(isFromCache || !isOnline) && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800"
        >
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {isOnline
              ? 'Showing your saved boarding pass. Connect to refresh the latest details.'
              : 'You are offline. Showing your saved boarding pass; PDF and wallet downloads require a connection.'}
          </span>
        </div>
      )}

      <div className="flex justify-end gap-2 print:hidden">
        <Button variant="outline" onClick={handlePrint} aria-label="Print boarding pass">
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
      </div>

      <Card className="overflow-hidden border border-border shadow-xl bg-card text-card-foreground print:shadow-none print:border-black">
        <CardHeader className="bg-primary text-primary-foreground p-6 print:bg-slate-900 print:text-white">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-xl font-serif flex items-center gap-2">
                <Plane className="h-5 w-5" />
                Traqora Boarding Pass
              </CardTitle>
              <p className="text-xs opacity-90 mt-1">
                Flight {airlineCode}{flightNumber}
              </p>
            </div>
            <Badge variant="secondary" className="bg-white/20 text-white border-none capitalize">
              {checkIn.status ? checkIn.status.replace(/_/g, ' ') : 'Checked In'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Passenger</span>
              <p className="text-lg font-semibold">{passengerName || 'Valued Passenger'}</p>
            </div>
            <div className="space-y-1 md:text-center">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Route</span>
              <div className="flex items-center md:justify-center gap-3">
                <span className="text-2xl font-bold">{fromAirport || 'ORIGIN'}</span>
                <Plane className="h-5 w-5 text-muted-foreground" />
                <span className="text-2xl font-bold">{toAirport || 'DEST'}</span>
              </div>
            </div>
            <div className="space-y-1 md:text-right">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Departure</span>
              <p className="text-base font-medium">
                {departureTime ? new Date(departureTime).toLocaleString() : 'As Scheduled'}
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground text-xs uppercase">Seat</span>
              <p className="text-lg font-bold">{checkIn.seatNumber || 'Not assigned'}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs uppercase">Gate</span>
              <p className="text-lg font-bold">{gate || 'TBD'}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs uppercase">Terminal</span>
              <p className="text-lg font-bold">{terminal || 'TBD'}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs uppercase">Boarding Code</span>
              <p className="font-mono font-bold text-xs truncate" title={checkIn.boardingPassCode}>
                {checkIn.boardingPassCode}
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-dashed border-border flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">
              Please arrive at the boarding gate at least 45 minutes prior to departure.
            </div>
            {checkIn.status === 'checked_in' && (
              <div className="flex flex-wrap gap-2 w-full sm:w-auto print:hidden">
                {isOnline ? (
                  <a href={pdfUrl} target="_blank" rel="noreferrer" className="flex-1 sm:flex-initial">
                    <Button variant="outline" className="w-full justify-start">
                      <Download className="h-4 w-4 mr-2" />
                      PDF
                    </Button>
                  </a>
                ) : (
                  <Button
                    variant="outline"
                    className="flex-1 sm:flex-initial"
                    disabled
                    title="Connect to the internet to download your boarding pass PDF"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="flex-1 sm:flex-initial"
                  disabled={!isOnline}
                  title={
                    isOnline
                      ? undefined
                      : 'Connect to the internet to add your pass to Apple Wallet'
                  }
                  onClick={async () => {
                    if (!isOnline) return;
                    setWalletError(null);
                    try {
                      const response = await apiClient.getWalletPass(bookingId);
                      if (!response.success) {
                        throw new Error(response.error?.message || 'Failed to fetch wallet pass');
                      }
                      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `apple-boarding-pass-${bookingId}.pkpass.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch (err: any) {
                      setWalletError(err?.message || 'Unable to download wallet pass');
                    }
                  }}
                >
                  <Wallet className="h-4 w-4 mr-2 text-blue-500" />
                  Apple Wallet
                </Button>
              </div>
            )}
            {walletError && (
              <p role="alert" className="text-xs text-destructive w-full">
                {walletError}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
