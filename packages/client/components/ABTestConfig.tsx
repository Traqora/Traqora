"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import {
  FlaskConical,
  Play,
  Pause,
  Square,
  Users,
  TrendingUp,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Activity,
} from "lucide-react"

interface Variant {
  id: string
  name: string
  weight: number
  description: string
}

interface Experiment {
  id: string
  name: string
  description: string
  status: "draft" | "running" | "paused" | "terminated"
  variants: Variant[]
  trafficAllocation: number
  totalAssignments: number
  startDate: string | null
  endDate: string | null
  metrics: string[]
}

const mockExperiments: Experiment[] = [
  {
    id: "exp-001",
    name: "Checkout Button Color",
    description: "Testing red vs blue checkout button conversion rates",
    status: "running",
    variants: [
      { id: "control", name: "Control (Blue)", weight: 1, description: "Current blue checkout button" },
      { id: "variant-a", name: "Variant A (Red)", weight: 1, description: "Red checkout button" },
    ],
    trafficAllocation: 50,
    totalAssignments: 12453,
    startDate: "2024-06-01",
    endDate: null,
    metrics: ["conversion_rate", "click_through", "revenue_per_user"],
  },
  {
    id: "exp-002",
    name: "Pricing Display",
    description: "Compare pricing display formats",
    status: "draft",
    variants: [
      { id: "control", name: "Control (Total)", weight: 1, description: "Show total price" },
      { id: "variant-a", name: "Variant A (Per Night)", weight: 1, description: "Show per-night price" },
    ],
    trafficAllocation: 25,
    totalAssignments: 0,
    startDate: null,
    endDate: null,
    metrics: ["conversion_rate"],
  },
  {
    id: "exp-003",
    name: "Search Results Layout",
    description: "Grid vs list layout for search results",
    status: "terminated",
    variants: [
      { id: "control", name: "Control (List)", weight: 1, description: "List view" },
      { id: "variant-a", name: "Variant A (Grid)", weight: 1, description: "Grid view with cards" },
    ],
    trafficAllocation: 75,
    totalAssignments: 45231,
    startDate: "2024-03-01",
    endDate: "2024-05-15",
    metrics: ["conversion_rate", "time_on_page", "click_depth"],
  },
]

const mockResults = {
  "exp-001": {
    variants: [
      {
        variantId: "control",
        variantName: "Control (Blue)",
        metrics: {
          conversion_rate: { count: 6234, mean: 3.42, stdDev: 0.15 },
          revenue_per_user: { count: 6234, mean: 28.50, stdDev: 5.20 },
        },
      },
      {
        variantId: "variant-a",
        variantName: "Variant A (Red)",
        metrics: {
          conversion_rate: { count: 6219, mean: 4.18, stdDev: 0.18 },
          revenue_per_user: { count: 6219, mean: 32.15, stdDev: 4.80 },
        },
      },
    ],
    significance: [
      {
        variantId: "variant-a",
        variantName: "Variant A (Red)",
        metric: "conversion_rate",
        controlMean: 3.42,
        variantMean: 4.18,
        lift: 22.22,
        pValue: 0.0032,
        significant: true,
        confidenceInterval: { lower: 0.45, upper: 1.07 },
      },
    ],
  },
}

