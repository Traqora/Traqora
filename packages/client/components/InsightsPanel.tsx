"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from "recharts"
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Users,
  Target,
  DollarSign,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  RefreshCw,
  Activity,
} from "lucide-react"

// Mock revenue prediction data
const mockRevenuePrediction = Array.from({ length: 30 }, (_, i) => ({
  day: `Day ${i + 1}`,
  predicted: 45000 + Math.sin(i / 5) * 8000 + i * 200 + Math.random() * 3000,
  lower: 45000 + Math.sin(i / 5) * 8000 + i * 200 - 4000 - Math.random() * 2000,
  upper: 45000 + Math.sin(i / 5) * 8000 + i * 200 + 4000 + Math.random() * 2000,
  actual: i < 7 ? 46000 + Math.sin(i / 5) * 8000 + i * 200 + Math.random() * 3000 : null,
}))

// Mock churn risk data
const mockChurnData = [
  { segment: "New Users", risk: 0.35, users: 8450 },
  { segment: "Occasional", risk: 0.52, users: 6230 },
  { segment: "Regular", risk: 0.18, users: 12110 },
  { segment: "Loyal", risk: 0.08, users: 10441 },
  { segment: "At-Risk", risk: 0.78, users: 3450 },
]

// Mock anomaly data
const mockAnomalies = [
  { date: "2024-06-10", value: 52000, expected: 45000, severity: "high" },
  { date: "2024-06-15", value: 38000, expected: 46000, severity: "medium" },
  { date: "2024-06-22", value: 58000, expected: 47000, severity: "high" },
]

// Mock recommendations
const mockRecommendations = [
  { action: "Increase marketing to users inactive >60 days", impact: "high", metric: "+15% retention" },
  { action: "Optimize pricing for LAX -> LHR route", impact: "medium", metric: "+8% revenue" },
  { action: "Target loyalty program at churning users", impact: "high", metric: "+22% engagement" },
  { action: "Add weekend flash sales for low-demand routes", impact: "medium", metric: "+12% bookings" },
  { action: "Implement referral program for top 10% users", impact: "low", metric: "+5% new users" },
]

