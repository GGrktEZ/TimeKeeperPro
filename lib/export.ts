import type { DayEntry, Project, WorkSession } from "./types"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from "date-fns"

export interface ExportedDayEntry {
  date: string
  dayOfWeek: string
  clockIn: string | null
  clockOut: string | null
  lunchStart: string | null
  lunchEnd: string | null
  breaks: { start: string; end: string }[]
  homeOffice: boolean
  hoursWorked: string | null
  hoursInOffice: string | null
  scheduleNotes: string
  projects: {
    name: string
    hoursWorked: number
    workSessions: { 
      start: string
      end: string
      durationMinutes: number
      doneNotes: string
      todoNotes: string
    }[]
  }[]
}

export interface ExportedData {
  exportedAt: string
  exportType: "day" | "month" | "full"
  period: string
  summary: {
    totalDaysWorked: number
    totalHoursWorked: string
    totalHoursInOffice: string
    projectsSummary: {
      name: string
      totalHours: number
    }[]
  }
  entries: ExportedDayEntry[]
  projects?: Project[]
}

// Calculate work hours from project sessions
function calculateProjectMinutes(entry: DayEntry): number {
  let totalMinutes = 0
  for (const project of entry.projects) {
    if (project.workSessions) {
      for (const session of project.workSessions) {
        if (session.start && session.end) {
          const [sH, sM] = session.start.split(":").map(Number)
          const [eH, eM] = session.end.split(":").map(Number)
          const duration = (eH * 60 + eM) - (sH * 60 + sM)
          if (duration > 0) {
            totalMinutes += duration
          }
        }
      }
    }
  }
  return totalMinutes
}

// Calculate office hours (clock in/out minus breaks only, lunch is NOT subtracted)
function calculateOfficeMinutes(entry: DayEntry): number | null {
  if (!entry.clockIn || !entry.clockOut) return null
  
  const [inH, inM] = entry.clockIn.split(":").map(Number)
  const [outH, outM] = entry.clockOut.split(":").map(Number)
  let totalMinutes = (outH * 60 + outM) - (inH * 60 + inM)
  
  if (totalMinutes <= 0) return null
  
  // Subtract breaks only
  if (entry.breaks && entry.breaks.length > 0) {
    for (const brk of entry.breaks) {
      if (brk.start && brk.end) {
        const [bsH, bsM] = brk.start.split(":").map(Number)
        const [beH, beM] = brk.end.split(":").map(Number)
        const breakDuration = (beH * 60 + beM) - (bsH * 60 + bsM)
        if (breakDuration > 0) {
          totalMinutes -= breakDuration
        }
      }
    }
  }
  
  return totalMinutes > 0 ? totalMinutes : null
}

function minutesToHoursString(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}

function transformEntry(entry: DayEntry, projects: Project[]): ExportedDayEntry {
  const projectMinutes = calculateProjectMinutes(entry)
  const officeMinutes = calculateOfficeMinutes(entry)
  
  return {
    date: entry.date,
    dayOfWeek: format(parseISO(entry.date), "EEEE"),
    clockIn: entry.clockIn,
    clockOut: entry.clockOut,
    lunchStart: entry.lunchStart,
    lunchEnd: entry.lunchEnd,
    breaks: (entry.breaks ?? []).filter(b => b.start && b.end).map(b => ({ start: b.start, end: b.end })),
    homeOffice: entry.homeOffice ?? false,
    hoursWorked: projectMinutes > 0 ? minutesToHoursString(projectMinutes) : null,
    hoursInOffice: officeMinutes ? minutesToHoursString(officeMinutes) : null,
    scheduleNotes: entry.scheduleNotes,
    projects: entry.projects.map((p) => {
      const project = projects.find((proj) => proj.id === p.projectId)
      return {
        name: project?.name ?? "Unknown Project",
        hoursWorked: p.hoursWorked,
        workSessions: (p.workSessions ?? []).filter(s => s.start && s.end).map(s => {
          const [sH, sM] = s.start.split(":").map(Number)
          const [eH, eM] = s.end.split(":").map(Number)
          const durationMinutes = Math.max(0, (eH * 60 + eM) - (sH * 60 + sM))
          return { 
            start: s.start, 
            end: s.end, 
            durationMinutes,
            doneNotes: s.doneNotes ?? "",
            todoNotes: s.todoNotes ?? "",
          }
        }),
      }
    }),
  }
}

