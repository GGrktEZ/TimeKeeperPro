import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Rounds an "HH:MM" time string to the nearest 5 minutes.
 * Returns the original string if it's empty or invalid.
 */
export function roundTimeToFive(time: string | null | undefined): string {
  if (!time) return ""
  const parts = time.split(":")
  if (parts.length !== 2) return time
  let h = Number(parts[0])
  let m = Number(parts[1])
  if (Number.isNaN(h) || Number.isNaN(m)) return time

  m = Math.round(m / 5) * 5
  if (m === 60) {
    m = 0
    h = (h + 1) % 24
  }

  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}