export function InsightsPanel() {
  const [activeTab, setActiveTab] = useState("predictions")
  const [isTraining, setIsTraining] = useState(false)

  const trainModels = () => {
    setIsTraining(true)
    setTimeout(() => setIsTraining(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif font-bold text-2xl text-foreground">ML Insights</h2>
          <p className="text-muted-foreground">
            AI-powered predictions and recommendations
          </p>
        </div>
        <Button onClick={trainModels} disabled={isTraining}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isTraining ? "animate-spin" : ""}`} />
          {isTraining ? "Training..." : "Retrain Models"}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="predictions" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Revenue Prediction
          </TabsTrigger>
          <TabsTrigger value="churn" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Churn Risk
          </TabsTrigger>
          <TabsTrigger value="anomalies" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Anomalies
          </TabsTrigger>
          <TabsTrigger value="recommendations" className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            Recommendations
          </TabsTrigger>
        </TabsList>

        {/* Revenue Prediction Tab */}
        <TabsContent value="predictions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-500" />
                30-Day Revenue Forecast
              </CardTitle>
              <CardDescription>
                Predicted revenue with 95% confidence intervals
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={mockRevenuePrediction}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={5} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value) => [`$${Number(value).toLocaleString()}`, ""]} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="upper"
                    stroke="transparent"
                    fill="#3b82f6"
                    fillOpacity={0.1}
                    name="Upper Bound"
                  />
                  <Area
                    type="monotone"
                    dataKey="lower"
                    stroke="transparent"
                    fill="#3b82f6"
                    fillOpacity={0.1}
                    name="Lower Bound"
                  />
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    name="Predicted"
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name="Actual"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">7-Day Forecast</p>
                    <p className="text-xl font-bold">$342,500</p>
                  </div>
                  <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
                    <DollarSign className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <ArrowUpRight className="h-3 w-3" /> +2.3% vs last week
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">30-Day Forecast</p>
                    <p className="text-xl font-bold">$1,485,000</p>
                  </div>
                  <div className="p-2 bg-green-100 dark:bg-green-900 rounded-full">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  </div>
                </div>
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <ArrowUpRight className="h-3 w-3" /> +5.8% vs last month
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Confidence</p>
                    <p className="text-xl font-bold">92%</p>
                  </div>
                  <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-full">
                    <Target className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
                <Progress value={92} className="h-1 mt-1" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Churn Risk Tab */}
        <TabsContent value="churn" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2">
                <Shield className="h-5 w-5 text-orange-500" />
                Churn Risk by Segment
              </CardTitle>
              <CardDescription>
                Identify user segments at risk of churning
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={mockChurnData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                  <YAxis type="category" dataKey="segment" width={120} />
                  <Tooltip formatter={(value) => [`${(Number(value) * 100).toFixed(0)}%`, "Risk Score"]} />
                  <Bar dataKey="risk" fill="#f97316" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-sm">High Risk Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 bg-red-50 dark:bg-red-950 rounded">
                    <div>
                      <p className="font-medium">user_78432</p>
                      <p className="text-xs text-muted-foreground">45 days since last booking</p>
                    </div>
                    <Badge variant="destructive">85% risk</Badge>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-red-50 dark:bg-red-950 rounded">
                    <div>
                      <p className="font-medium">user_23156</p>
                      <p className="text-xs text-muted-foreground">3 refunds in 30 days</p>
                    </div>
                    <Badge variant="destructive">78% risk</Badge>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-orange-50 dark:bg-orange-950 rounded">
                    <div>
                      <p className="font-medium">user_90234</p>
                      <p className="text-xs text-muted-foreground">Low engagement</p>
                    </div>
                    <Badge variant="secondary">62% risk</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-sm">Retention Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-2 bg-muted rounded">
                    <Sparkles className="h-4 w-4 text-yellow-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Send personalized offer</p>
                      <p className="text-xs text-muted-foreground">Target users inactive 60+ days with 20% discount</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-2 bg-muted rounded">
                    <Sparkles className="h-4 w-4 text-yellow-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Loyalty points bonus</p>
                      <p className="text-xs text-muted-foreground">Double points for returning users</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Anomalies Tab */}
        <TabsContent value="anomalies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Detected Anomalies
              </CardTitle>
              <CardDescription>
                Statistical outliers in revenue and booking data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockAnomalies.map((anomaly, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${
                        anomaly.severity === "high" ? "bg-red-100 dark:bg-red-900" : "bg-yellow-100 dark:bg-yellow-900"
                      }`}>
                        <AlertTriangle className={`h-5 w-5 ${
                          anomaly.severity === "high" ? "text-red-600" : "text-yellow-600"
                        }`} />
                      </div>
                      <div>
                        <p className="font-medium">{anomaly.date}</p>
                        <p className="text-sm text-muted-foreground">
                          Expected: ${anomaly.expected.toLocaleString()} → Actual: ${anomaly.value.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant={anomaly.severity === "high" ? "destructive" : "secondary"}>
                      {anomaly.severity.toUpperCase()}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                Smart Recommendations
              </CardTitle>
              <CardDescription>
                AI-generated actionable insights
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockRecommendations.map((rec, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-full ${
                        rec.impact === "high" ? "bg-green-100 dark:bg-green-900" :
                        rec.impact === "medium" ? "bg-yellow-100 dark:bg-yellow-900" :
                        "bg-gray-100 dark:bg-gray-800"
                      }`}>
                        <Activity className={`h-4 w-4 ${
                          rec.impact === "high" ? "text-green-600" :
                          rec.impact === "medium" ? "text-yellow-600" :
                          "text-gray-600"
                        }`} />
                      </div>
                      <div>
                        <p className="font-medium">{rec.action}</p>
                        <p className="text-sm text-muted-foreground">Expected: {rec.metric}</p>
                      </div>
                    </div>
                    <Badge variant={
                      rec.impact === "high" ? "default" :
                      rec.impact === "medium" ? "secondary" :
                      "outline"
                    }>
                      {rec.impact}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}