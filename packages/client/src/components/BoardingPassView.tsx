import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Plane, Download, Wallet, Printer } from 'lucide-react';
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
}: BoardingPassViewProps) {
  const pdfUrl = apiClient.getBoardingPassPdfUrl(bookingId);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-4 space-y-4">
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
                <a href={pdfUrl} target="_blank" rel="noreferrer" className="flex-1 sm:flex-initial">
                  <Button variant="outline" className="w-full justify-start">
                    <Download className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
                </a>
                <Button
                  variant="outline"
                  className="flex-1 sm:flex-initial"
                  onClick={async () => {
                    const response = await apiClient.getWalletPass(bookingId);
                    if (response.success) {
                      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `apple-boarding-pass-${bookingId}.pkpass.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }
                  }}
                >
                  <Wallet className="h-4 w-4 mr-2 text-blue-500" />
                  Apple Wallet
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
