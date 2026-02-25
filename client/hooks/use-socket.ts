"use client"

import { useEffect } from 'react'
import { useSocket as useSocketCtx } from '@/components/socket/SocketProvider'

export function useSocketEvents() {
  const { manager } = useSocketCtx()

  useEffect(() => {
    const onPrice = (d: any) => console.debug('price', d)
    const onBooking = (d: any) => console.debug('booking', d)

    manager.on('price_update', onPrice)
    manager.on('booking_status', onBooking)

    return () => {
      manager.off('price_update', onPrice)
      manager.off('booking_status', onBooking)
    }
  }, [manager])
}