export function exportDay(
  date: string,
  entry: DayEntry | undefined,
  projects: Project[]
): ExportedData {
  const entries: ExportedDayEntry[] = []
  let totalWorkMinutes = 0
  let totalOfficeMinutes = 0
  const projectHours: Record<string, number> = {}

  if (entry) {
    const transformed = transformEntry(entry, projects)
    entries.push(transformed)
    
    totalWorkMinutes = calculateProjectMinutes(entry)
    const officeMinutes = calculateOfficeMinutes(entry)
    if (officeMinutes) totalOfficeMinutes = officeMinutes
    
    entry.projects.forEach((p) => {
      const project = projects.find((proj) => proj.id === p.projectId)
      const name = project?.name ?? "Unknown"
      projectHours[name] = (projectHours[name] || 0) + p.hoursWorked
    })
  }

  return {
    exportedAt: new Date().toISOString(),
    exportType: "day",
    period: format(parseISO(date), "MMMM d, yyyy"),
    summary: {
      totalDaysWorked: entries.length > 0 && (entries[0].clockIn || entries[0].projects.length > 0) ? 1 : 0,
      totalHoursWorked: minutesToHoursString(totalWorkMinutes),
      totalHoursInOffice: minutesToHoursString(totalOfficeMinutes),
      projectsSummary: Object.entries(projectHours).map(([name, hours]) => ({
        name,
        totalHours: hours,
      })),
    },
    entries,
  }
}

export function exportMonth(
  date: string,
  allEntries: DayEntry[],
  projects: Project[]
): ExportedData {
  const monthStart = startOfMonth(parseISO(date))
  const monthEnd = endOfMonth(parseISO(date))
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })
  
  const entries: ExportedDayEntry[] = []
  let totalWorkMinutes = 0
  let totalOfficeMinutes = 0
  let daysWorked = 0
  const projectHours: Record<string, number> = {}

  for (const day of daysInMonth) {
    const dayStr = format(day, "yyyy-MM-dd")
    const entry = allEntries.find((e) => e.date === dayStr)
    
    if (entry && (entry.clockIn || entry.projects.length > 0 || entry.scheduleNotes)) {
      const transformed = transformEntry(entry, projects)
      entries.push(transformed)
      
      const workMinutes = calculateProjectMinutes(entry)
      const officeMinutes = calculateOfficeMinutes(entry)
      
      if (workMinutes > 0 || officeMinutes) {
        daysWorked++
      }
      
      totalWorkMinutes += workMinutes
      if (officeMinutes) totalOfficeMinutes += officeMinutes
      
      entry.projects.forEach((p) => {
        const project = projects.find((proj) => proj.id === p.projectId)
        const name = project?.name ?? "Unknown"
        projectHours[name] = (projectHours[name] || 0) + p.hoursWorked
      })
    }
  }

  return {
    exportedAt: new Date().toISOString(),
    exportType: "month",
    period: format(monthStart, "MMMM yyyy"),
    summary: {
      totalDaysWorked: daysWorked,
      totalHoursWorked: minutesToHoursString(totalWorkMinutes),
      totalHoursInOffice: minutesToHoursString(totalOfficeMinutes),
      projectsSummary: Object.entries(projectHours)
        .map(([name, hours]) => ({ name, totalHours: hours }))
        .sort((a, b) => b.totalHours - a.totalHours),
    },
    entries,
  }
}

export function exportAll(
  allEntries: DayEntry[],
  projects: Project[]
): ExportedData {
  const entries: ExportedDayEntry[] = []
  let totalWorkMinutes = 0
  let totalOfficeMinutes = 0
  let daysWorked = 0
  const projectHours: Record<string, number> = {}

  // Sort entries by date
  const sortedEntries = [...allEntries].sort((a, b) => a.date.localeCompare(b.date))

  for (const entry of sortedEntries) {
    if (entry.clockIn || entry.projects.length > 0 || entry.scheduleNotes) {
      const transformed = transformEntry(entry, projects)
      entries.push(transformed)
      
      const workMinutes = calculateProjectMinutes(entry)
      const officeMinutes = calculateOfficeMinutes(entry)
      
      if (workMinutes > 0 || officeMinutes) {
        daysWorked++
      }
      
      totalWorkMinutes += workMinutes
      if (officeMinutes) totalOfficeMinutes += officeMinutes
      
      entry.projects.forEach((p) => {
        const project = projects.find((proj) => proj.id === p.projectId)
        const name = project?.name ?? "Unknown"
        projectHours[name] = (projectHours[name] || 0) + p.hoursWorked
      })
    }
  }

  const firstDate = entries.length > 0 ? entries[0].date : "N/A"
  const lastDate = entries.length > 0 ? entries[entries.length - 1].date : "N/A"

  return {
    exportedAt: new Date().toISOString(),
    exportType: "full",
    period: `${firstDate} to ${lastDate}`,
    summary: {
      totalDaysWorked: daysWorked,
      totalHoursWorked: minutesToHoursString(totalWorkMinutes),
      totalHoursInOffice: minutesToHoursString(totalOfficeMinutes),
      projectsSummary: Object.entries(projectHours)
        .map(([name, hours]) => ({ name, totalHours: hours }))
        .sort((a, b) => b.totalHours - a.totalHours),
    },
    entries,
    projects,
  }
}

export function downloadJson(data: ExportedData, filename: string) {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
