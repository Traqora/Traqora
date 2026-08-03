'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Building2,
  Plane,
  Users,
  ShieldCheck,
  FileText,
  Settings,
  Plus,
  ArrowRight,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  CreditCard,
  UserPlus,
  Ban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface CorporateAccount {
  id: string;
  companyName: string;
  email: string;
  registrationNumber?: string;
  phone?: string;
  industry?: string;
  creditLimitCents: number;
  paymentTermsDays: number;
  status: 'active' | 'pending' | 'suspended' | 'closed';
  users?: CorporateUser[];
  bookingPolicies?: BookingPolicy[];
}

interface CorporateUser {
  id: string;
  userId: string;
  role: 'admin' | 'booking_manager' | 'traveler' | 'approver';
  department?: string;
}

interface BookingPolicy {
  id: string;
  name: string;
  maxBookingAmountCents?: number;
  requiresApproval: boolean;
  allowedFareClasses: string[];
}

interface PendingApproval {
  id: string;
  groupBookingId: string;
  requestedBy: string;
  requestReason?: string;
  status: string;
  createdAt: string;
}

export default function CorporatePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('accounts');
  const [accounts, setAccounts] = useState<CorporateAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<CorporateAccount | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAccount, setNewAccount] = useState({
    companyName: '',
    email: '',
    registrationNumber: '',
    phone: '',
    industry: '',
    creditLimitCents: 1000000,
    paymentTermsDays: 30,
  });
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'booking_manager' | 'traveler' | 'approver'>('traveler');

  const fetchAccounts = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/v1/corporate/accounts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setAccounts(data.data.accounts || []);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPendingApprovals = async (accountId: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/v1/corporate/accounts/${accountId}/approvals/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setPendingApprovals(data.data || []);
      }
    } catch {
      // silent
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccount) {
      fetchPendingApprovals(selectedAccount.id);
    }
  }, [selectedAccount]);

  const handleCreateAccount = async () => {
    if (!newAccount.companyName || !newAccount.email) {
      toast({ title: 'Validation', description: 'Company name and email are required.', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/v1/corporate/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newAccount),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to create account');
      toast({ title: 'Success', description: 'Corporate account created.' });
      setShowCreateForm(false);
      setNewAccount({ companyName: '', email: '', registrationNumber: '', phone: '', industry: '', creditLimitCents: 1000000, paymentTermsDays: 30 });
      fetchAccounts();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUserEmail || !selectedAccount) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/v1/corporate/accounts/${selectedAccount.id}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: newUserEmail, role: newUserRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to add user');
      toast({ title: 'Success', description: 'User added to corporate account.' });
      setNewUserEmail('');
      fetchAccountDetail(selectedAccount.id);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const fetchAccountDetail = async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/v1/corporate/accounts/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setSelectedAccount(data.data);
      }
    } catch { /* silent */ }
  };

  const handleApprove = async (approvalId: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/v1/corporate/approvals/${approvalId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to approve');
      toast({ title: 'Approved', description: 'Booking approved.' });
      if (selectedAccount) fetchPendingApprovals(selectedAccount.id);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleReject = async (approvalId: string) => {
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/v1/corporate/approvals/${approvalId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to reject');
      toast({ title: 'Rejected', description: 'Booking rejected.' });
      if (selectedAccount) fetchPendingApprovals(selectedAccount.id);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      active: 'bg-green-100 text-green-800 border-green-200',
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      suspended: 'bg-red-100 text-red-800 border-red-200',
      closed: 'bg-gray-100 text-gray-800 border-gray-200',
    };
    return (
      <Badge className={cn('px-2 py-0.5 text-xs', variants[status] || '')}>
        {status}
      </Badge>
    );
  };

  const renderAccountList = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Corporate Accounts</h2>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          <Plus className="h-4 w-4 mr-2" />
          New Account
        </Button>
      </div>

      {showCreateForm && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-lg">Create Corporate Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Company Name *</label>
                <Input value={newAccount.companyName} onChange={(e) => setNewAccount({ ...newAccount, companyName: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Email *</label>
                <Input type="email" value={newAccount.email} onChange={(e) => setNewAccount({ ...newAccount, email: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Registration Number</label>
                <Input value={newAccount.registrationNumber} onChange={(e) => setNewAccount({ ...newAccount, registrationNumber: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Phone</label>
                <Input value={newAccount.phone} onChange={(e) => setNewAccount({ ...newAccount, phone: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Industry</label>
                <Input value={newAccount.industry} onChange={(e) => setNewAccount({ ...newAccount, industry: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Credit Limit ($)</label>
                <Input type="number" value={newAccount.creditLimitCents / 100} onChange={(e) => setNewAccount({ ...newAccount, creditLimitCents: Number(e.target.value) * 100 })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setShowCreateForm(false)}>Cancel</Button>
              <Button onClick={handleCreateAccount} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && !showCreateForm ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No corporate accounts yet. Create one to get started.
          </CardContent>
        </Card>
      ) : (
        accounts.map((account) => (
          <Card
            key={account.id}
            className={cn(
              'cursor-pointer transition-all hover:shadow-md',
              selectedAccount?.id === account.id && 'border-primary'
            )}
            onClick={() => {
              setSelectedAccount(account);
              fetchAccountDetail(account.id);
            }}
          >
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Building2 className="h-8 w-8 text-primary" />
                  <div>
                    <h3 className="font-semibold">{account.companyName}</h3>
                    <p className="text-sm text-muted-foreground">{account.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {statusBadge(account.status)}
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );

  const renderAccountDetail = () => {
    if (!selectedAccount) return null;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">{selectedAccount.companyName}</h2>
            <p className="text-sm text-muted-foreground">{selectedAccount.email}</p>
          </div>
          {statusBadge(selectedAccount.status)}
        </div>

        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users"><Users className="h-4 w-4 mr-2" />Users</TabsTrigger>
            <TabsTrigger value="approvals"><ShieldCheck className="h-4 w-4 mr-2" />Approvals</TabsTrigger>
            <TabsTrigger value="policies"><FileText className="h-4 w-4 mr-2" />Policies</TabsTrigger>
            <TabsTrigger value="invoices"><CreditCard className="h-4 w-4 mr-2" />Invoices</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4 pt-4">
            <div className="flex gap-2">
              <Input
                placeholder="User email or ID"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
              />
              <select
                className="px-3 py-2 rounded-md border border-input bg-background text-sm"
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as any)}
              >
                <option value="traveler">Traveler</option>
                <option value="booking_manager">Booking Manager</option>
                <option value="approver">Approver</option>
                <option value="admin">Admin</option>
              </select>
              <Button onClick={handleAddUser} size="sm">
                <UserPlus className="h-4 w-4 mr-2" />Add
              </Button>
            </div>
            {selectedAccount.users?.length ? (
              <div className="space-y-2">
                {selectedAccount.users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30">
                    <div>
                      <span className="font-medium">{user.userId}</span>
                      <Badge className="ml-2 text-xs">{user.role}</Badge>
                      {user.department && <span className="ml-2 text-sm text-muted-foreground">{user.department}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No users added yet.</p>
            )}
          </TabsContent>

          <TabsContent value="approvals" className="space-y-4 pt-4">
            {pendingApprovals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending approvals.</p>
            ) : (
              pendingApprovals.map((approval) => (
                <Card key={approval.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Booking {approval.groupBookingId.slice(0, 8)}</p>
                        <p className="text-sm text-muted-foreground">Requested by: {approval.requestedBy}</p>
                        {approval.requestReason && <p className="text-sm">{approval.requestReason}</p>}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="border-green-300 text-green-700" onClick={() => handleApprove(approval.id)}>
                          <CheckCircle className="h-4 w-4 mr-1" />Approve
                        </Button>
                        <Button size="sm" variant="outline" className="border-red-300 text-red-700" onClick={() => handleReject(approval.id)}>
                          <XCircle className="h-4 w-4 mr-1" />Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="policies" className="space-y-4 pt-4">
            <Link href={`/corporate/policies?accountId=${selectedAccount.id}`}>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />Manage Policies
              </Button>
            </Link>
            {selectedAccount.bookingPolicies?.length ? (
              selectedAccount.bookingPolicies.map((policy) => (
                <Card key={policy.id}>
                  <CardContent className="py-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-medium">{policy.name}</span>
                        <div className="flex gap-2 mt-1">
                          {policy.requiresApproval && <Badge variant="secondary">Requires Approval</Badge>}
                          {policy.maxBookingAmountCents && (
                            <Badge variant="secondary">Max: ${(policy.maxBookingAmountCents / 100).toFixed(0)}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No policies defined.</p>
            )}
          </TabsContent>

          <TabsContent value="invoices" className="space-y-4 pt-4">
            <Link href={`/corporate/invoices?accountId=${selectedAccount.id}`}>
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4 mr-2" />View Invoices
              </Button>
            </Link>
          </TabsContent>
        </Tabs>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header>
        <nav className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/')}>
                <Plane className="h-8 w-8 text-primary" aria-hidden="true" />
                <span className="font-serif font-bold text-2xl">Traqora</span>
              </div>
              <div className="flex gap-2">
                <Link href="/dashboard">
                  <Button variant="ghost" size="sm">Dashboard</Button>
                </Link>
                <Link href="/book/group">
                  <Button variant="ghost" size="sm">Group Booking</Button>
                </Link>
              </div>
            </div>
          </div>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Building2 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="font-serif font-bold text-3xl">Corporate Travel Management</h1>
            <p className="text-muted-foreground">Manage corporate accounts, booking policies, and approvals.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            {renderAccountList()}
          </div>
          <div className="lg:col-span-2">
            {selectedAccount ? renderAccountDetail() : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-4 opacity-40" />
                  <p className="text-lg font-medium">Select a corporate account</p>
                  <p className="text-sm">Choose an account from the left to manage users, approvals, and policies.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
