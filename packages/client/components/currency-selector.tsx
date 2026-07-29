"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SUPPORTED_CURRENCIES, type CurrencyCode, currencySymbolMap } from "@/lib/currency"

interface CurrencySelectorProps {
  value: CurrencyCode
  onValueChange: (value: CurrencyCode) => void
}

export function CurrencySelector({ value, onValueChange }: CurrencySelectorProps) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as CurrencyCode)}>
      <SelectTrigger className="w-[140px]">
        <SelectValue>
          <span className="flex items-center gap-2">
            <span className="text-base">{currencySymbolMap[value]}</span>
            <span>{value}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.values(SUPPORTED_CURRENCIES).map((currency) => (
          <SelectItem key={currency.code} value={currency.code}>
            <span className="flex items-center gap-2">
              <span className="text-base w-5 text-center">{currency.symbol}</span>
              <span>{currency.code}</span>
              <span className="text-muted-foreground text-xs ml-1">{currency.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
