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

export type LocationType = 'office' | 'home'

export interface LocationBlock {
  id: string
  location: LocationType
  start: string
  end: string
}

export interface DayEntry {
  id: string
  date: string
  clockIn: string | null
  clockOut: string | null
  lunchStart: string | null
  lunchEnd: string | null
  breaks: Break[]
  locationBlocks: LocationBlock[]
  scheduleNotes: string
  projects: DayProjectEntry[]
  createdAt: string
  updatedAt: string
}

export type View = 'daily' | 'projects' | 'stats'
