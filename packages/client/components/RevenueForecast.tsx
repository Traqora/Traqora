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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from "recharts"
import {
  TrendingUp,
  Calendar,
  BarChart3,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Eye,
  RefreshCw,
  AlertCircle,
} from "lucide-react"

const generateForecastData = (days: number, baseValue = 45000) => {
  return Array.from({ length: days }, (_, i) => ({
    day: `D${i + 1}`,
    actual: i < 7 ? baseValue + Math.sin(i / 5) * 8000 + i * 150 + Math.random() * 2000 : null,
    predicted: baseValue + Math.sin(i / 5) * 8000 + i * 150 + Math.random() * 2000,
    lower: baseValue + Math.sin(i / 5) * 8000 + i * 150 - 5000 - Math.random() * 2000,
    upper: baseValue + Math.sin(i / 5) * 8000 + i * 150 + 5000 + Math.random() * 2000,
  }))
}

const scenarioData = {
  baseCase: 1485000,
  bestCase: 1752300,
  worstCase: 1217700,
  optimisticCase: 1618650,
  pessimisticCase: 1351350,
}

const monthlyComparison = [
  { month: "Jan", actual: 185000, forecast: 182000 },
  { month: "Feb", actual: 210000, forecast: 205000 },
  { month: "Mar", actual: 195000, forecast: 198000 },
  { month: "Apr", actual: 230000, forecast: 225000 },
  { month: "May", actual: 215000, forecast: 220000 },
  { month: "Jun", actual: 245000, forecast: 240000 },
  { month: "Jul", forecast: 255000 },
  { month: "Aug", forecast: 260000 },
  { month: "Sep", forecast: 250000 },
  { month: "Oct", forecast: 265000 },
  { month: "Nov", forecast: 270000 },
  { month: "Dec", forecast: 285000 },
]

// Accuracy metrics
const accuracyData = [
  { date: "Week 1", mape: 4.2, samples: 7 },
  { date: "Week 2", mape: 3.8, samples: 7 },
  { date: "Week 3", mape: 5.1, samples: 7 },
  { date: "Week 4", mape: 3.5, samples: 7 },
]