export function ABTestConfig() {
  const [experiments] = useState<Experiment[]>(mockExperiments)
  const [selectedExp, setSelectedExp] = useState<string>("exp-001")
  const [showCreateForm, setShowCreateForm] = useState(false)

  const selectedExperiment = experiments.find((e) => e.id === selectedExp)
  const results = mockResults[selectedExp as keyof typeof mockResults]

  const statusColors = {
    draft: "bg-gray-500",
    running: "bg-green-500",
    paused: "bg-yellow-500",
    terminated: "bg-red-500",
  }

  const chartData = results?.variants.map((v) => ({
    name: v.variantName,
    "Conversion Rate (%)": v.metrics.conversion_rate.mean,
    "Revenue/User ($)": v.metrics.revenue_per_user.mean,
  })) || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif font-bold text-2xl text-foreground">A/B Testing</h2>
          <p className="text-muted-foreground">
            Create and manage controlled experiments
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          <Plus className="h-4 w-4 mr-2" />
          New Experiment
        </Button>
      </div>

      {/* Create Experiment Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <FlaskConical className="h-5 w-5" />
              Create Experiment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="exp-name">Experiment Name</Label>
                <Input id="exp-name" placeholder="e.g., Pricing Display Test" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp-traffic">Traffic Allocation (%)</Label>
                <Input id="exp-traffic" type="number" placeholder="50" min={0} max={100} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="exp-desc">Description</Label>
                <Input id="exp-desc" placeholder="Describe what you're testing..." />
              </div>
            </div>

            <div className="mt-4">
              <h4 className="font-medium mb-2">Variants</h4>
              <div className="space-y-2">
                <div className="flex gap-2 items-start">
                  <div className="flex-1 space-y-2">
                    <Input placeholder="Variant name" defaultValue="Control" />
                    <Input placeholder="Description (optional)" defaultValue="Current version" />
                  </div>
                  <div className="w-20 space-y-2">
                    <Label>Weight</Label>
                    <Input type="number" defaultValue={1} min={1} />
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <div className="flex-1 space-y-2">
                    <Input placeholder="Variant name" defaultValue="Variant A" />
                    <Input placeholder="Description (optional)" defaultValue="New version" />
                  </div>
                  <div className="w-20 space-y-2">
                    <Label>Weight</Label>
                    <Input type="number" defaultValue={1} min={1} />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Variant
              </Button>
            </div>

            <div className="mt-6 flex gap-2">
              <Button>Create & Start Experiment</Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Experiment List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-3">
          <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
            Experiments
          </h3>
          {experiments.map((exp) => (
            <Card
              key={exp.id}
              className={`cursor-pointer transition-colors ${selectedExp === exp.id ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSelectedExp(exp.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{exp.name}</span>
                  <Badge variant="outline" className={statusColors[exp.status] + " text-white"}>
                    {exp.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{exp.description}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {exp.totalAssignments.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    {exp.trafficAllocation}% traffic
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Experiment Details */}
        <div className="lg:col-span-2 space-y-4">
          {selectedExperiment && (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="font-serif flex items-center gap-2">
                        <FlaskConical className="h-5 w-5" />
                        {selectedExperiment.name}
                      </CardTitle>
                      <CardDescription>{selectedExperiment.description}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {selectedExperiment.status === "draft" && (
                        <Button size="sm">
                          <Play className="h-4 w-4 mr-1" /> Start
                        </Button>
                      )}
                      {selectedExperiment.status === "running" && (
                        <>
                          <Button size="sm" variant="outline">
                            <Pause className="h-4 w-4 mr-1" /> Pause
                          </Button>
                          <Button size="sm" variant="destructive">
                            <Square className="h-4 w-4 mr-1" /> Stop
                          </Button>
                        </>
                      )}
                      {selectedExperiment.status === "paused" && (
                        <Button size="sm">
                          <Play className="h-4 w-4 mr-1" /> Resume
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Status</p>
                      <Badge variant="outline" className={statusColors[selectedExperiment.status] + " text-white mt-1"}>
                        {selectedExperiment.status}
                      </Badge>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Assignments</p>
                      <p className="text-xl font-bold">{selectedExperiment.totalAssignments.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Traffic</p>
                      <p className="text-xl font-bold">{selectedExperiment.trafficAllocation}%</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Variants</p>
                      <p className="text-xl font-bold">{selectedExperiment.variants.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Variants & Results */}
              <Tabs defaultValue="variants">
                <TabsList>
                  <TabsTrigger value="variants">Variants</TabsTrigger>
                  <TabsTrigger value="results">Results</TabsTrigger>
                  <TabsTrigger value="metrics">Metrics</TabsTrigger>
                </TabsList>

                <TabsContent value="variants" className="space-y-3">
                  {selectedExperiment.variants.map((v) => (
                    <Card key={v.id}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="font-medium">{v.name}</p>
                          <p className="text-sm text-muted-foreground">{v.description}</p>
                        </div>
                        <Badge variant="secondary">Weight: {v.weight}</Badge>
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>

                <TabsContent value="results" className="space-y-4">
                  {results ? (
                    <>
                      <Card>
                        <CardHeader>
                          <CardTitle className="font-serif flex items-center gap-2">
                            <TrendingUp className="h-5 w-5" />
                            Performance Comparison
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis />
                              <Tooltip />
                              <Legend />
                              <Bar dataKey="Conversion Rate (%)" fill="#3b82f6" />
                              <Bar dataKey="Revenue/User ($)" fill="#10b981" />
                            </BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>

                      {/* Statistical Significance */}
                      {results.significance.map((sig) => (
                        <Card key={sig.variantId}>
                          <CardHeader>
                            <CardTitle className="font-serif flex items-center gap-2">
                              {sig.significant ? (
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                              ) : (
                                <XCircle className="h-5 w-5 text-red-500" />
                              )}
                              {sig.variantName}: {sig.significant ? "Significant" : "Not Significant"}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="p-3 bg-muted rounded-lg">
                                <p className="text-xs text-muted-foreground">Lift</p>
                                <p className={`text-lg font-bold ${sig.lift > 0 ? "text-green-500" : "text-red-500"}`}>
                                  {sig.lift > 0 ? "+" : ""}{sig.lift}%
                                </p>
                              </div>
                              <div className="p-3 bg-muted rounded-lg">
                                <p className="text-xs text-muted-foreground">p-value</p>
                                <p className="text-lg font-bold">{sig.pValue}</p>
                              </div>
                              <div className="p-3 bg-muted rounded-lg">
                                <p className="text-xs text-muted-foreground">Control Mean</p>
                                <p className="text-lg font-bold">{sig.controlMean}%</p>
                              </div>
                              <div className="p-3 bg-muted rounded-lg">
                                <p className="text-xs text-muted-foreground">Variant Mean</p>
                                <p className="text-lg font-bold">{sig.variantMean}%</p>
                              </div>
                            </div>
                            <div className="mt-4">
                              <p className="text-sm text-muted-foreground">
                                Confidence Interval (95%):
                                [{sig.confidenceInterval.lower.toFixed(2)}, {sig.confidenceInterval.upper.toFixed(2)}]
                              </p>
                              <p className="text-sm mt-1">
                                {sig.significant
                                  ? "The result is statistically significant. Strong evidence that the variant outperforms the control."
                                  : "The result is not statistically significant. Continue collecting data or consider ending the experiment."}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                      <p>No results yet. Start the experiment to collect data.</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="metrics" className="space-y-3">
                  <Card>
                    <CardHeader>
                      <CardTitle className="font-serif flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Tracked Metrics
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {selectedExperiment.metrics.map((metric) => (
                          <div key={metric} className="flex items-center gap-2 p-2 bg-muted rounded">
                            <Activity className="h-4 w-4 text-primary" />
                            <span className="capitalize">{metric.replace(/_/g, " ")}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </div>
  )
}