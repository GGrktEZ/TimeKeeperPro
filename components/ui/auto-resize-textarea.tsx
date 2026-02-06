"use client"

import { useRef, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"

interface AutoResizeTextareaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  minHeight?: number
}

export function AutoResizeTextarea({
  value,
  onChange,
  placeholder,
  className,
  minHeight = 100,
}: AutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = "auto"
      const newHeight = Math.max(textarea.scrollHeight, minHeight)
      textarea.style.height = `${newHeight}px`
    }
  }, [minHeight])

  useEffect(() => {
    adjustHeight()
  }, [value, adjustHeight])

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-full resize-none overflow-hidden bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none",
        className
      )}
      style={{ minHeight: `${minHeight}px` }}
    />
  )
}
