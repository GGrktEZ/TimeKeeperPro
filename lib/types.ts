export interface ProjectTask {
  id: string
  name: string
  description: string
  dynamicsTaskId?: string
  scheduledStart: string | null
  scheduledEnd: string | null
  actualStart: string | null
  actualEnd: string | null
  progress: number
  effort: number
  effortCompleted: number
  effortRemaining: number
}

export interface DynamicsMetadata {
  dynamicsId: string
  subject: string
  statusCode: number
  stateCode: number
  scheduledStart: string | null
  scheduledEnd: string | null
  actualStart: string | null
  actualEnd: string | null
  effort: number
  effortCompleted: number
  effortRemaining: number
  progress: number
  teamSize: number
  duration: number | null
  hoursPerDay: number
  hoursPerWeek: number
  projectManagerId: string | null
  ownerId: string | null
  customerId: string | null
  calendarId: string | null
  lastSyncedAt: string
}

export interface Project {
  id: string
  name: string
  startDate: string
  endDate: string | null
  description: string
  color: string
  tasks: ProjectTask[]
  dynamics?: DynamicsMetadata
  createdAt: string
  updatedAt: string
}

export interface WorkSession {
  id: string
  start: string
  end: string
  taskId?: string
  taskName?: string
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

export type View = 'daily' | 'projects' | 'stats' | 'data'
