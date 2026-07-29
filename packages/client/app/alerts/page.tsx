'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Plus,
  Trash2,
  Edit,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Loader2,
  XCircle,
  Plane,
  DollarSign,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface PriceAlert {
  id: string;
  userId: string;
  flightId: string;
  targetPrice: number;
  currentPrice?: number;
  currency: string;
  notificationMethod: 'email' | 'push' | 'both';
  isActive: boolean;
  createdAt: string;
  lastNotifiedAt?: string;
  triggeredCount: number;
}

interface AlertFormData {
  flightId: string;
  targetPrice: string;
  currency: string;
  notificationMethod: 'email' | 'push' | 'both';
}

export default function AlertsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<PriceAlert | null>(null);
  const [formData, setFormData] = useState<AlertFormData>({
    flightId: '',
    targetPrice: '',
    currency: 'USD',
    notificationMethod: 'email',
  });
  const [activeTab, setActiveTab] = useState<'active' | 'history' | 'all'>('active');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkingPrice, setCheckingPrice] = useState<string | null>(null);

  const fetchAlerts = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/alerts', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch alerts');
      }

      const result = await response.json();
      setAlerts(result.data || []);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load price alerts. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAlertHistory = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/alerts/history', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch alert history');
      }

      const result = await response.json();
      setAlerts(result.data || []);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load alert history.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchAlertHistory();
    } else {
      fetchAlerts();
    }
  }, [activeTab]);

  const handleCreateAlert = async () => {
    if (!formData.flightId || !formData.targetPrice) {
      toast({
        title: 'Missing fields',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/v1/alerts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          flightId: formData.flightId,
          targetPrice: parseFloat(formData.targetPrice),
          currency: formData.currency,
          notificationMethod: formData.notificationMethod,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create alert');
      }

      const result = await response.json();
      setAlerts([result.data, ...alerts]);
      setIsDialogOpen(false);
      resetForm();

      toast({
        title: 'Alert created!',
        description: `You'll be notified when flight ${formData.flightId} drops below $${formData.targetPrice}`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create alert',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateAlert = async () => {
    if (!editingAlert) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/v1/alerts/${editingAlert.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          targetPrice: parseFloat(formData.targetPrice),
          currency: formData.currency,
          notificationMethod: formData.notificationMethod,
          isActive: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update alert');
      }

      const result = await response.json();
      setAlerts(alerts.map((a) => (a.id === editingAlert.id ? result.data : a)));
      setIsDialogOpen(false);
      resetForm();

      toast({
        title: 'Alert updated!',
        description: 'Your price alert has been updated successfully.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update alert',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAlert = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this alert?')) return;

    try {
      const response = await fetch(`/api/v1/alerts/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete alert');
      }

      setAlerts(alerts.filter((a) => a.id !== id));

      toast({
        title: 'Alert deactivated',
        description: 'The price alert has been deactivated.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete alert',
        variant: 'destructive',
      });
    }
  };

  const handleReactivateAlert = async (id: string) => {
    try {
      const response = await fetch(`/api/v1/alerts/${id}/activate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to reactivate alert');
      }

      const result = await response.json();
      setAlerts(alerts.map((a) => (a.id === id ? result.data : a)));

      toast({
        title: 'Alert reactivated',
        description: 'The price alert has been reactivated.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to reactivate alert',
        variant: 'destructive',
      });
    }
  };

  const handleCheckPrice = async (flightId: string) => {
    setCheckingPrice(flightId);
    try {
      const response = await fetch('/api/v1/alerts/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ flightId }),
      });

      if (!response.ok) {
        throw new Error('Failed to check price');
      }

      const result = await response.json();

      toast({
        title: 'Price check completed',
        description: `Current price: $${result.data.currentPrice}. ${result.data.triggeredAlerts} alerts triggered.`,
      });

      // Refresh alerts to update current prices
      await fetchAlerts();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to check price',
        variant: 'destructive',
      });
    } finally {
      setCheckingPrice(null);
    }
  };

  const resetForm = () => {
    setFormData({
      flightId: '',
      targetPrice: '',
      currency: 'USD',
      notificationMethod: 'email',
    });
    setEditingAlert(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (alert: PriceAlert) => {
    setEditingAlert(alert);
    setFormData({
      flightId: alert.flightId,
      targetPrice: alert.targetPrice.toString(),
      currency: alert.currency,
      notificationMethod: alert.notificationMethod,
    });
    setIsDialogOpen(true);
  };

  const filteredAlerts = alerts.filter((alert) => {
    if (activeTab === 'active') return alert.isActive;
    if (activeTab === 'history') return !alert.isActive || alert.triggeredCount > 0;
    return true;
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-serif font-bold text-3xl text-foreground flex items-center gap-2">
              <Bell className="h-8 w-8 text-primary" />
              Price Alerts
            </h1>
            <p className="text-muted-foreground mt-1">
              Get notified when flight prices drop to your target.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={fetchAlerts} size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={openCreateDialog} className="px-6">
              <Plus className="h-4 w-4 mr-2" />
              New Alert
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Alerts</p>
                <p className="text-2xl font-bold">{alerts.filter((a) => a.isActive).length}</p>
              </div>
              <Bell className="h-8 w-8 text-primary/40" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Triggered</p>
                <p className="text-2xl font-bold">
                  {alerts.filter((a) => a.triggeredCount > 0).length}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500/40" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Alerts</p>
                <p className="text-2xl font-bold">{alerts.length}</p>
              </div>
              <Plane className="h-8 w-8 text-muted-foreground/40" />
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'active' | 'history' | 'all')}
          className="mb-6"
        >
          <TabsList>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="all">All Alerts</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Alert List */}
        {filteredAlerts.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <Bell className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No Price Alerts</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                {activeTab === 'active'
                  ? 'You haven\'t set up any price alerts yet. Create one to get notified when flight prices drop.'
                  : activeTab === 'history'
                  ? 'No alert history found. Your triggered alerts will appear here.'
                  : 'No alerts found. Create your first price alert to get started.'}
              </p>
              {activeTab === 'active' && (
                <Button onClick={openCreateDialog} className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Alert
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredAlerts.map((alert) => (
              <Card key={alert.id} className={cn(!alert.isActive && 'opacity-60')}>
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-foreground">
                          Flight {alert.flightId}
                        </h3>
                        <Badge
                          variant={alert.isActive ? 'secondary' : 'destructive'}
                          className="text-xs"
                        >
                          {alert.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                        {alert.triggeredCount > 0 && (
                          <Badge variant="outline" className="text-xs">
                            Triggered {alert.triggeredCount}x
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          Target: ${alert.targetPrice} {alert.currency}
                        </span>
                        {alert.currentPrice && (
                          <span className="flex items-center gap-1 text-green-600">
                            Current: ${alert.currentPrice} {alert.currency}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Bell className="h-3 w-3" />
                          {alert.notificationMethod}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Created: {formatDate(alert.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCheckPrice(alert.flightId)}
                        disabled={checkingPrice === alert.flightId}
                      >
                        {checkingPrice === alert.flightId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        Check Price
                      </Button>
                      {alert.isActive ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(alert)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAlert(alert.id)}
                            className="text-red-500 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReactivateAlert(alert.id)}
                          className="text-green-500 hover:text-green-600"
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {editingAlert ? 'Edit Price Alert' : 'Create Price Alert'}
            </DialogTitle>
            <DialogDescription>
              {editingAlert
                ? 'Update your price alert settings.'
                : 'Set a target price and get notified when the flight drops to or below it.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Flight ID</label>
              <Input
                placeholder="e.g., DL1234"
                value={formData.flightId}
                onChange={(e) => setFormData({ ...formData, flightId: e.target.value.toUpperCase() })}
                disabled={!!editingAlert}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Target Price</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="pl-9"
                  value={formData.targetPrice}
                  onChange={(e) => setFormData({ ...formData, targetPrice: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Currency</label>
              <Select
                value={formData.currency}
                onValueChange={(value) => setFormData({ ...formData, currency: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="XLM">XLM (Stellar Lumens)</SelectItem>
                  <SelectItem value="USDC">USDC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notification Method</label>
              <Select
                value={formData.notificationMethod}
                onValueChange={(value: 'email' | 'push' | 'both') =>
                  setFormData({ ...formData, notificationMethod: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select notification method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email Only</SelectItem>
                  <SelectItem value="push">Push Only</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={editingAlert ? handleUpdateAlert : handleCreateAlert}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingAlert ? 'Update Alert' : 'Create Alert'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}