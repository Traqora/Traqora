"use client"

import { useState, useCallback, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AlertCircle, CheckCircle, Info, X, Edit3 } from "lucide-react"
import { cn } from "@/lib/utils"

const VALID_TITLES = ["Mr", "Mrs", "Ms", "Miss", "Dr", "Prof", "Sir", "Lady", "Lord", "Capt", "Col", "Maj"]
const VALID_SUFFIXES = ["Jr", "Sr", "II", "III", "IV", "V", "PhD", "MD", "Esq", "CPA", "DDS", "RN"]
const CORRECTION_REASONS = [
  { value: "typo_in_first_name", label: "Typo in first name" },
  { value: "typo_in_last_name", label: "Typo in last name" },
  { value: "missing_middle_name", label: "Missing middle name" },
  { value: "incorrect_spelling", label: "Incorrect spelling" },
  { value: "name_format_change", label: "Name format change" },
  { value: "marriage_name_change", label: "Marriage name change" },
  { value: "legal_name_change", label: "Legal name change" },
  { value: "passport_name_mismatch", label: "Passport name mismatch" },
  { value: "title_correction", label: "Title correction" },
  { value: "suffix_correction", label: "Suffix correction" },
  { value: "other", label: "Other" },
]

const NATIONALITIES = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "IT", label: "Italy" },
  { code: "ES", label: "Spain" },
  { code: "NL", label: "Netherlands" },
  { code: "BR", label: "Brazil" },
  { code: "JP", label: "Japan" },
  { code: "CN", label: "China" },
  { code: "IN", label: "India" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "SG", label: "Singapore" },
  { code: "HK", label: "Hong Kong" },
]

export interface PassengerData {
  id?: string
  title?: string
  firstName: string
  middleName?: string
  lastName: string
  suffix?: string
  email: string
  phone?: string
  dateOfBirth?: string
  nationality?: string
  sorobanAddress?: string
}

export interface PassengerFormErrors {
  firstName?: string
  lastName?: string
  email?: string
  dateOfBirth?: string
}

interface PassengerDetailsFormProps {
  passenger: PassengerData
  index: number
  onChange: (index: number, data: PassengerData) => void
  onRemove?: (index: number) => void
  showRemove?: boolean
  errors?: PassengerFormErrors
  airline?: string
}

