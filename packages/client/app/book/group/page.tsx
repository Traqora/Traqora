'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plane,
  ArrowLeft,
  ArrowRight,
  Mail,
  Users,
  Wallet,
  CheckCircle,
  UserPlus,
  Trash2,
  Copy,
  Share2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFlightSearch } from '@/hooks/use-flight-search';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type SplitMethod = 'equal' | 'custom' | 'percentage';

interface GroupMember {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  shareAmountCents?: number;
  status: 'pending' | 'confirmed' | 'paid' | 'failed' | 'cancelled';
  role: 'organizer' | 'member';
  isInvited: boolean;
}

interface GroupBookingData {
  id: string;
  groupName: string;
  flightId: string;
  status: string;
  totalAmountCents: number;
  paidAmountCents: number;
  splitMethod: SplitMethod;
  members: GroupMember[];
  organizerEmail: string;
  sharedItinerary?: string;
}

export default function GroupBookingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { flights } = useFlightSearch();

  const [step, setStep] = useState<'setup' | 'members' | 'split' | 'invite' | 'confirm'>('setup');
  const [groupName, setGroupName] = useState('');
  const [selectedFlightId, setSelectedFlightId] = useState('');
  const [organizerEmail, setOrganizerEmail] = useState('');
  const [memberEmails, setMemberEmails] = useState<string[]>([]);
  const [currentEmail, setCurrentEmail] = useState('');
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal');
  const [splitConfig, setSplitConfig] = useState<Record<string, number>>({});
  const [groupBooking, setGroupBooking] = useState<GroupBookingData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState('');

  const selectedFlight = flights.find((f) => f.id === selectedFlightId);

  // Calculate total amount
  const totalAmount = selectedFlight ? selectedFlight.price * (memberEmails.length + 1) : 0;
  const equalShare = memberEmails.length > 0 ? Math.floor(totalAmount / (memberEmails.length + 1)) : 0;

  const handleAddMember = () => {
    if (!currentEmail || !currentEmail.includes('@')) {
      toast({ title: 'Invalid email', description: 'Please enter a valid email address.', variant: 'destructive' });
      return;
    }
    if (memberEmails.includes(currentEmail)) {
      toast({ title: 'Duplicate email', description: 'This email has already been added.', variant: 'destructive' });
      return;
    }
    setMemberEmails([...memberEmails, currentEmail]);
    setCurrentEmail('');
  };

  const handleRemoveMember = (email: string) => {
    setMemberEmails(memberEmails.filter((e) => e !== email));
  };

  const handleCreateGroup = async () => {
    if (!groupName || !selectedFlightId || !organizerEmail || memberEmails.length === 0) {
      toast({
        title: 'Missing information',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/v1/group-bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          groupName,
          flightId: selectedFlightId,
          organizerEmail,
          memberEmails,
          splitMethod,
          splitConfig: Object.keys(splitConfig).length > 0 ? splitConfig : undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || 'Failed to create group booking');
      }

      setGroupBooking(result.data);
      setInviteLink(`${window.location.origin}/book/group/invite/${result.data.id}`);
      setStep('invite');

      toast({
        title: 'Group created!',
        description: 'Invitations have been sent to all members.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create group booking',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink);
    toast({
      title: 'Copied!',
      description: 'Invite link copied to clipboard.',
    });
  };

  const handleShareInvite = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${groupName} on Traqora`,
          text: `You're invited to join a group booking for ${selectedFlight?.fromCity} to ${selectedFlight?.toCity}.`,
          url: inviteLink,
        });
      } catch (error) {
        console.log('Share cancelled');
      }
    } else {
      handleCopyInviteLink();
    }
  };

  const handleProceedToPayment = () => {
    router.push(`/book/group/payment/${groupBooking?.id}`);
  };

  const renderSetup = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Create Group Booking</CardTitle>
          <CardDescription>Plan a trip together with friends, family, or colleagues.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Group Name</label>
            <Input
              placeholder="e.g., Summer Vacation 2024"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Organizer Email</label>
            <Input
              type="email"
              placeholder="your-email@example.com"
              value={organizerEmail}
              onChange={(e) => setOrganizerEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Select Flight</label>
            <select
              className="w-full p-2 rounded-md border border-input bg-background"
              value={selectedFlightId}
              onChange={(e) => setSelectedFlightId(e.target.value)}
            >
              <option value="">Select a flight...</option>
              {flights.map((flight) => (
                <option key={flight.id} value={flight.id}>
                  {flight.fromCity} → {flight.toCity} | {flight.airline} | ${flight.price}
                </option>
              ))}
            </select>
          </div>

          {selectedFlight && (
            <Alert className="bg-primary/5 border-primary/20">
              <Plane className="h-4 w-4 text-primary" />
              <AlertDescription className="text-primary">
                {selectedFlight.airline} • {selectedFlight.fromCity} → {selectedFlight.toCity} • ${selectedFlight.price} per person
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={() => setStep('members')}
              disabled={!groupName || !selectedFlightId || !organizerEmail}
              className="px-8"
            >
              Add Members
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderMembers = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Add Group Members</CardTitle>
          <CardDescription>Add the email addresses of everyone joining this trip.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="friend@example.com"
              value={currentEmail}
              onChange={(e) => setCurrentEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddMember()}
            />
            <Button onClick={handleAddMember} variant="outline">
              <UserPlus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>

          {memberEmails.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                {memberEmails.length + 1} members (including organizer)
              </p>
              <div className="space-y-1">
                {/* Organizer */}
                <div className="flex items-center justify-between p-2 rounded-md bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="font-medium">{organizerEmail}</span>
                    <Badge variant="secondary" className="text-xs">Organizer</Badge>
                  </div>
                </div>
                {/* Members */}
                {memberEmails.map((email) => (
                  <div
                    key={email}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/30"
                  >
                    <span className="text-sm">{email}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveMember(email)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep('setup')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button size="lg" onClick={() => setStep('split')} disabled={memberEmails.length === 0} className="px-8">
              Set Split Method
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderSplit = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Split Payment Method</CardTitle>
          <CardDescription>Choose how the cost will be divided among group members.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <button
              className={cn(
                'p-4 rounded-xl border-2 text-center transition-all',
                splitMethod === 'equal'
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-primary/50'
              )}
              onClick={() => setSplitMethod('equal')}
            >
              <div className="text-2xl mb-2">🔄</div>
              <div className="font-medium">Equal</div>
              <div className="text-xs text-muted-foreground">Split evenly among all members</div>
            </button>
            <button
              className={cn(
                'p-4 rounded-xl border-2 text-center transition-all',
                splitMethod === 'custom'
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-primary/50'
              )}
              onClick={() => setSplitMethod('custom')}
            >
              <div className="text-2xl mb-2">✏️</div>
              <div className="font-medium">Custom</div>
              <div className="text-xs text-muted-foreground">Set custom amounts per member</div>
            </button>
            <button
              className={cn(
                'p-4 rounded-xl border-2 text-center transition-all',
                splitMethod === 'percentage'
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-primary/50'
              )}
              onClick={() => setSplitMethod('percentage')}
            >
              <div className="text-2xl mb-2">📊</div>
              <div className="font-medium">Percentage</div>
              <div className="text-xs text-muted-foreground">Split by percentage shares</div>
            </button>
          </div>

          <div className="bg-muted/30 rounded-xl p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Cost</span>
              <span className="font-bold">${(totalAmount / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Number of Members</span>
              <span className="font-bold">{memberEmails.length + 1}</span>
            </div>
            {splitMethod === 'equal' && (
              <div className="flex justify-between text-sm mt-2 pt-2 border-t border-border">
                <span className="text-muted-foreground">Per Person</span>
                <span className="font-bold text-primary">${(equalShare / 100).toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep('members')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button size="lg" onClick={handleCreateGroup} disabled={isLoading} className="px-8">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  Create Group Booking
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderInvite = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 text-center">
      <Card>
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <CardTitle className="font-serif text-2xl">Group Created!</CardTitle>
          <CardDescription>
            Your group booking for <strong>{groupName}</strong> has been created.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/30 rounded-xl p-6 space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Group Details</p>
            <p className="font-bold">{groupName}</p>
            <p className="text-sm text-muted-foreground">
              {selectedFlight?.fromCity} → {selectedFlight?.toCity}
            </p>
            <p className="text-sm text-muted-foreground">
              {memberEmails.length + 1} members • ${(totalAmount / 100).toFixed(2)} total
            </p>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Share this invitation link with your group members:
            </p>
            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
              <code className="flex-1 text-xs text-left break-all">{inviteLink}</code>
              <Button variant="ghost" size="sm" onClick={handleCopyInviteLink}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleShareInvite}>
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="flex items-center justify-center gap-2">
              <Mail className="h-4 w-4" />
              Invitations have been sent to {memberEmails.length} members
            </p>
            <p className="flex items-center justify-center gap-2">
              <Users className="h-4 w-4" />
              Once all members confirm, you can proceed to payment
            </p>
          </div>

          <div className="flex justify-center gap-4">
            <Button variant="outline" onClick={() => router.push('/dashboard')}>
              Go to Dashboard
            </Button>
            <Button onClick={handleProceedToPayment} className="px-8">
              Proceed to Payment
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2 cursor-pointer" onClick={() => router.push('/')}>
              <Plane className="h-8 w-8 text-primary" />
              <span className="font-serif font-bold text-2xl text-foreground">Traqora</span>
            </div>
            <Link href="/flights/search">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Search
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="font-serif font-bold text-3xl text-foreground mb-2">Group Booking</h1>
        <p className="text-muted-foreground mb-8">Plan and split travel costs with your group.</p>

        {/* Steps Progress */}
        <div className="mb-8">
          <div className="flex items-center gap-2">
            {['setup', 'members', 'split', 'invite'].map((s, i) => {
              const currentIndex = ['setup', 'members', 'split', 'invite'].indexOf(step);
              const isCompleted = currentIndex > i;
              const isActive = currentIndex === i;

              return (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all',
                      isCompleted && 'bg-primary text-primary-foreground',
                      isActive && 'bg-primary/10 text-primary border border-primary/20',
                      !isCompleted && !isActive && 'bg-muted text-muted-foreground'
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <span className="w-4 h-4 text-center text-xs font-bold">{i + 1}</span>
                    )}
                    <span className="hidden sm:inline">
                      {['Setup', 'Members', 'Split', 'Invite'][i]}
                    </span>
                  </div>
                  {i < 3 && (
                    <div
                      className={cn(
                        'flex-1 h-px',
                        i < currentIndex ? 'bg-primary' : 'bg-muted'
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        {step === 'setup' && renderSetup()}
        {step === 'members' && renderMembers()}
        {step === 'split' && renderSplit()}
        {step === 'invite' && renderInvite()}
      </div>
    </div>
  );
}