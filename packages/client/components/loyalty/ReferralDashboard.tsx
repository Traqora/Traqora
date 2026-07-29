'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Copy, Mail, Users, TrendingUp, DollarSign } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface ReferralStats {
  totalClicks: number;
  totalConversions: number;
  pendingPoints: number;
  earnedPoints: number;
  referees: string[];
}

interface ReferralData {
  userId: string;
  referralCode: string | null;
  stats: ReferralStats;
  tier: string;
}

export function ReferralDashboard() {
  const [referralData, setReferralData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviterName, setInviterName] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchReferralData();
  }, []);

  const fetchReferralData = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const token = localStorage.getItem('authToken');
      
      const response = await fetch(`${apiUrl}/api/v1/referrals/dashboard`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setReferralData(data);
      }
      setLoading(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load referral data',
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  const generateReferralCode = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const token = localStorage.getItem('authToken');
      
      const response = await fetch(`${apiUrl}/api/v1/referrals/codes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        await fetchReferralData();
        toast({
          title: 'Success',
          description: 'Referral code generated!',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate referral code',
        variant: 'destructive',
      });
    }
  };

  const copyReferralLink = () => {
    if (!referralData?.referralCode) return;
    
    const link = `${window.location.origin}/signup?ref=${referralData.referralCode}`;
    navigator.clipboard.writeText(link);
    toast({
      title: 'Copied!',
      description: 'Referral link copied to clipboard',
    });
  };

  const sendInvite = async () => {
    if (!inviteEmail || !referralData?.referralCode) return;

    try {
      setSendingInvite(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const token = localStorage.getItem('authToken');
      
      const response = await fetch(`${apiUrl}/api/v1/referrals/invite`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: inviteEmail,
          inviterName: inviterName || undefined,
        }),
      });

      if (response.ok) {
        toast({
          title: 'Invite Sent!',
          description: `Invitation sent to ${inviteEmail}`,
        });
        setInviteEmail('');
        setInviterName('');
      } else {
        throw new Error('Failed to send invite');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send invitation',
        variant: 'destructive',
      });
    } finally {
      setSendingInvite(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Referral Program</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-32">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </CardContent>
      </Card>
    );
  }

  if (!referralData?.referralCode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Referral Program</CardTitle>
          <CardDescription>Invite friends and earn rewards</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate your unique referral code to start earning points when your friends book their first flight.
            </p>
            <Button onClick={generateReferralCode}>Generate Referral Code</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Your Referral Code</CardTitle>
          <CardDescription>Share this code with friends to earn rewards</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input 
              value={referralData.referralCode} 
              readOnly 
              className="font-mono text-lg"
            />
            <Button onClick={copyReferralLink} size="icon">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full">
                <Mail className="mr-2 h-4 w-4" />
                Send Email Invitation
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Send Invitation</DialogTitle>
                <DialogDescription>
                  Invite a friend via email to join Traqora
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="email">Friend's Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="friend@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="name">Your Name (optional)</Label>
                  <Input
                    id="name"
                    placeholder="Your name"
                    value={inviterName}
                    onChange={(e) => setInviterName(e.target.value)}
                  />
                </div>
                <Button 
                  onClick={sendInvite} 
                  disabled={!inviteEmail || sendingInvite}
                  className="w-full"
                >
                  {sendingInvite ? 'Sending...' : 'Send Invitation'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clicks</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{referralData.stats.totalClicks}</div>
            <p className="text-xs text-muted-foreground">Link visits</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{referralData.stats.totalConversions}</div>
            <p className="text-xs text-muted-foreground">Friends who booked</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Points Earned</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{referralData.stats.earnedPoints}</div>
            <p className="text-xs text-muted-foreground">Loyalty points</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Your Tier</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">{referralData.tier}</div>
            <p className="text-xs text-muted-foreground">Loyalty tier</p>
          </CardContent>
        </Card>
      </div>

      {referralData.stats.referees.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Referred Friends</CardTitle>
            <CardDescription>
              {referralData.stats.referees.length} friends have joined through your referral
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {referralData.stats.referees.map((referee, index) => (
                <div key={referee} className="flex items-center justify-between p-2 bg-muted rounded">
                  <span className="text-sm">Friend {index + 1}</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {referee.slice(0, 8)}...{referee.slice(-6)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
