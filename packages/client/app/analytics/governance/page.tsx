"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Shield,
  Lock,
  Eye,
  FileText,
  CheckCircle,
  AlertTriangle,
  Download,
  Settings,
  Users,
} from "lucide-react";
import { NavWalletButton } from "@/components/nav-wallet-button";

const complianceData = [
  { month: "Jan", reports: 12, findings: 8, resolved: 6 },
  { month: "Feb", reports: 15, findings: 10, resolved: 8 },
  { month: "Mar", reports: 18, findings: 14, resolved: 12 },
  { month: "Apr", reports: 16, findings: 11, resolved: 10 },
  { month: "May", reports: 20, findings: 15, resolved: 14 },
];

const dataClassification = [
  { name: "Public", value: 15, color: "#10b981" },
  { name: "Internal", value: 25, color: "#3b82f6" },
  { name: "Confidential", value: 35, color: "#f59e0b" },
  { name: "Restricted", value: 15, color: "#ef4444" },
  { name: "PII", value: 10, color: "#8b5cf6" },
];

const consentMetrics = [
  { type: "Marketing", granted: 450, withdrawn: 50, pending: 100 },
  { type: "Analytics", granted: 520, withdrawn: 30, pending: 50 },
  { type: "Data Processing", granted: 600, withdrawn: 0, pending: 0 },
  { type: "Third Party", granted: 380, withdrawn: 70, pending: 150 },
  { type: "Profiling", granted: 250, withdrawn: 120, pending: 230 },
];

export default function GovernanceDashboard() {
  const [timeRange, setTimeRange] = useState("30d");

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center space-x-2">
              <Shield className="h-8 w-8 text-primary" />
              <span className="font-serif font-bold text-2xl text-foreground">
                Traqora Analytics
              </span>
            </Link>
            <div className="hidden md:flex items-center space-x-8">
              <Link
                href="/analytics"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/analytics/governance"
                className="text-primary font-semibold"
              >
                Governance
              </Link>
              <NavWalletButton />
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Analytics Governance</h1>
          <p className="text-xl text-muted-foreground">
            Monitor compliance, data privacy, and governance metrics
          </p>
        </div>

        {/* Time Range Selector */}
        <div className="flex gap-2 mb-8">
          {["7d", "30d", "90d", "1y"].map((range) => (
            <Button
              key={range}
              variant={timeRange === range ? "default" : "outline"}
              onClick={() => setTimeRange(range)}
            >
              {range === "7d"
                ? "Last 7 Days"
                : range === "30d"
                  ? "Last 30 Days"
                  : range === "90d"
                    ? "Last 90 Days"
                    : "Last Year"}
            </Button>
          ))}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center space-x-2">
                <FileText className="h-4 w-4" />
                <span>Compliance Reports</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">94</div>
              <p className="text-xs text-muted-foreground mt-2">
                <span className="text-green-600">+12%</span> from last period
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center space-x-2">
                <AlertTriangle className="h-4 w-4" />
                <span>Outstanding Findings</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">23</div>
              <p className="text-xs text-muted-foreground mt-2">
                <span className="text-yellow-600">-8%</span> from last period
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center space-x-2">
                <CheckCircle className="h-4 w-4" />
                <span>Data Breaches</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">0</div>
              <p className="text-xs text-muted-foreground mt-2">
                No incidents detected
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center space-x-2">
                <Users className="h-4 w-4" />
                <span>Consent Rate</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">87%</div>
              <p className="text-xs text-muted-foreground mt-2">
                <span className="text-green-600">+3%</span> from last period
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="compliance" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
            <TabsTrigger value="consent">Consent</TabsTrigger>
            <TabsTrigger value="access">Access Control</TabsTrigger>
          </TabsList>

          {/* Compliance Tab */}
          <TabsContent value="compliance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Compliance Report Trends</CardTitle>
                <CardDescription>
                  Monthly compliance reports generated and issues resolved
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={complianceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="reports"
                      stroke="#3b82f6"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="findings"
                      stroke="#f59e0b"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="resolved"
                      stroke="#10b981"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Compliance Frameworks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { name: "GDPR", status: "Compliant", percentage: 95 },
                    { name: "CCPA", status: "Compliant", percentage: 92 },
                    { name: "HIPAA", status: "In Progress", percentage: 78 },
                    { name: "PCI-DSS", status: "Compliant", percentage: 98 },
                  ].map((framework) => (
                    <div key={framework.name} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{framework.name}</span>
                        <Badge
                          variant={
                            framework.status === "Compliant"
                              ? "default"
                              : framework.status === "In Progress"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {framework.status}
                        </Badge>
                      </div>
                      <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${framework.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Privacy Tab */}
          <TabsContent value="privacy" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Data Classification Distribution</CardTitle>
                <CardDescription>
                  Distribution of data across classification levels
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={dataClassification}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {dataClassification.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Privacy Impact Assessments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    {
                      title: "User Data Processing",
                      risk: "High",
                      status: "Approved",
                    },
                    {
                      title: "Third-party Integration",
                      risk: "Medium",
                      status: "In Review",
                    },
                    {
                      title: "Analytics Collection",
                      risk: "Medium",
                      status: "Approved",
                    },
                  ].map((pia) => (
                    <Card key={pia.title} className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{pia.title}</p>
                          <p className="text-sm text-muted-foreground">
                            Risk Level: {pia.risk}
                          </p>
                        </div>
                        <Badge
                          variant={
                            pia.status === "Approved" ? "default" : "secondary"
                          }
                        >
                          {pia.status}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Consent Tab */}
          <TabsContent value="consent" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Consent Management Metrics</CardTitle>
                <CardDescription>
                  User consent status across all consent types
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={consentMetrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="type" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="granted" fill="#10b981" />
                    <Bar dataKey="pending" fill="#f59e0b" />
                    <Bar dataKey="withdrawn" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Access Control Tab */}
          <TabsContent value="access" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Role-Based Access Control</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    {
                      role: "Super Admin",
                      users: 3,
                      dataAccess: "All",
                      auditLog: true,
                    },
                    {
                      role: "Admin",
                      users: 8,
                      dataAccess: "Public + Internal + Confidential",
                      auditLog: true,
                    },
                    {
                      role: "Analyst",
                      users: 15,
                      dataAccess: "Public + Internal",
                      auditLog: false,
                    },
                    {
                      role: "Viewer",
                      users: 42,
                      dataAccess: "Public",
                      auditLog: false,
                    },
                  ].map((access) => (
                    <Card key={access.role} className="p-4">
                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Role</p>
                          <p className="font-medium">{access.role}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Users</p>
                          <p className="font-medium">{access.users}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Data Access
                          </p>
                          <p className="font-medium text-sm">
                            {access.dataAccess}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Audit Log
                          </p>
                          <p className="font-medium">
                            {access.auditLog ? "✓" : "-"}
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Export Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Export Reports</CardTitle>
            <CardDescription>
              Download compliance reports and audit logs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <Button>
                <Download className="h-4 w-4 mr-2" />
                Export GDPR Audit
              </Button>
              <Button>
                <Download className="h-4 w-4 mr-2" />
                Export CCPA Report
              </Button>
              <Button>
                <Download className="h-4 w-4 mr-2" />
                Export Consent Records
              </Button>
              <Button>
                <Download className="h-4 w-4 mr-2" />
                Export Access Logs
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
