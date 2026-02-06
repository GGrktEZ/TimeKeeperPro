export interface Project {
  id: string
  name: string
  startDate: string
  endDate: string | null
  description: string
  color: string
  createdAt: string
  updatedAt: string
}

export interface WorkSession {
  id: string
  start: string
  end: string
  doneNotes: string
  todoNotes: string
}

export interface DayProjectEntry {
  id: string
  projectId: string
  notes: string
  hoursWorked: number
  workSessions: WorkSession[]
}

export interface Break {
  id: string
  start: string
  end: string
}

export type AttendanceLocation = "office" | "home"

export interface AttendancePeriod {
  id: string
  start: string
  end: string
  location: AttendanceLocation
}

export interface DayEntry {
  id: string
  date: string
  attendance: AttendancePeriod[]
  lunchStart: string | null
  lunchEnd: string | null
  breaks: Break[]
  scheduleNotes: string
  projects: DayProjectEntry[]
  createdAt: string
  updatedAt: string

  /** @deprecated Use attendance array instead */
  clockIn?: string | null
  /** @deprecated Use attendance array instead */
  clockOut?: string | null
  /** @deprecated Use attendance array instead */
  homeOffice?: boolean
}

export type View = 'daily' | 'projects' | 'stats'
