"use client"

import { useState, useEffect } from "react"
import { Building2, Users, Settings, Plus, Trash2, Shield, AlertCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"

interface TenantMember {
  walletAddress: string
  role: "owner" | "admin" | "member" | "viewer"
  addedAt: string
}

interface Tenant {
  id: string
  slug: string
  name: string
  contractId: string | null
  organizationId: string | null
  members: TenantMember[]
  rateLimitRpm: number
  config: Record<string, unknown>
  isActive: boolean
  createdAt: string
}

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-purple-100 text-purple-800",
  admin: "bg-blue-100 text-blue-800",
  member: "bg-green-100 text-green-800",
  viewer: "bg-gray-100 text-gray-800",
}

const adminHeader = () => {
  if (typeof window === "undefined") return {}
  const key = localStorage.getItem("adminApiKey") || localStorage.getItem("authToken")
  if (!key) return {}
  return localStorage.getItem("adminApiKey")
    ? { "X-Admin-Api-Key": key }
    : { Authorization: `Bearer ${key}` }
}

export default function TenantSettingsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // New tenant form
  const [newName, setNewName] = useState("")
  const [newSlug, setNewSlug] = useState("")
  const [newContractId, setNewContractId] = useState("")
  const [newOwnerWallet, setNewOwnerWallet] = useState("")
  const [creating, setCreating] = useState(false)

  // Member form
  const [memberWallet, setMemberWallet] = useState("")
  const [memberRole, setMemberRole] = useState<TenantMember["role"]>("member")
  const [addingMember, setAddingMember] = useState(false)

  // Config form
  const [rateLimitRpm, setRateLimitRpm] = useState("")
  const [savingConfig, setSavingConfig] = useState(false)

  const fetchTenants = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/v1/admin/analytics/tenants", { headers: adminHeader() })
      if (!res.ok) {
        setError("Failed to load tenants. Ensure you are logged in as admin.")
        return
      }
      const json = await res.json()
      const list: Tenant[] = json.data ?? []
      setTenants(list)
      if (list.length > 0 && !selectedTenant) {
        setSelectedTenant(list[0])
        setRateLimitRpm(String(list[0].rateLimitRpm))
      }
    } catch {
      setError("Network error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTenants() }, [])

  const createTenant = async () => {
    if (!newName || !newSlug || !newOwnerWallet) return
    setCreating(true)
    try {
      const res = await fetch("/api/v1/admin/analytics/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeader() },
        body: JSON.stringify({
          name: newName,
          slug: newSlug,
          contractId: newContractId || undefined,
          ownerWallet: newOwnerWallet,
        }),
      })
      if (res.ok) {
        setNewName("")
        setNewSlug("")
        setNewContractId("")
        setNewOwnerWallet("")
        await fetchTenants()
      } else {
        const json = await res.json()
        setError(json.error ?? "Failed to create tenant")
      }
    } finally {
      setCreating(false)
    }
  }

  const addMember = async () => {
    if (!selectedTenant || !memberWallet) return
    setAddingMember(true)
    try {
      const res = await fetch(`/api/v1/admin/analytics/tenants/${selectedTenant.id}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...adminHeader() },
        body: JSON.stringify({ walletAddress: memberWallet, role: memberRole }),
      })
      if (res.ok) {
        setMemberWallet("")
        await fetchTenants()
        const updated = tenants.find((t) => t.id === selectedTenant.id)
        if (updated) setSelectedTenant(updated)
      }
    } finally {
      setAddingMember(false)
    }
  }

  const saveConfig = async () => {
    if (!selectedTenant) return
    setSavingConfig(true)
    try {
      await fetch(`/api/v1/admin/analytics/tenants/${selectedTenant.id}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...adminHeader() },
        body: JSON.stringify({ rateLimitRpm: parseInt(rateLimitRpm, 10) }),
      })
      await fetchTenants()
    } finally {
      setSavingConfig(false)
    }
  }

  const selectTenant = (tenant: Tenant) => {
    setSelectedTenant(tenant)
    setRateLimitRpm(String(tenant.rateLimitRpm))
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="font-serif font-bold text-3xl text-foreground mb-2 flex items-center gap-3">
            <Building2 className="h-8 w-8 text-primary" />
            Tenant Management
          </h1>
          <p className="text-muted-foreground">
            Manage organizations, members, data isolation, and rate limits per tenant.
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 p-4 border border-destructive/50 bg-destructive/10 rounded-lg text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Tenant list sidebar */}
          <div className="lg:col-span-1 space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Tenants</h2>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : (
              tenants.map((tenant) => (
                <button
                  key={tenant.id}
                  onClick={() => selectTenant(tenant)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedTenant?.id === tenant.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="font-medium text-sm text-foreground truncate">{tenant.name}</div>
                  <div className="text-xs text-muted-foreground">{tenant.slug}</div>
                  <div className="flex items-center gap-1 mt-1">
                    <Badge variant={tenant.isActive ? "default" : "secondary"} className="text-xs h-4 px-1">
                      {tenant.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {Array.isArray(tenant.members) ? tenant.members.length : 0} members
                    </span>
                  </div>
                </button>
              ))
            )}

            <Separator />

            {/* Quick create */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New tenant</h3>
              <Input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-8 text-sm" />
              <Input
                placeholder="slug (url-safe)"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                className="h-8 text-sm"
              />
              <Input placeholder="Contract ID (optional)" value={newContractId} onChange={(e) => setNewContractId(e.target.value)} className="h-8 text-sm" />
              <Input placeholder="Owner wallet address" value={newOwnerWallet} onChange={(e) => setNewOwnerWallet(e.target.value)} className="h-8 text-sm" />
              <Button onClick={createTenant} disabled={creating || !newName || !newSlug || !newOwnerWallet} size="sm" className="w-full">
                <Plus className="h-3 w-3 mr-1" />
                {creating ? "Creating…" : "Create tenant"}
              </Button>
            </div>
          </div>

          {/* Tenant detail */}
          <div className="lg:col-span-3">
            {!selectedTenant ? (
              <Card className="flex items-center justify-center h-64">
                <CardContent className="text-center text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>Select a tenant to manage it</p>
                </CardContent>
              </Card>
            ) : (
              <Tabs defaultValue="members">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">{selectedTenant.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {selectedTenant.slug}
                      {selectedTenant.contractId && ` · Contract: ${selectedTenant.contractId}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={selectedTenant.isActive} disabled />
                    <span className="text-sm text-muted-foreground">
                      {selectedTenant.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>

                <TabsList>
                  <TabsTrigger value="members" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Members
                  </TabsTrigger>
                  <TabsTrigger value="config" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Configuration
                  </TabsTrigger>
                  <TabsTrigger value="permissions" className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Permissions
                  </TabsTrigger>
                </TabsList>

                {/* Members tab */}
                <TabsContent value="members" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Team Members</CardTitle>
                      <CardDescription>Manage who has access to this tenant&apos;s analytics data.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Existing members */}
                      <div className="space-y-2">
                        {(Array.isArray(selectedTenant.members) ? selectedTenant.members : []).map((member) => (
                          <div
                            key={member.walletAddress}
                            className="flex items-center justify-between p-3 border rounded-lg"
                          >
                            <div>
                              <p className="text-sm font-mono text-foreground">
                                {member.walletAddress.slice(0, 8)}…{member.walletAddress.slice(-6)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Added {new Date(member.addedAt).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[member.role]}`}>
                                {member.role}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <Separator />

                      {/* Add member */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium">Add member</h4>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Wallet address"
                            value={memberWallet}
                            onChange={(e) => setMemberWallet(e.target.value)}
                            className="flex-1 text-sm"
                          />
                          <Select value={memberRole} onValueChange={(v) => setMemberRole(v as TenantMember["role"])}>
                            <SelectTrigger className="w-32 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="viewer">Viewer</SelectItem>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="owner">Owner</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button onClick={addMember} disabled={addingMember || !memberWallet} size="sm">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Config tab */}
                <TabsContent value="config" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Rate Limits</CardTitle>
                      <CardDescription>Control how many analytics requests this tenant can make per minute.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Requests per minute</Label>
                        <div className="flex gap-2 items-center">
                          <Input
                            type="number"
                            value={rateLimitRpm}
                            onChange={(e) => setRateLimitRpm(e.target.value)}
                            className="w-40 text-sm"
                            min={10}
                            max={10000}
                          />
                          <span className="text-sm text-muted-foreground">req/min</span>
                        </div>
                      </div>
                      <Button onClick={saveConfig} disabled={savingConfig} size="sm">
                        {savingConfig ? "Saving…" : "Save configuration"}
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Tenant Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Tenant ID</Label>
                          <p className="font-mono text-xs mt-0.5">{selectedTenant.id}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Slug</Label>
                          <p className="font-mono text-xs mt-0.5">{selectedTenant.slug}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Contract ID</Label>
                          <p className="font-mono text-xs mt-0.5">{selectedTenant.contractId ?? "—"}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Created</Label>
                          <p className="text-xs mt-0.5">
                            {new Date(selectedTenant.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Permissions tab */}
                <TabsContent value="permissions" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Role Permissions</CardTitle>
                      <CardDescription>What each role can do within this tenant.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {[
                          { role: "owner", perms: ["All admin actions", "Transfer ownership", "Delete tenant"] },
                          { role: "admin", perms: ["Manage members", "View all analytics", "Configure tenant", "Share dashboards"] },
                          { role: "member", perms: ["View scoped analytics", "Comment on dashboards", "Share dashboards"] },
                          { role: "viewer", perms: ["View scoped analytics only"] },
                        ].map(({ role, perms }) => (
                          <div key={role} className="flex gap-4">
                            <div className="w-24 shrink-0">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[role]}`}>
                                {role}
                              </span>
                            </div>
                            <ul className="space-y-1">
                              {perms.map((p) => (
                                <li key={p} className="text-sm text-muted-foreground flex items-center gap-2">
                                  <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                                  {p}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
