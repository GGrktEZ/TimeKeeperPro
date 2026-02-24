import type { DayEntry, Project, WorkSession } from "./types"

// ---- Settings persistence (localStorage for config only) ----

const SETTINGS_KEY = "timetrack-crm-settings"

export interface CrmSettings {
  clientId: string
  tenantId: string
  orgUrl: string // e.g. "https://theia.crm4.dynamics.com"
}

const DEFAULT_SETTINGS: CrmSettings = {
  clientId: "",
  tenantId: "",
  orgUrl: "https://theia.crm4.dynamics.com",
}

export function getCrmSettings(): CrmSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveCrmSettings(settings: CrmSettings): void {
  if (typeof window === "undefined") return
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

// ---- MSAL Authentication ----
// Uses @azure/msal-browser loaded from CDN to keep bundle small.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let msalInstance: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let msalPromise: Promise<any> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadMsal(): Promise<any> {
  if (msalPromise) return msalPromise
  msalPromise = new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).msal) {
      resolve((window as any).msal)
      return
    }
    const script = document.createElement("script")
    script.src = "https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js"
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lib = (window as any).msal
      if (lib) resolve(lib)
      else reject(new Error("MSAL library not found on window after loading"))
    }
    script.onerror = () => reject(new Error("Failed to load MSAL from CDN"))
    document.head.appendChild(script)
  })
  return msalPromise
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMsalInstance(settings: CrmSettings): Promise<any> {
  const msal = await loadMsal()

  // Re-create instance if settings changed
  if (
    msalInstance &&
    msalInstance._config?.auth?.clientId === settings.clientId &&
    msalInstance._config?.auth?.authority?.includes(settings.tenantId)
  ) {
    return msalInstance
  }

  const config = {
    auth: {
      clientId: settings.clientId,
      authority: `https://login.microsoftonline.com/${settings.tenantId}`,
      redirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: "localStorage",
      storeAuthStateInCookie: false,
    },
  }

  msalInstance = new msal.PublicClientApplication(config)
  await msalInstance.initialize()
  return msalInstance
}

export interface AuthState {
  isAuthenticated: boolean
  userName: string | null
  userEmail: string | null
}

export async function signIn(settings: CrmSettings): Promise<AuthState> {
  const pca = await getMsalInstance(settings)
  const orgUrl = settings.orgUrl.replace(/\/$/, "")

  const loginRequest = {
    scopes: [`${orgUrl}/user_impersonation`],
    prompt: "select_account",
  }

  const response = await pca.loginPopup(loginRequest)
  return {
    isAuthenticated: true,
    userName: response.account?.name ?? null,
    userEmail: response.account?.username ?? null,
  }
}

export async function signOut(settings: CrmSettings): Promise<void> {
  const pca = await getMsalInstance(settings)
  const accounts = pca.getAllAccounts()
  if (accounts.length > 0) {
    await pca.logoutPopup({ account: accounts[0] })
  }
  msalInstance = null
}

export async function getAccessToken(settings: CrmSettings): Promise<string> {
  const pca = await getMsalInstance(settings)
  const orgUrl = settings.orgUrl.replace(/\/$/, "")
  const accounts = pca.getAllAccounts()

  if (accounts.length === 0) {
    throw new Error("No authenticated account. Please sign in first.")
  }

  const tokenRequest = {
    scopes: [`${orgUrl}/user_impersonation`],
    account: accounts[0],
  }

  try {
    const response = await pca.acquireTokenSilent(tokenRequest)
    return response.accessToken
  } catch {
    // Silent acquisition failed, try interactive
    const response = await pca.acquireTokenPopup(tokenRequest)
    return response.accessToken
  }
}

export function getAuthState(settings: CrmSettings): AuthState {
  if (!msalInstance) {
    return { isAuthenticated: false, userName: null, userEmail: null }
  }
  const accounts = msalInstance.getAllAccounts()
  if (accounts.length === 0) {
    return { isAuthenticated: false, userName: null, userEmail: null }
  }
  return {
    isAuthenticated: true,
    userName: accounts[0].name ?? null,
    userEmail: accounts[0].username ?? null,
  }
}

// Try to restore session from cache on init
export async function tryRestoreSession(settings: CrmSettings): Promise<AuthState> {
  if (!settings.clientId || !settings.tenantId) {
    return { isAuthenticated: false, userName: null, userEmail: null }
  }
  try {
    const pca = await getMsalInstance(settings)
    const accounts = pca.getAllAccounts()
    if (accounts.length > 0) {
      return {
        isAuthenticated: true,
        userName: accounts[0].name ?? null,
        userEmail: accounts[0].username ?? null,
      }
    }
  } catch {
    // Silent restore failed
  }
  return { isAuthenticated: false, userName: null, userEmail: null }
}

// ---- Dataverse API ----

interface DataverseTimeEntry {
  "msdyn_date": string                         // ISO 8601 date
  "msdyn_duration": number                     // minutes
  "msdyn_description"?: string
  "msdyn_type": number                         // 192350000 = Work
  "msdyn_entrystatus": number                  // 192350000 = Draft
  "msdyn_project@odata.bind"?: string          // /msdyn_projects(GUID)
  "msdyn_projectTask@odata.bind"?: string      // /msdyn_projecttasks(GUID)
  "msdyn_externalDescription"?: string         // External Comments
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
  weekDates: string[] // yyyy-MM-dd
}

