'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Filter, Search, Shield, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';

interface AuditLog {
  id: string;
  logType: 'security' | 'admin' | 'approval';
  userId?: string;
  adminId?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  details?: string;
  ipAddress: string;
  createdAt: string;
  isFlagged?: boolean;
  flagReason?: string;
}

interface Filters {
  logType: string;
  action: string;
  userId: string;
  adminId: string;
  ipAddress: string;
  startDate: string;
  endDate: string;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({
    logType: 'all',
    action: '',
    userId: '',
    adminId: '',
    ipAddress: '',
    startDate: '',
    endDate: '',
  });
  const [activeTab, setActiveTab] = useState('all');

  // Mock data - in production, this would come from API
  useEffect(() => {
    const mockLogs: AuditLog[] = [
      {
        id: '1',
        logType: 'security',
        userId: 'user-123',
        action: 'login_success',
        ipAddress: '192.168.1.100',
        createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      },
      {
        id: '2',
        logType: 'admin',
        adminId: 'admin-456',
        action: 'user_update',
        resource: 'user',
        resourceId: 'user-123',
        details: 'Updated user email',
        ipAddress: '192.168.1.50',
        createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      },
      {
        id: '3',
        logType: 'security',
        userId: 'user-789',
        action: 'login_failure',
        ipAddress: '192.168.1.200',
        createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        isFlagged: true,
        flagReason: 'Multiple failed login attempts',
      },
      {
        id: '4',
        logType: 'approval',
        adminId: 'admin-456',
        action: 'payment_approval',
        resource: 'payment',
        resourceId: 'payment-999',
        details: 'Approved payment processing',
        ipAddress: '192.168.1.50',
        createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      },
      {
        id: '5',
        logType: 'security',
        userId: 'user-123',
        action: 'password_change',
        ipAddress: '192.168.1.100',
        createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      },
    ];

    setLogs(mockLogs);
    setFilteredLogs(mockLogs);
    setLoading(false);
  }, []);

  // Apply filters
  useEffect(() => {
    let filtered = [...logs];

    if (filters.logType !== 'all') {
      filtered = filtered.filter(log => log.logType === filters.logType);
    }

    if (filters.action) {
      filtered = filtered.filter(log => 
        log.action.toLowerCase().includes(filters.action.toLowerCase())
      );
    }

    if (filters.userId) {
      filtered = filtered.filter(log => 
        log.userId?.toLowerCase().includes(filters.userId.toLowerCase())
      );
    }

    if (filters.adminId) {
      filtered = filtered.filter(log => 
        log.adminId?.toLowerCase().includes(filters.adminId.toLowerCase())
      );
    }

    if (filters.ipAddress) {
      filtered = filtered.filter(log => 
        log.ipAddress.toLowerCase().includes(filters.ipAddress.toLowerCase())
      );
    }

    if (filters.startDate) {
      filtered = filtered.filter(log => new Date(log.createdAt) >= new Date(filters.startDate));
    }

    if (filters.endDate) {
      filtered = filtered.filter(log => new Date(log.createdAt) <= new Date(filters.endDate));
    }

    setFilteredLogs(filtered);
  }, [filters, logs]);

  const handleExport = async (format: 'json' | 'csv') => {
    // In production, this would call the export API
    console.log(`Exporting logs as ${format}`);
    alert(`Exporting ${filteredLogs.length} logs as ${format.toUpperCase()}`);
  };

  const getActionIcon = (action: string) => {
    if (action.includes('login')) return <Shield className="h-4 w-4" />;
    if (action.includes('failure') || action.includes('error')) return <XCircle className="h-4 w-4 text-red-500" />;
    if (action.includes('success') || action.includes('approval')) return <CheckCircle className="h-4 w-4 text-green-500" />;
    return <Clock className="h-4 w-4" />;
  };

  const getLogTypeBadge = (logType: string) => {
    const variants: Record<string, string> = {
      security: 'bg-blue-500',
      admin: 'bg-purple-500',
      approval: 'bg-orange-500',
    };
    return variants[logType] || 'bg-gray-500';
  };

  if (loading) {
    return <div className="p-8">Loading audit logs...</div>;
  }

  return (
    <div className="container mx-auto p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Security Audit Logs</h1>
          <p className="text-muted-foreground">View and filter all security and admin audit events</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleExport('csv')}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => handleExport('json')}>
            <Download className="h-4 w-4 mr-2" />
            Export JSON
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All Logs ({logs.length})</TabsTrigger>
          <TabsTrigger value="security">Security ({logs.filter(l => l.logType === 'security').length})</TabsTrigger>
          <TabsTrigger value="admin">Admin ({logs.filter(l => l.logType === 'admin').length})</TabsTrigger>
          <TabsTrigger value="approval">Approvals ({logs.filter(l => l.logType === 'approval').length})</TabsTrigger>
          <TabsTrigger value="flagged">Flagged ({logs.filter(l => l.isFlagged).length})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters
              </CardTitle>
              <CardDescription>Filter audit logs by various criteria</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="logType">Log Type</Label>
                  <Select
                    value={filters.logType}
                    onValueChange={(value) => setFilters({ ...filters, logType: value })}
                  >
                    <SelectTrigger id="logType">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="security">Security</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="approval">Approval</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="action">Action</Label>
                  <Input
                    id="action"
                    placeholder="Search actions..."
                    value={filters.action}
                    onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="userId">User ID</Label>
                  <Input
                    id="userId"
                    placeholder="Filter by user ID..."
                    value={filters.userId}
                    onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminId">Admin ID</Label>
                  <Input
                    id="adminId"
                    placeholder="Filter by admin ID..."
                    value={filters.adminId}
                    onChange={(e) => setFilters({ ...filters, adminId: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ipAddress">IP Address</Label>
                  <Input
                    id="ipAddress"
                    placeholder="Filter by IP..."
                    value={filters.ipAddress}
                    onChange={(e) => setFilters({ ...filters, ipAddress: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="datetime-local"
                    value={filters.startDate}
                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="datetime-local"
                    value={filters.endDate}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  />
                </div>

                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={() => setFilters({
                      logType: 'all',
                      action: '',
                      userId: '',
                      adminId: '',
                      ipAddress: '',
                      startDate: '',
                      endDate: '',
                    })}
                    className="w-full"
                  >
                    Clear Filters
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Audit Log Entries</span>
                <Badge variant="secondary">{filteredLogs.length} records</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>User ID</TableHead>
                      <TableHead>Admin ID</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">
                          No audit logs found matching the current filters
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            <Badge className={getLogTypeBadge(log.logType)}>
                              {log.logType}
                            </Badge>
                          </TableCell>
                          <TableCell className="flex items-center gap-2">
                            {getActionIcon(log.action)}
                            <span className="capitalize">{log.action.replace(/_/g, ' ')}</span>
                          </TableCell>
                          <TableCell>{log.userId || '-'}</TableCell>
                          <TableCell>{log.adminId || '-'}</TableCell>
                          <TableCell className="font-mono text-sm">{log.ipAddress}</TableCell>
                          <TableCell className="max-w-xs truncate">{log.details || '-'}</TableCell>
                          <TableCell className="text-sm">
                            {new Date(log.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {log.isFlagged ? (
                              <Badge variant="destructive" className="flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Flagged
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" />
                                Normal
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
