"use client"

import { useState, useEffect } from "react"
import { Clock } from "lucide-react"

interface CountdownTimerProps {
  targetDate: string
  className?: string
  showIcon?: boolean
}

export function CountdownTimer({ targetDate, className = "", showIcon = true }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState("")
  const [isExpired, setIsExpired] = useState(false)

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date()
      const end = new Date(targetDate)
      const diff = end.getTime() - now.getTime()

      if (diff <= 0) {
        setTimeLeft("Ended")
        setIsExpired(true)
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${minutes}m`)
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`)
      } else {
        setTimeLeft(`${minutes}m ${seconds}s`)
      }
    }

    calculateTimeLeft()
    const interval = setInterval(calculateTimeLeft, 1000)

    return () => clearInterval(interval)
  }, [targetDate])

  return (
    <span className={`flex items-center gap-1 ${isExpired ? "text-muted-foreground" : "text-amber-600"} ${className}`}>
      {showIcon && <Clock className="h-4 w-4" />}
      {timeLeft}
    </span>
  )
}
