import type { DayEntry, Project, WorkSession } from "./types"

export interface CrmTimeEntry {
  project: string
  projectTask: string
  date: string          // DD.MM.YYYY
  duration: number      // minutes
  description: string
  type: "Work"
  entryStatus: "Draft"
  generatedByAI: {
    created_by: "user"
    comment_updated_by: "none"
    last_updated_by: "user"
    source: "user"
  }
}

function formatDateDMY(dateStr: string): string {
  const [y, m, d] = dateStr.split("-")
  return `${d}.${m}.${y}`
}

function sessionMinutes(session: WorkSession): number {
  if (!session.start || !session.end) return 0
  const [sH, sM] = session.start.split(":").map(Number)
  const [eH, eM] = session.end.split(":").map(Number)
  const diff = (eH * 60 + eM) - (sH * 60 + sM)
  return diff > 0 ? diff : 0
}

export interface BuildPayloadOptions {
  entries: DayEntry[]
  projects: Project[]
  weekDates: string[]   // yyyy-MM-dd
}

/**
 * Build CRM time entry payload from weekly sessions.
 * Merges sessions per project + task + date.
 */
export function buildCrmPayload(options: BuildPayloadOptions): CrmTimeEntry[] {
  const { entries, projects, weekDates } = options
  const projectMap = new Map(projects.map((p) => [p.id, p]))
  const result: CrmTimeEntry[] = []

  // Group: date -> projectId -> taskName -> { minutes, descriptions }
  const grouped = new Map<
    string,
    Map<string, Map<string, { minutes: number; descriptions: string[] }>>
  >()

  for (const date of weekDates) {
    const entry = entries.find((e) => e.date === date)
    if (!entry) continue
    for (const dp of entry.projects ?? []) {
      for (const session of dp.workSessions ?? []) {
        const mins = sessionMinutes(session)
        if (mins <= 0) continue
        const taskKey = session.taskName ?? ""
        if (!grouped.has(date)) grouped.set(date, new Map())
        const dateMap = grouped.get(date)!
        if (!dateMap.has(dp.projectId)) dateMap.set(dp.projectId, new Map())
        const projMap = dateMap.get(dp.projectId)!
        if (!projMap.has(taskKey)) projMap.set(taskKey, { minutes: 0, descriptions: [] })
        const agg = projMap.get(taskKey)!
        agg.minutes += mins
        if (session.doneNotes?.trim()) agg.descriptions.push(session.doneNotes.trim())
      }
    }
  }

  for (const [date, dateMap] of grouped) {
    for (const [projectId, projMap] of dateMap) {
      const project = projectMap.get(projectId)
      const projectName = project?.name ?? "Unknown"
      for (const [taskName, agg] of projMap) {
        result.push({
          project: projectName,
          projectTask: taskName,
          date: formatDateDMY(date),
          duration: agg.minutes,
          description: agg.descriptions.join("; "),
          type: "Work",
          entryStatus: "Draft",
          generatedByAI: {
            created_by: "user",
            comment_updated_by: "none",
            last_updated_by: "user",
            source: "user",
          },
        })
      }
    }
  }

  // Sort by date then project
  result.sort((a, b) => {
    const dateCompare = a.date.split(".").reverse().join("").localeCompare(
      b.date.split(".").reverse().join("")
    )
    if (dateCompare !== 0) return dateCompare
    return a.project.localeCompare(b.project)
  })

  return result
}

const WEBHOOK_KEY = "timetrack-crm-webhook-url"

export function getWebhookUrl(): string {
  if (typeof window === "undefined") return ""
  return localStorage.getItem(WEBHOOK_KEY) ?? ""
}

export function setWebhookUrl(url: string): void {
  if (typeof window === "undefined") return
  localStorage.setItem(WEBHOOK_KEY, url)
}

export interface SyncResult {
  success: boolean
  message: string
  entriesSent: number
}

/**
 * Send time entries to the Power Automate webhook.
 */
export async function syncToCrm(
  webhookUrl: string,
  payload: CrmTimeEntry[]
): Promise<SyncResult> {
  if (!webhookUrl.trim()) {
    return { success: false, message: "No webhook URL configured", entriesSent: 0 }
  }

  if (payload.length === 0) {
    return { success: false, message: "No time entries to sync", entriesSent: 0 }
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      return {
        success: false,
        message: `Webhook returned ${res.status}: ${res.statusText}`,
        entriesSent: 0,
      }
    }

    return {
      success: true,
      message: `Successfully synced ${payload.length} time ${payload.length === 1 ? "entry" : "entries"} to CRM`,
      entriesSent: payload.length,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return { success: false, message: `Sync failed: ${msg}`, entriesSent: 0 }
  }
}

/**
 * JSON schema to paste into Power Automate's
 * "When an HTTP request is received" trigger.
 */
export const POWER_AUTOMATE_SCHEMA = `{
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "project":       { "type": "string" },
      "projectTask":   { "type": "string" },
      "date":          { "type": "string" },
      "duration":      { "type": "integer" },
      "description":   { "type": "string" },
      "type":          { "type": "string" },
      "entryStatus":   { "type": "string" },
      "generatedByAI": {
        "type": "object",
        "properties": {
          "created_by":         { "type": "string" },
          "comment_updated_by": { "type": "string" },
          "last_updated_by":    { "type": "string" },
          "source":             { "type": "string" }
        }
      }
    },
    "required": ["project", "date", "duration", "type", "entryStatus"]
  }
}`
