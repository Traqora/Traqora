"use client"

import { useEffect, useRef, useCallback } from "react"
import {
  setInitialFocus,
  getFocusableElements,
  focusTrap,
  FocusTrapOptions,
} from "@/lib/accessibility"

interface BookingStepFocusOptions {
  stepElement: HTMLElement | null
  isActive: boolean
  preferredSelector?: string
  onStepActivate?: () => void
  onStepDeactivate?: () => void
}

export function useBookingStepFocus({
  stepElement,
  isActive,
  preferredSelector,
  onStepActivate,
  onStepDeactivate,
}: BookingStepFocusOptions) {
  const cleanupRef = useRef<(() => void) | null>(null)
  const previousActiveRef = useRef<HTMLElement | null>(null)

  const activate = useCallback(() => {
    if (!stepElement) return
    previousActiveRef.current = document.activeElement as HTMLElement
    cleanupRef.current = focusTrap(stepElement, {
      initialFocus: preferredSelector,
      previousActiveElement: previousActiveRef.current,
      returnFocusOnDeactivate: true,
    })
    onStepActivate?.()
  }, [stepElement, preferredSelector, onStepActivate])

  const deactivate = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    onStepDeactivate?.()
  }, [onStepDeactivate])

  useEffect(() => {
    if (isActive && stepElement) {
      activate()
    } else {
      deactivate()
    }

    return () => {
      cleanupRef.current?.()
    }
  }, [isActive, stepElement, activate, deactivate])

  return { activate, deactivate }
}

interface BookingFormFocusOptions {
  formRef: React.RefObject<HTMLElement | null>
  errors?: Record<string, string>
  onErrorFocus?: (fieldName: string) => void
}

export function useBookingFormFocus({
  formRef,
  errors,
  onErrorFocus,
}: BookingFormFocusOptions) {
  const focusFirstError = useCallback(() => {
    if (!formRef.current || !errors) return

    const errorFields = Object.keys(errors)
    if (errorFields.length === 0) return

    const firstErrorField = formRef.current.querySelector(
      `[name="${errorFields[0]}"], [id*="${errorFields[0]}"]`,
    ) as HTMLElement

    if (firstErrorField) {
      firstErrorField.focus()
      onErrorFocus?.(errorFields[0])
    }
  }, [formRef, errors, onErrorFocus])

  useEffect(() => {
    focusFirstError()
  }, [focusFirstError])

  const focusFirstField = useCallback(() => {
    if (!formRef.current) return
    const focusable = getFocusableElements(formRef.current)
    if (focusable.length > 0) {
      focusable[0].focus()
    }
  }, [formRef])

  return { focusFirstError, focusFirstField }
}

interface BookingDialogFocusOptions {
  dialogRef: React.RefObject<HTMLElement | null>
  isOpen: boolean
  triggerElement?: HTMLElement | null
  onClose?: () => void
}

export function useBookingDialogFocus({
  dialogRef,
  isOpen,
  triggerElement,
  onClose,
}: BookingDialogFocusOptions) {
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (isOpen && dialogRef.current) {
      cleanupRef.current = focusTrap(dialogRef.current, {
        initialFocus: undefined,
        previousActiveElement: triggerElement ?? undefined,
        returnFocusOnDeactivate: true,
      })
    } else {
      cleanupRef.current?.()
      cleanupRef.current = null
      if (!isOpen && triggerElement) {
        triggerElement.focus()
      }
      onClose?.()
    }

    return () => {
      cleanupRef.current?.()
    }
  }, [isOpen, dialogRef, triggerElement, onClose])
}

export function useBookingKeyboardNavigation(
  onNext?: () => void,
  onPrevious?: () => void,
  onSubmit?: () => void,
) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault()
        onSubmit?.()
      }

      if (event.key === "ArrowRight" && event.altKey) {
        event.preventDefault()
        onNext?.()
      }

      if (event.key === "ArrowLeft" && event.altKey) {
        event.preventDefault()
        onPrevious?.()
      }
    },
    [onNext, onPrevious, onSubmit],
  )

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])
}