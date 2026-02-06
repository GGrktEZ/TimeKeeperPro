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

/**
 * Convert "HH:MM" to total minutes. Returns NaN for invalid input.
 */
export function timeToMin(t: string | null | undefined): number {
  if (!t) return NaN
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

/**
 * Given an array of AttendancePeriods and a session start time,
 * return the location of the period that contains the session start.
 * Falls back to null if the session doesn't overlap any period.
 */
export function getSessionLocation(
  attendance: { start: string; end: string; location: "home" | "office" }[],
  sessionStart: string | null | undefined
): "home" | "office" | null {
  if (!sessionStart) return null
  const sMin = timeToMin(sessionStart)
  if (Number.isNaN(sMin)) return null

  for (const a of attendance) {
    const aStart = timeToMin(a.start)
    // If the period has no end yet, treat it as ongoing (infinity)
    const aEnd = a.end ? timeToMin(a.end) : Infinity
    if (Number.isNaN(aStart)) continue
    if (sMin >= aStart && sMin < (Number.isNaN(aEnd) ? Infinity : aEnd)) {
      return a.location
    }
  }
  return null
}