function validateName(name: string, fieldName: string): string | undefined {
  if (!name || name.trim().length === 0) {
    return `${fieldName} is required`
  }
  if (name.length > 50) {
    return `${fieldName} must be 50 characters or less`
  }
  if (!/^[A-Za-z][A-Za-z\s\.\-\']{0,49}$/.test(name)) {
    return `${fieldName} contains invalid characters`
  }
  return undefined
}

function validateEmail(email: string): string | undefined {
  if (!email) return "Email is required"
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Invalid email format"
  return undefined
}

function validateDateOfBirth(dob: string): string | undefined {
  if (!dob) return undefined
  const date = new Date(dob)
  if (isNaN(date.getTime())) return "Invalid date"
  if (date > new Date()) return "Date of birth cannot be in the future"
  return undefined
}

export function PassengerDetailsForm({ passenger, index, onChange, onRemove, showRemove, errors, airline }: PassengerDetailsFormProps) {
  const [showCorrectionDialog, setShowCorrectionDialog] = useState(false)
  const [correctionReason, setCorrectionReason] = useState("")
  const [correctionFee, setCorrectionFee] = useState<{ feeCents: number; breakdown: { label: string; amount: number }[] } | null>(null)

  const localErrors = errors || {}

  const handleChange = useCallback((field: keyof PassengerData, value: string) => {
    onChange(index, { ...passenger, [field]: value })
  }, [index, passenger, onChange])

  const isTypo = correctionReason.startsWith("typo_")
  const isMinorCorrection = isTypo || correctionReason === "incorrect_spelling"

  useEffect(() => {
    if (isMinorCorrection) {
      setCorrectionFee({ feeCents: 0, currency: "USD", breakdown: [{ label: "Name correction fee (minor)", amount: 0 }] })
    } else {
      setCorrectionFee({
        feeCents: 15000,
        currency: "USD",
        breakdown: [
          { label: "Name change processing fee", amount: 5000 },
          { label: "Reissue ticket fee", amount: 2500 },
          { label: "Airline penalty (estimated)", amount: 7500 },
        ],
      })
    }
  }, [isMinorCorrection])

  return (
    <Card className="border border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-serif">Passenger {index + 1}</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowCorrectionDialog(true)}>
            <Edit3 className="h-3 w-3 mr-1" />
            Correct Name
          </Button>
          {showRemove && onRemove && (
            <Button variant="ghost" size="sm" onClick={() => onRemove(index)}>
              <X className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          <div>
            <Label htmlFor={`title-${index}`}>Title</Label>
            <Select value={passenger.title || ""} onValueChange={(v) => handleChange("title", v)}>
              <SelectTrigger id={`title-${index}`}>
                <SelectValue placeholder="Title" />
              </SelectTrigger>
              <SelectContent>
                {VALID_TITLES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor={`firstName-${index}`}>First Name *</Label>
            <Input
              id={`firstName-${index}`}
              value={passenger.firstName}
              onChange={(e) => handleChange("firstName", e.target.value)}
              aria-required="true"
              aria-invalid={!!localErrors.firstName || undefined}
              aria-describedby={localErrors.firstName ? `firstName-error-${index}` : undefined}
              className={cn(localErrors.firstName && "border-destructive")}
            />
            {localErrors.firstName && (
              <p id={`firstName-error-${index}`} className="text-xs text-destructive mt-1" role="alert">{localErrors.firstName}</p>
            )}
          </div>
          <div>
            <Label htmlFor={`middleName-${index}`}>Middle Name</Label>
            <Input
              id={`middleName-${index}`}
              value={passenger.middleName || ""}
              onChange={(e) => handleChange("middleName", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`lastName-${index}`}>Last Name *</Label>
            <Input
              id={`lastName-${index}`}
              value={passenger.lastName}
              onChange={(e) => handleChange("lastName", e.target.value)}
              aria-required="true"
              aria-invalid={!!localErrors.lastName || undefined}
              aria-describedby={localErrors.lastName ? `lastName-error-${index}` : undefined}
              className={cn(localErrors.lastName && "border-destructive")}
            />
            {localErrors.lastName && (
              <p id={`lastName-error-${index}`} className="text-xs text-destructive mt-1" role="alert">{localErrors.lastName}</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <Label htmlFor={`suffix-${index}`}>Suffix</Label>
            <Select value={passenger.suffix || ""} onValueChange={(v) => handleChange("suffix", v)}>
              <SelectTrigger id={`suffix-${index}`}>
                <SelectValue placeholder="Suffix" />
              </SelectTrigger>
              <SelectContent>
                {VALID_SUFFIXES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label htmlFor={`email-${index}`}>Email *</Label>
            <Input
              id={`email-${index}`}
              type="email"
              value={passenger.email}
              onChange={(e) => handleChange("email", e.target.value)}
              aria-required="true"
              aria-invalid={!!localErrors.email || undefined}
              aria-describedby={localErrors.email ? `email-error-${index}` : undefined}
              className={cn(localErrors.email && "border-destructive")}
            />
            {localErrors.email && (
              <p id={`email-error-${index}`} className="text-xs text-destructive mt-1" role="alert">{localErrors.email}</p>
            )}
          </div>
          <div>
            <Label htmlFor={`phone-${index}`}>Phone</Label>
            <Input
              id={`phone-${index}`}
              value={passenger.phone || ""}
              onChange={(e) => handleChange("phone", e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor={`dob-${index}`}>Date of Birth</Label>
            <Input
              id={`dob-${index}`}
              type="date"
              value={passenger.dateOfBirth || ""}
              onChange={(e) => handleChange("dateOfBirth", e.target.value)}
              aria-invalid={!!localErrors.dateOfBirth || undefined}
              aria-describedby={localErrors.dateOfBirth ? `dob-error-${index}` : undefined}
              className={cn(localErrors.dateOfBirth && "border-destructive")}
            />
            {localErrors.dateOfBirth && (
              <p id={`dob-error-${index}`} className="text-xs text-destructive mt-1" role="alert">{localErrors.dateOfBirth}</p>
            )}
          </div>
          <div>
            <Label htmlFor={`nationality-${index}`}>Nationality</Label>
            <Select value={passenger.nationality || ""} onValueChange={(v) => handleChange("nationality", v)}>
              <SelectTrigger id={`nationality-${index}`}>
                <SelectValue placeholder="Select nationality" />
              </SelectTrigger>
              <SelectContent>
                {NATIONALITIES.map((n) => (
                  <SelectItem key={n.code} value={n.code}>{n.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {airline && (
          <Alert className="bg-muted/30 border-border/50">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Name will be formatted for {airline}. Ensure name matches your travel document exactly.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      <Dialog open={showCorrectionDialog} onOpenChange={setShowCorrectionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Name Correction</DialogTitle>
            <DialogDescription>
              Submit a correction request for passenger {index + 1}. Fees may apply based on the type of change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Current Name</Label>
              <p className="text-sm font-mono bg-muted p-2 rounded">
                {[passenger.title, passenger.firstName, passenger.middleName, passenger.lastName, passenger.suffix].filter(Boolean).join(" ")}
              </p>
            </div>
            <div>
              <Label htmlFor="correction-reason">Reason for Correction *</Label>
              <Select value={correctionReason} onValueChange={setCorrectionReason}>
                <SelectTrigger id="correction-reason">
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {CORRECTION_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {correctionFee && (
              <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium">Fee Breakdown</p>
                {correctionFee.breakdown.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm text-muted-foreground">
                    <span>{item.label}</span>
                    <span>${(item.amount / 100).toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold pt-1 border-t border-border">
                  <span>Total</span>
                  <span>${(correctionFee.feeCents / 100).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCorrectionDialog(false)}>Cancel</Button>
            <Button disabled={!correctionReason}>Submit Correction Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export function validatePassengers(passengers: PassengerData[]): PassengerFormErrors[] {
  return passengers.map((p) => {
    const errors: PassengerFormErrors = {}
    const fnErr = validateName(p.firstName, "First name")
    if (fnErr) errors.firstName = fnErr
    const lnErr = validateName(p.lastName, "Last name")
    if (lnErr) errors.lastName = lnErr
    const emailErr = validateEmail(p.email)
    if (emailErr) errors.email = emailErr
    const dobErr = validateDateOfBirth(p.dateOfBirth || "")
    if (dobErr) errors.dateOfBirth = dobErr
    return errors
  })
}
