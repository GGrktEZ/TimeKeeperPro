import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns the current time as an "HH:MM" string.
 * When `round` is true the minutes are rounded to the nearest 5.
 */
export function getCurrentTimeString(round: boolean): string {
  const now = new Date()
  let h = now.getHours()
  let m = now.getMinutes()

  if (round) {
    m = Math.round(m / 5) * 5
    if (m === 60) {
      m = 0
      h = (h + 1) % 24
    }
  }

  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}
