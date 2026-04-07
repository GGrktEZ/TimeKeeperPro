import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Calculate the difference in minutes between two "HH:MM" time strings.
 * Handles overnight (past-midnight) sessions by adding 24h when end < start.
 * Returns 0 for invalid or missing inputs.
 */
export function timeDiffMinutes(start: string, end: string): number {
  if (!start || !end) return 0
  const [sH, sM] = start.split(":").map(Number)
  const [eH, eM] = end.split(":").map(Number)
  let diff = (eH * 60 + eM) - (sH * 60 + sM)
  if (diff < 0) diff += 1440 // crossed midnight
  return diff
}

/**
 * Normalizes loose time input while typing.
 * Examples: "1200" -> "12:00", "12.0" -> "12:0", "12,00" -> "12:00"
 */
export function normalizeTimeInput(raw: string): string {
  if (!raw) return ""

  const cleaned = raw.replace(/[.,;]/g, ":").replace(/[^\d:]/g, "")
  if (!cleaned) return ""

  const firstColon = cleaned.indexOf(":")
  if (firstColon >= 0) {
    const hours = cleaned.slice(0, firstColon).replace(/\D/g, "").slice(0, 2)
    const minutes = cleaned.slice(firstColon + 1).replace(/\D/g, "").slice(0, 2)
    if (!hours) return minutes ? `:${minutes}` : ""
    return minutes.length > 0 || hours.length === 2 ? `${hours}:${minutes}` : hours
  }

  const digits = cleaned.replace(/\D/g, "").slice(0, 4)
  if (digits.length <= 2) return digits
  if (digits.length === 3) return `${digits.slice(0, 2)}:${digits.slice(2)}`
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`
}

/**
 * Converts loose/partial input into strict HH:MM on blur.
 */
export function finalizeTimeInput(raw: string): string {
  const normalized = normalizeTimeInput(raw)
  if (!normalized) return ""

  const [hRaw, mRaw = ""] = normalized.split(":")
  if (!hRaw) return ""

  const hNum = Number(hRaw)
  const mNum = Number(mRaw || "0")
  if (Number.isNaN(hNum) || Number.isNaN(mNum)) return ""

  const hours = Math.min(23, Math.max(0, hNum))
  const minutes = Math.min(59, Math.max(0, mNum))
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}
