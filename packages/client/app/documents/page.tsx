"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Plane,
  Shield,
  Plus,
  FileText,
  Trash2,
  Pencil,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
  ArrowLeft,
  Lock,
} from "lucide-react"
import { useAuthStore } from "@/lib/auth-store"
import { NavWalletButton } from "@/components/nav-wallet-button"

// ─── Types ────────────────────────────────────────────────────────────────

type DocumentType =
  | "passport"
  | "national_id"
  | "drivers_license"
  | "visa"
  | "residence_permit"
  | "other"

type VerificationStatus = "unverified" | "pending" | "verified" | "rejected" | "expired"

interface DocumentSummary {
  id: string
  documentType: DocumentType
  maskedDocumentNumber: string
  fullName: string
  issuingCountry: string
  expiryDate: string
  issueDate?: string | null
  verificationStatus: VerificationStatus
  isPrimary: boolean
  isExpired: boolean
  isExpiringSoon: boolean
  createdAt: string
  updatedAt: string
}

interface DocumentDetail extends Omit<DocumentSummary, "maskedDocumentNumber"> {
  documentNumber: string
  nationality?: string | null
  dateOfBirth?: string | null
}

interface DocumentFormData {
  documentType: DocumentType | ""
  documentNumber: string
  fullName: string
  issuingCountry: string
  nationality: string
  dateOfBirth: string
  expiryDate: string
  issueDate: string
  isPrimary: boolean
}

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  passport: "Passport",
  national_id: "National ID",
  drivers_license: "Driver's License",
  visa: "Visa",
  residence_permit: "Residence Permit",
  other: "Other",
}

const EMPTY_FORM: DocumentFormData = {
  documentType: "",
  documentNumber: "",
  fullName: "",
  issuingCountry: "",
  nationality: "",
  dateOfBirth: "",
  expiryDate: "",
  issueDate: "",
  isPrimary: false,
}

// ─── API helpers ──────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

async function apiFetch<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.error?.message || `Request failed (${res.status})`)
  }
  return json.data as T
}

// ─── Status helpers ───────────────────────────────────────────────────────

function VerificationBadge({ status }: { status: VerificationStatus }) {
  const map: Record<VerificationStatus, { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    verified: { label: "Verified", icon: <CheckCircle className="h-3 w-3 mr-1" />, variant: "default" },
    pending: { label: "Pending", icon: <Clock className="h-3 w-3 mr-1" />, variant: "secondary" },
    unverified: { label: "Unverified", icon: <AlertCircle className="h-3 w-3 mr-1" />, variant: "outline" },
    rejected: { label: "Rejected", icon: <XCircle className="h-3 w-3 mr-1" />, variant: "destructive" },
    expired: { label: "Expired", icon: <XCircle className="h-3 w-3 mr-1" />, variant: "destructive" },
  }
  const { label, icon, variant } = map[status]
  return (
    <Badge variant={variant} className="flex items-center text-xs">
      {icon}
      {label}
    </Badge>
  )
}

