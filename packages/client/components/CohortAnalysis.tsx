"use client"

import { useEffect, useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const fallback = { summary: { totalCollaborators: 7, averageLtv: 14342.86, averageChurnRate: 57.5 }, cohorts: [{ cohort: "2024-01", ltv: 17700, churnRate: 50, totalRevenue: 35400 }, { cohort: "2024-02", ltv: 16500, churnRate: 50, totalRevenue: 33000 }], exportRows: [] }

export function CohortAnalysis() {
  const [report, setReport] = useState(fallback)
  useEffect(() => { fetch("/api/analytics/cohorts").then((r) => r.ok ? r.json() : fallback).then(setReport).catch(() => setReport(fallback)) }, [])
  const rows = report.cohorts.map((c: any) => ({ cohort: c.cohort, ltv: c.ltv, churnRate: c.churnRate, revenue: c.totalRevenue }))
  const exportCsv = () => {
    const csv = ["cohort,ltv,churnRate,revenue", ...rows.map((r) => `${r.cohort},${r.ltv},${r.churnRate},${r.revenue}`)].join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "cohort-analysis.csv"
    link.click()
    URL.revokeObjectURL(url)
  }
  return <div className="space-y-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-semibold">Collaborator Cohorts</h2><p className="text-sm text-muted-foreground">Compare retention, revenue, LTV, and churn across join cohorts.</p></div><Button type="button" variant="outline" onClick={exportCsv} className="gap-2"><Download className="h-4 w-4" />Export CSV</Button></div><div className="grid gap-4 md:grid-cols-3"><Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Collaborators</p><p className="text-2xl font-bold">{report.summary.totalCollaborators}</p></CardContent></Card><Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Average LTV</p><p className="text-2xl font-bold">${report.summary.averageLtv.toLocaleString()}</p></CardContent></Card><Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Average Churn</p><p className="text-2xl font-bold">{report.summary.averageChurnRate}%</p></CardContent></Card></div><Card><CardHeader><CardTitle>Cohort LTV and Churn</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={300}><BarChart data={rows}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="cohort" /><YAxis /><Tooltip /><Bar dataKey="ltv" fill="#3b82f6" name="LTV" /><Bar dataKey="churnRate" fill="#f59e0b" name="Churn %" /></BarChart></ResponsiveContainer></CardContent></Card></div>
}