"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { SearchForm, SearchFormData } from "./search-form"
import { Search } from "lucide-react"
import { useRouter } from "next/navigation"

interface QuickSearchModalProps {
  trigger?: React.ReactNode
}

export function QuickSearchModal({ trigger }: QuickSearchModalProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const handleSearch = (searchData: SearchFormData) => {
    const params = new URLSearchParams()
    params.set('tripType', searchData.tripType)
    params.set('from', searchData.from)
    params.set('to', searchData.to)
    params.set('departure', searchData.departure)
    params.set('passengers', searchData.passengers)
    params.set('class', searchData.class)
    if (searchData.tripType === 'roundtrip' && searchData.return) {
      params.set('return', searchData.return)
    }

    setOpen(false)
    router.push(`/search?${params.toString()}`)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="lg" className="gap-2">
            <Search className="h-5 w-5" />
            Quick Search
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Search Flights</DialogTitle>
        </DialogHeader>
        <SearchForm onSearch={handleSearch} />
      </DialogContent>
    </Dialog>
  )
}