export function RevenueForecast() {
  const [horizon, setHorizon] = useState<"7d" | "30d" | "90d">("30d")
  const [activeTab, setActiveTab] = useState("forecast")

  const forecastDays = horizon === "7d" ? 7 : horizon === "30d" ? 30 : 90
  const forecastData = generateForecastData(forecastDays)

  const totalForecast = forecastData
    .filter((d) => d.predicted)
    .reduce((sum, d) => sum + d.predicted, 0)

  const avgConfidence = forecastData
    .filter((d) => d.upper && d.lower)
    .reduce((sum, d) => sum + (1 - (d.upper - d.lower) / (2 * d.predicted)), 0) / forecastData.length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif font-bold text-2xl text-foreground">Revenue Forecast</h2>
          <p className="text-muted-foreground">
            Predictive analytics with confidence intervals
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={horizon === "7d" ? "default" : "outline"}
            size="sm"
            onClick={() => setHorizon("7d")}
          >
            7 Days
          </Button>
          <Button
            variant={horizon === "30d" ? "default" : "outline"}
            size="sm"
            onClick={() => setHorizon("30d")}
          >
            30 Days
          </Button>
          <Button
            variant={horizon === "90d" ? "default" : "outline"}
            size="sm"
            onClick={() => setHorizon("90d")}
          >
            90 Days
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Forecast Revenue</p>
                <p className="text-xl font-bold">${totalForecast.toLocaleString()}</p>
              </div>
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Confidence Level</p>
                <p className="text-xl font-bold">{(avgConfidence * 100).toFixed(0)}%</p>
              </div>
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-full">
                <Target className="h-5 w-5 text-green-600" />
              </div>
            </div>
            <Progress value={avgConfidence * 100} className="h-1 mt-1" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Best Case</p>
                <p className="text-xl font-bold text-green-500">${scenarioData.bestCase.toLocaleString()}</p>
              </div>
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-full">
                <ArrowUpRight className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Worst Case</p>
                <p className="text-xl font-bold text-red-500">${scenarioData.worstCase.toLocaleString()}</p>
              </div>
              <div className="p-2 bg-red-100 dark:bg-red-900 rounded-full">
                <ArrowDownRight className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="forecast" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Forecast
          </TabsTrigger>
          <TabsTrigger value="scenarios" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Scenarios
          </TabsTrigger>
          <TabsTrigger value="accuracy" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Accuracy
          </TabsTrigger>
          <TabsTrigger value="comparison" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            vs Actual
          </TabsTrigger>
        </TabsList>

        {/* Forecast Tab */}
        <TabsContent value="forecast" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                {horizon === "7d" ? "7-Day" : horizon === "30d" ? "30-Day" : "90-Day"} Revenue Forecast
              </CardTitle>
              <CardDescription>
                Predicted daily revenue with 95% confidence interval
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={forecastData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={horizon === "7d" ? 0 : horizon === "30d" ? 4 : 10} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value) => [`$${Number(value).toLocaleString()}`, ""]} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="upper"
                    stroke="transparent"
                    fill="#3b82f6"
                    fillOpacity={0.1}
                    name="Upper Bound (95%)"
                  />
                  <Area
                    type="monotone"
                    dataKey="lower"
                    stroke="transparent"
                    fill="#3b82f6"
                    fillOpacity={0.1}
                    name="Lower Bound (95%)"
                  />
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    name="Predicted Revenue"
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="Actual Revenue"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Min Forecast</p>
                <p className="text-lg font-bold text-red-500">
                  ${forecastData.reduce((min, d) => Math.min(min, d.lower), Infinity).toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Average Daily</p>
                <p className="text-lg font-bold">
                  ${(totalForecast / forecastData.length).toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Max Forecast</p>
                <p className="text-lg font-bold text-green-500">
                  ${forecastData.reduce((max, d) => Math.max(max, d.upper), 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Scenarios Tab */}
        <TabsContent value="scenarios" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-orange-500" />
                Scenario Modeling
              </CardTitle>
              <CardDescription>
                Best case, base case, and worst case projections
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-green-700 dark:text-green-300">Best Case</p>
                        <p className="text-xs text-green-600 dark:text-green-400">Optimistic scenario</p>
                      </div>
                      <p className="text-xl font-bold text-green-600">${scenarioData.bestCase.toLocaleString()}</p>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-green-600">
                      <ArrowUpRight className="h-3 w-3" />
                      +18% vs base case
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-blue-700 dark:text-blue-300">Base Case</p>
                        <p className="text-xs text-blue-600 dark:text-blue-400">Most likely scenario</p>
                      </div>
                      <p className="text-xl font-bold text-blue-600">${scenarioData.baseCase.toLocaleString()}</p>
                    </div>
                    <div className="mt-2 text-xs text-blue-600">
                      Confidence: {avgConfidence.toFixed(0)}%
                    </div>
                  </div>

                  <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-red-700 dark:text-red-300">Worst Case</p>
                        <p className="text-xs text-red-600 dark:text-red-400">Pessimistic scenario</p>
                      </div>
                      <p className="text-xl font-bold text-red-600">${scenarioData.worstCase.toLocaleString()}</p>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-red-600">
                      <ArrowDownRight className="h-3 w-3" />
                      -18% vs base case
                    </div>
                  </div>
                </div>

                <div>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={[
                        { name: "Worst Case", value: scenarioData.worstCase, fill: "#ef4444" },
                        { name: "Pessimistic", value: scenarioData.pessimisticCase, fill: "#f97316" },
                        { name: "Base Case", value: scenarioData.baseCase, fill: "#3b82f6" },
                        { name: "Optimistic", value: scenarioData.optimisticCase, fill: "#22c55e" },
                        { name: "Best Case", value: scenarioData.bestCase, fill: "#16a34a" },
                      ]}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" width={100} />
                      <Tooltip formatter={(value) => [`$${Number(value).toLocaleString()}`, ""]} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Accuracy Tab */}
        <TabsContent value="accuracy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                Model Accuracy Metrics
              </CardTitle>
              <CardDescription>
                Forecast accuracy measured by Mean Absolute Percentage Error (MAPE)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Overall MAPE</p>
                    <p className="text-2xl font-bold text-green-500">4.15%</p>
                    <p className="text-xs text-muted-foreground">95.85% accuracy</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">7-Day Forward</p>
                    <p className="text-2xl font-bold text-green-500">3.2%</p>
                    <p className="text-xs text-muted-foreground">96.8% accuracy</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">30-Day Forward</p>
                    <p className="text-2xl font-bold text-yellow-500">5.8%</p>
                    <p className="text-xs text-muted-foreground">94.2% accuracy</p>
                  </CardContent>
                </Card>
              </div>

              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={accuracyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(value) => [`${value}%`, "MAPE"]} />
                  <Bar dataKey="mape" fill="#3b82f6" radius={[4, 4, 0, 0]} name="MAPE (%)" />
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-4 p-3 bg-muted rounded-lg flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Daily retraining active</p>
                  <p className="text-xs text-muted-foreground">
                    Model retrained daily at midnight. Last training: {new Date().toLocaleDateString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Comparison Tab */}
        <TabsContent value="comparison" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Forecast vs Actual Comparison
              </CardTitle>
              <CardDescription>
                Monthly forecast accuracy comparison
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={monthlyComparison}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value) => [`$${Number(value).toLocaleString()}`, ""]} />
                  <Legend />
                  <Bar dataKey="actual" fill="#10b981" radius={[4, 4, 0, 0]} name="Actual" />
                  <Bar dataKey="forecast" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Forecast" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}