// ─── Page component ───────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { accessToken, isAuthenticated } = useAuthStore()

  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDoc, setEditDoc] = useState<DocumentDetail | null>(null)
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null)
  const [formData, setFormData] = useState<DocumentFormData>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // ── Fetch documents ──────────────────────────────────────────────────────

  const fetchDocuments = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<DocumentSummary[]>("/documents", accessToken)
      setDocuments(data)
    } catch (err: any) {
      setError(err.message || "Failed to load documents")
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  // ── Open edit dialog ─────────────────────────────────────────────────────

  const openEditDialog = async (summary: DocumentSummary) => {
    if (!accessToken) return
    try {
      const detail = await apiFetch<DocumentDetail>(`/documents/${summary.id}`, accessToken)
      setEditDoc(detail)
      setFormData({
        documentType: detail.documentType,
        documentNumber: detail.documentNumber,
        fullName: detail.fullName,
        issuingCountry: detail.issuingCountry,
        nationality: detail.nationality ?? "",
        dateOfBirth: detail.dateOfBirth ?? "",
        expiryDate: detail.expiryDate,
        issueDate: detail.issueDate ?? "",
        isPrimary: detail.isPrimary,
      })
      setFormError(null)
    } catch (err: any) {
      setError(err.message || "Failed to load document details")
    }
  }

  const openAddDialog = () => {
    setFormData(EMPTY_FORM)
    setFormError(null)
    setAddDialogOpen(true)
  }

  // ── Submit form ──────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!accessToken) return
    if (!formData.documentType) {
      setFormError("Please select a document type")
      return
    }
    if (!formData.documentNumber.trim()) {
      setFormError("Document number is required")
      return
    }
    if (!formData.fullName.trim()) {
      setFormError("Full name is required")
      return
    }
    if (!formData.issuingCountry.trim()) {
      setFormError("Issuing country is required")
      return
    }
    if (!formData.expiryDate) {
      setFormError("Expiry date is required")
      return
    }

    setSubmitting(true)
    setFormError(null)

    const payload = {
      documentType: formData.documentType,
      documentNumber: formData.documentNumber.trim(),
      fullName: formData.fullName.trim(),
      issuingCountry: formData.issuingCountry.trim(),
      ...(formData.nationality && { nationality: formData.nationality.trim() }),
      ...(formData.dateOfBirth && { dateOfBirth: formData.dateOfBirth }),
      expiryDate: formData.expiryDate,
      ...(formData.issueDate && { issueDate: formData.issueDate }),
      isPrimary: formData.isPrimary,
    }

    try {
      if (editDoc) {
        await apiFetch(`/documents/${editDoc.id}`, accessToken, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
        setEditDoc(null)
      } else {
        await apiFetch("/documents", accessToken, {
          method: "POST",
          body: JSON.stringify(payload),
        })
        setAddDialogOpen(false)
      }
      await fetchDocuments()
    } catch (err: any) {
      setFormError(err.message || "An error occurred")
    } finally {
      setSubmitting(false)
    }
  }

  // ── Delete document ──────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!accessToken || !deleteDocId) return
    try {
      await apiFetch(`/documents/${deleteDocId}`, accessToken, { method: "DELETE" })
      setDeleteDocId(null)
      await fetchDocuments()
    } catch (err: any) {
      setError(err.message || "Failed to delete document")
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Plane className="h-8 w-8 text-primary" />
              <span className="font-serif font-bold text-2xl text-foreground">Traqora</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
                Home
              </Link>
              <Link href="/search" className="text-muted-foreground hover:text-foreground transition-colors">
                Search Flights
              </Link>
              <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
                Dashboard
              </Link>
              <Badge variant="secondary" className="px-3 py-1">
                <FileText className="h-4 w-4 mr-2 text-primary" />
                Documents
              </Badge>
              <NavWalletButton />
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="font-serif font-bold text-3xl text-foreground mb-2">
              Travel Documents
            </h1>
            <p className="text-muted-foreground flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              Documents are encrypted at rest with AES-256-GCM
            </p>
          </div>
          {isAuthenticated && (
            <Button onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Document
            </Button>
          )}
        </div>

        {/* Privacy notice */}
        <Alert className="mb-6 border-primary/20 bg-primary/5">
          <Shield className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            Your document data is encrypted with AES-256-GCM before storage. Only you can access
            the full document details. We never share your data with third parties without your
            explicit consent, in compliance with GDPR and applicable privacy regulations.
          </AlertDescription>
        </Alert>

        {/* Not authenticated */}
        {!isAuthenticated && (
          <Card>
            <CardContent className="p-12 text-center">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                Please sign in with your wallet to manage travel documents.
              </p>
              <Link href="/auth">
                <Button>Sign In</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Error state */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Loading state */}
        {isAuthenticated && loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6 space-y-3">
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty state */}
        {isAuthenticated && !loading && documents.length === 0 && !error && (
          <Card>
            <CardContent className="p-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-foreground font-medium mb-2">No travel documents yet</p>
              <p className="text-muted-foreground mb-6">
                Add your passport, national ID, or other travel documents to speed up bookings.
              </p>
              <Button onClick={openAddDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Document
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Document cards */}
        {isAuthenticated && !loading && documents.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {documents.map((doc) => (
              <Card
                key={doc.id}
                className={`relative transition-shadow hover:shadow-md ${
                  doc.isExpired ? "border-destructive/40" : doc.isExpiringSoon ? "border-amber-400/60" : ""
                }`}
              >
                {doc.isPrimary && (
                  <div className="absolute top-3 right-3">
                    <Badge variant="default" className="text-xs">Primary</Badge>
                  </div>
                )}
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-serif">
                          {DOCUMENT_TYPE_LABELS[doc.documentType]}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">
                          {doc.maskedDocumentNumber}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{doc.fullName}</p>
                    <p className="text-xs text-muted-foreground">{doc.issuingCountry}</p>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Expires</span>
                    <span
                      className={
                        doc.isExpired
                          ? "text-destructive font-medium"
                          : doc.isExpiringSoon
                          ? "text-amber-600 font-medium"
                          : "text-foreground"
                      }
                    >
                      {doc.expiryDate}
                      {doc.isExpired && " (expired)"}
                      {!doc.isExpired && doc.isExpiringSoon && " (soon)"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <VerificationBadge status={doc.isExpired ? "expired" : doc.verificationStatus} />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openEditDialog(doc)}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteDocId(doc.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Add / Edit dialog ───────────────────────────────────────────── */}
      <Dialog
        open={addDialogOpen || editDoc !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAddDialogOpen(false)
            setEditDoc(null)
            setFormError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {editDoc ? "Edit Document" : "Add Travel Document"}
            </DialogTitle>
            <DialogDescription>
              {editDoc
                ? "Update your travel document details. Changing document details will reset verification status."
                : "Enter your document details. All sensitive information is encrypted before storage."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Document type */}
            <div className="space-y-1.5">
              <Label htmlFor="documentType">Document Type *</Label>
              <Select
                value={formData.documentType}
                onValueChange={(v) =>
                  setFormData((f) => ({ ...f, documentType: v as DocumentType }))
                }
              >
                <SelectTrigger id="documentType">
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Document number */}
            <div className="space-y-1.5">
              <Label htmlFor="documentNumber">Document Number *</Label>
              <Input
                id="documentNumber"
                placeholder="e.g. AB1234567"
                value={formData.documentNumber}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, documentNumber: e.target.value }))
                }
              />
            </div>

            {/* Full name */}
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full Name (as on document) *</Label>
              <Input
                id="fullName"
                placeholder="e.g. JOHN MICHAEL DOE"
                value={formData.fullName}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, fullName: e.target.value }))
                }
              />
            </div>

            {/* Issuing country */}
            <div className="space-y-1.5">
              <Label htmlFor="issuingCountry">Issuing Country *</Label>
              <Input
                id="issuingCountry"
                placeholder="e.g. United States"
                value={formData.issuingCountry}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, issuingCountry: e.target.value }))
                }
              />
            </div>

            {/* Nationality (optional) */}
            <div className="space-y-1.5">
              <Label htmlFor="nationality">Nationality</Label>
              <Input
                id="nationality"
                placeholder="e.g. American"
                value={formData.nationality}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, nationality: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Date of birth */}
              <div className="space-y-1.5">
                <Label htmlFor="dateOfBirth">Date of Birth</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, dateOfBirth: e.target.value }))
                  }
                />
              </div>

              {/* Issue date */}
              <div className="space-y-1.5">
                <Label htmlFor="issueDate">Issue Date</Label>
                <Input
                  id="issueDate"
                  type="date"
                  value={formData.issueDate}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, issueDate: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Expiry date */}
            <div className="space-y-1.5">
              <Label htmlFor="expiryDate">Expiry Date *</Label>
              <Input
                id="expiryDate"
                type="date"
                value={formData.expiryDate}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, expiryDate: e.target.value }))
                }
              />
            </div>

            {/* Primary toggle */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <input
                id="isPrimary"
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={formData.isPrimary}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, isPrimary: e.target.checked }))
                }
              />
              <Label htmlFor="isPrimary" className="cursor-pointer">
                Set as primary travel document
              </Label>
            </div>

            {formError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddDialogOpen(false)
                setEditDoc(null)
                setFormError(null)
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting
                ? editDoc
                  ? "Saving..."
                  : "Adding..."
                : editDoc
                ? "Save Changes"
                : "Add Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ─────────────────────────────────────────── */}
      <AlertDialog
        open={deleteDocId !== null}
        onOpenChange={(open) => { if (!open) setDeleteDocId(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Travel Document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this document from your profile. This action cannot be
              undone. The encrypted data will be scheduled for secure deletion per our privacy
              policy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Document
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