interface MergedEntry {
  date: string // yyyy-MM-dd
  projectId: string
  projectName: string
  dynamicsProjectId: string | null
  taskName: string
  dynamicsTaskId: string | null
  minutes: number
  descriptions: string[]
}

/**
 * Build merged time entries from weekly sessions.
 * Groups by project + task + date.
 */
export function buildMergedEntries(options: BuildPayloadOptions): MergedEntry[] {
  const { entries, projects, weekDates } = options
  const projectMap = new Map(projects.map((p) => [p.id, p]))
  const result: MergedEntry[] = []

  const grouped = new Map<
    string,
    Map<string, Map<string, { minutes: number; descriptions: string[]; dynamicsTaskId: string | null }>>
  >()

  for (const date of weekDates) {
    const entry = entries.find((e) => e.date === date)
    if (!entry) continue
    for (const dp of entry.projects ?? []) {
      const project = projectMap.get(dp.projectId)
      for (const session of dp.workSessions ?? []) {
        const mins = sessionMinutes(session)
        if (mins <= 0) continue
        const taskKey = session.taskName ?? ""
        if (!grouped.has(date)) grouped.set(date, new Map())
        const dateMap = grouped.get(date)!
        if (!dateMap.has(dp.projectId)) dateMap.set(dp.projectId, new Map())
        const projMap = dateMap.get(dp.projectId)!
        if (!projMap.has(taskKey)) {
          // Find matching Dynamics task ID
          let dynamicsTaskId: string | null = null
          if (project?.tasks) {
            const matchingTask = project.tasks.find((t) => t.name === taskKey)
            if (matchingTask?.dynamicsTaskId) {
              dynamicsTaskId = matchingTask.dynamicsTaskId
            }
          }
          projMap.set(taskKey, { minutes: 0, descriptions: [], dynamicsTaskId })
        }
        const agg = projMap.get(taskKey)!
        agg.minutes += mins
        if (session.doneNotes?.trim()) agg.descriptions.push(session.doneNotes.trim())
      }
    }
  }

  for (const [date, dateMap] of grouped) {
    for (const [projectId, projMap] of dateMap) {
      const project = projectMap.get(projectId)
      for (const [taskName, agg] of projMap) {
        result.push({
          date,
          projectId,
          projectName: project?.name ?? "Unknown",
          dynamicsProjectId: project?.dynamics?.dynamicsId ?? null,
          taskName,
          dynamicsTaskId: agg.dynamicsTaskId,
          minutes: agg.minutes,
          descriptions: agg.descriptions,
        })
      }
    }
  }

  result.sort((a, b) => {
    const d = a.date.localeCompare(b.date)
    if (d !== 0) return d
    return a.projectName.localeCompare(b.projectName)
  })

  return result
}

export interface SyncResult {
  success: boolean
  message: string
  created: number
  failed: number
  errors: string[]
}

/**
 * Push time entries to Dynamics 365 Dataverse via the Web API.
 * Creates msdyn_timeentry records using the authenticated user's token.
 */
export async function syncToDataverse(
  settings: CrmSettings,
  mergedEntries: MergedEntry[],
): Promise<SyncResult> {
  if (mergedEntries.length === 0) {
    return { success: false, message: "No time entries to sync", created: 0, failed: 0, errors: [] }
  }

  let token: string
  try {
    token = await getAccessToken(settings)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return { success: false, message: `Authentication failed: ${msg}`, created: 0, failed: 0, errors: [msg] }
  }

  const orgUrl = settings.orgUrl.replace(/\/$/, "")
  const apiBase = `${orgUrl}/api/data/v9.2`

  let created = 0
  let failed = 0
  const errors: string[] = []

  for (const entry of mergedEntries) {
    const body: DataverseTimeEntry = {
      msdyn_date: `${entry.date}T00:00:00Z`,
      msdyn_duration: entry.minutes,
      msdyn_description: entry.descriptions.join("; ") || undefined,
      msdyn_type: 192350000, // Work
      msdyn_entrystatus: 192350000, // Draft
    }

    // Bind to project if we have a Dynamics GUID
    if (entry.dynamicsProjectId) {
      body["msdyn_project@odata.bind"] = `/msdyn_projects(${entry.dynamicsProjectId})`
    }

    // Bind to task if we have a Dynamics task GUID
    if (entry.dynamicsTaskId) {
      body["msdyn_projectTask@odata.bind"] = `/msdyn_projecttasks(${entry.dynamicsTaskId})`
    }

    try {
      const res = await fetch(`${apiBase}/msdyn_timeentries`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(body),
      })

      if (res.ok || res.status === 204) {
        created++
      } else {
        const errText = await res.text()
        let errMsg: string
        try {
          const errJson = JSON.parse(errText)
          errMsg = errJson.error?.message ?? errText
        } catch {
          errMsg = errText
        }
        failed++
        errors.push(`${entry.projectName} (${entry.date}): ${errMsg}`)
      }
    } catch (err) {
      failed++
      errors.push(`${entry.projectName} (${entry.date}): ${err instanceof Error ? err.message : "Network error"}`)
    }
  }

  if (failed === 0) {
    return {
      success: true,
      message: `Successfully created ${created} time ${created === 1 ? "entry" : "entries"} in Dynamics 365`,
      created,
      failed,
      errors,
    }
  }

  return {
    success: created > 0,
    message: `Created ${created}, failed ${failed} of ${mergedEntries.length} entries`,
    created,
    failed,
    errors,
  }
}
