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
