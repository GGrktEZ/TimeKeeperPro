"use client"

import { useState, useCallback } from "react"
import { RefreshCw, CloudDownload, Check, AlertTriangle, ExternalLink, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { Project, DynamicsMetadata } from "@/lib/types"
import { format, parseISO } from "date-fns"

const DYNAMICS_API_URL =
  "https://theia.crm4.dynamics.com/api/data/v9.0/msdyn_projects?$filter=statuscode%20eq%201"

interface DynamicsProject {
  msdyn_projectid: string
  msdyn_subject: string
  msdyn_description: string | null
  statuscode: number
  statecode: number
  msdyn_scheduledstart: string | null
  msdyn_scheduledend: string | null
  msdyn_finish: string | null
  msdyn_actualstart: string | null
  msdyn_actualend: string | null
  msdyn_effort: number
  msdyn_effortcompleted: number
  msdyn_effortremaining: number
  msdyn_progress: number
  msdyn_teamsize: number
  msdyn_duration: number | null
  msdyn_hoursperday: number
  msdyn_hoursperweek: number
  _msdyn_projectmanager_value: string | null
  _ownerid_value: string | null
  _msdyn_customer_value: string | null
  msdyn_calendarid: string | null
  createdon: string
  modifiedon: string
}

interface DynamicsApiResponse {
  "@odata.context": string
  value: DynamicsProject[]
}

function mapDynamicsToProject(dp: DynamicsProject): {
  name: string
  description: string
  startDate: string
  endDate: string | null
  dynamics: DynamicsMetadata
} {
  const start = dp.msdyn_scheduledstart ?? dp.createdon
  const end = dp.msdyn_finish ?? dp.msdyn_scheduledend ?? dp.msdyn_actualend

  return {
    name: dp.msdyn_subject,
    description: dp.msdyn_description ?? "",
    startDate: start ? format(parseISO(start), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
    endDate: end ? format(parseISO(end), "yyyy-MM-dd") : null,
    dynamics: {
      dynamicsId: dp.msdyn_projectid,
      subject: dp.msdyn_subject,
      statusCode: dp.statuscode,
      stateCode: dp.statecode,
      scheduledStart: dp.msdyn_scheduledstart,
      scheduledEnd: dp.msdyn_scheduledend ?? dp.msdyn_finish,
      actualStart: dp.msdyn_actualstart,
      actualEnd: dp.msdyn_actualend,
      effort: dp.msdyn_effort,
      effortCompleted: dp.msdyn_effortcompleted,
      effortRemaining: dp.msdyn_effortremaining,
      progress: dp.msdyn_progress,
      teamSize: dp.msdyn_teamsize,
      duration: dp.msdyn_duration,
      hoursPerDay: dp.msdyn_hoursperday,
      hoursPerWeek: dp.msdyn_hoursperweek,
      projectManagerId: dp._msdyn_projectmanager_value,
      ownerId: dp._ownerid_value,
      customerId: dp._msdyn_customer_value,
      calendarId: dp.msdyn_calendarid,
      lastSyncedAt: new Date().toISOString(),
    },
  }
}

type SyncStatus = "idle" | "fetching" | "preview" | "importing" | "done" | "error"

interface DynamicsSyncProps {
  projects: Project[]
  onImportProjects: (projects: Omit<Project, "id" | "color" | "createdAt" | "updatedAt">[]) => void
  onUpdateProject: (id: string, data: Partial<Project>) => void
}

export function DynamicsSync({ projects, onImportProjects, onUpdateProject }: DynamicsSyncProps) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<SyncStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<number | null>(null)
  const [fetched, setFetched] = useState<ReturnType<typeof mapDynamicsToProject>[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importResult, setImportResult] = useState<{ created: number; updated: number }>({
    created: 0,
    updated: 0,
  })

  const existingDynamicsIds = new Map(
    projects.filter((p) => p.dynamics?.dynamicsId).map((p) => [p.dynamics!.dynamicsId, p])
  )

  const handleFetch = useCallback(async () => {
    setStatus("fetching")
    setError(null)
    setErrorCode(null)

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      const res = await fetch(DYNAMICS_API_URL, {
        credentials: "include",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
        },
      })

      clearTimeout(timeout)

      if (!res.ok) {
        setErrorCode(res.status)
        let errBody = ""
        try { errBody = await res.text() } catch { /* ignore */ }

        // Try to parse Dynamics error JSON
        let parsedErr = ""
        try {
          const errJson = JSON.parse(errBody)
          parsedErr = errJson?.error?.message || errJson?.Message || ""
        } catch { /* not JSON */ }

        const detail = parsedErr || errBody?.slice(0, 300) || res.statusText

        if (res.status === 401) {
          setError(`401 Unauthorized -- Your browser session is not authenticated with Dynamics 365. Open Dynamics in this browser and sign in, then try again.\n\nServer: ${detail}`)
        } else if (res.status === 403) {
          setError(`403 Forbidden -- You are signed in but do not have permission to access Dynamics projects.\n\nServer: ${detail}`)
        } else if (res.status === 404) {
          setError(`404 Not Found -- The Dynamics API endpoint could not be found. The org URL may be wrong.\n\nURL: ${DYNAMICS_API_URL}\nServer: ${detail}`)
        } else if (res.status === 429) {
          setError(`429 Too Many Requests -- Dynamics is rate-limiting you. Wait a moment and try again.\n\nServer: ${detail}`)
        } else if (res.status >= 500) {
          setError(`${res.status} Server Error -- Dynamics 365 returned a server-side error.\n\nServer: ${detail}`)
        } else {
          setError(`HTTP ${res.status} -- ${detail}`)
        }
        setStatus("error")
        return
      }

      let data: DynamicsApiResponse
      try {
        data = await res.json()
      } catch (parseErr) {
        setError(`Response was 200 OK but the body is not valid JSON. This might mean a login redirect page was returned instead of API data.\n\nParse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`)
        setStatus("error")
        return
      }

      if (!data.value || !Array.isArray(data.value)) {
        setError(`Response JSON does not have a "value" array. The API returned an unexpected shape.\n\nKeys found: ${Object.keys(data).join(", ")}`)
        setStatus("error")
        return
      }

      const mapped = data.value.map(mapDynamicsToProject)
      setFetched(mapped)

      const autoSelected = new Set<string>()
      for (const m of mapped) {
        autoSelected.add(m.dynamics.dynamicsId)
      }
      setSelected(autoSelected)
      setStatus("preview")
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Request timed out after 15 seconds. Dynamics may be unreachable from this network.\n\nCheck:\n- Are you on a VPN or corporate network that can reach theia.crm4.dynamics.com?\n- Is Dynamics 365 currently online?")
      } else if (err instanceof TypeError) {
        setError(`Network error (fetch failed) -- The browser could not connect to Dynamics at all.\n\nThis usually means:\n1. CORS: This app's domain is not allowed to call the Dynamics API. You may need to open this app from the same domain or use a proxy.\n2. DNS: theia.crm4.dynamics.com could not be resolved.\n3. Blocked: A browser extension, firewall, or CSP is blocking the request.\n\nTechnical: ${err.message}`)
      } else {
        setError(`Unexpected error: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`)
      }
      setStatus("error")
    }
  }, [])

  const handleImport = useCallback(() => {
    setStatus("importing")
    let created = 0
    let updated = 0

    const toCreate: Omit<Project, "id" | "color" | "createdAt" | "updatedAt">[] = []

    for (const dp of fetched) {
      if (!selected.has(dp.dynamics.dynamicsId)) continue

      const existing = existingDynamicsIds.get(dp.dynamics.dynamicsId)
      if (existing) {
        // Update existing project with latest Dynamics data
        onUpdateProject(existing.id, {
          name: dp.name,
          description: dp.description,
          startDate: dp.startDate,
          endDate: dp.endDate,
          dynamics: dp.dynamics,
        })
        updated++
      } else {
        toCreate.push({
          name: dp.name,
          description: dp.description,
          startDate: dp.startDate,
          endDate: dp.endDate,
          dynamics: dp.dynamics,
        })
        created++
      }
    }

    if (toCreate.length > 0) {
      onImportProjects(toCreate)
    }

    setImportResult({ created, updated })
    setStatus("done")
  }, [fetched, selected, existingDynamicsIds, onImportProjects, onUpdateProject])

  const handleClose = () => {
    setOpen(false)
    // Reset after animation
    setTimeout(() => {
      setStatus("idle")
      setError(null)
      setErrorCode(null)
      setFetched([])
      setSelected(new Set())
    }, 200)
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === fetched.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(fetched.map((f) => f.dynamics.dynamicsId)))
    }
  }

  const newCount = fetched.filter(
    (f) => selected.has(f.dynamics.dynamicsId) && !existingDynamicsIds.has(f.dynamics.dynamicsId)
  ).length
  const updateCount = fetched.filter(
    (f) => selected.has(f.dynamics.dynamicsId) && existingDynamicsIds.has(f.dynamics.dynamicsId)
  ).length

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            className="gap-2 bg-transparent"
            onClick={() => {
              setOpen(true)
              handleFetch()
            }}
          >
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">Sync Dynamics</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Import projects from Dynamics 365</TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-400" />
              Dynamics 365 Sync
            </DialogTitle>
          </DialogHeader>

          {/* FETCHING */}
          {status === "fetching" && (
            <div className="flex flex-col items-center gap-3 py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-accent" />
              <p className="text-sm text-muted-foreground">Fetching projects from Dynamics...</p>
            </div>
          )}

          {/* ERROR */}
          {status === "error" && (
            <div className="space-y-4 py-4">
              <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div className="space-y-2 min-w-0 flex-1">
                  {errorCode ? (
                    <p className="text-sm font-medium text-destructive">HTTP {errorCode}</p>
                  ) : (
                    <p className="text-sm font-medium text-destructive">Connection Failed</p>
                  )}
                  <pre className="whitespace-pre-wrap break-words text-sm text-foreground font-mono leading-relaxed">{error}</pre>
                  {(errorCode === 401 || errorCode === 403) && (
                    <a
                      href="https://theia.crm4.dynamics.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      Open Dynamics 365 to sign in <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Target:</span>
                <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] break-all">{DYNAMICS_API_URL}</code>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="ghost" onClick={handleClose}>
                  Cancel
                </Button>
                <Button onClick={handleFetch}>Retry</Button>
              </DialogFooter>
            </div>
          )}

          {/* PREVIEW */}
          {status === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Found <span className="font-medium text-foreground">{fetched.length}</span>{" "}
                  active project{fetched.length !== 1 ? "s" : ""} in Dynamics
                </p>
                <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs">
                  {selected.size === fetched.length ? "Deselect All" : "Select All"}
                </Button>
              </div>

              <ScrollArea className="h-[400px] pr-1">
                <div className="space-y-2">
                  {fetched.map((dp) => {
                    const isExisting = existingDynamicsIds.has(dp.dynamics.dynamicsId)
                    const isSelected = selected.has(dp.dynamics.dynamicsId)

                    return (
                      <button
                        key={dp.dynamics.dynamicsId}
                        onClick={() => toggleSelect(dp.dynamics.dynamicsId)}
                        className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                          isSelected
                            ? "border-accent/50 bg-accent/5"
                            : "border-border bg-secondary/30 opacity-60"
                        }`}
                      >
                        <div
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                            isSelected
                              ? "border-accent bg-accent text-accent-foreground"
                              : "border-muted-foreground/30"
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground truncate">{dp.name}</p>
                            {isExisting ? (
                              <span className="shrink-0 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                                Update
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                                New
                              </span>
                            )}
                          </div>
                          {dp.description && (
                            <p className="mt-0.5 text-xs text-muted-foreground truncate">
                              {dp.description}
                            </p>
                          )}
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                            <span>
                              {dp.startDate}
                              {dp.endDate ? ` - ${dp.endDate}` : ""}
                            </span>
                            {dp.dynamics.teamSize > 0 && (
                              <span>{dp.dynamics.teamSize} team members</span>
                            )}
                            {dp.dynamics.duration != null && (
                              <span>{dp.dynamics.duration} days</span>
                            )}
                            {dp.dynamics.progress > 0 && (
                              <span>{dp.dynamics.progress}% progress</span>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </ScrollArea>

              <DialogFooter className="gap-2 sm:gap-0">
                <div className="mr-auto text-xs text-muted-foreground">
                  {selected.size} selected
                  {newCount > 0 && (
                    <span className="text-emerald-400"> ({newCount} new)</span>
                  )}
                  {updateCount > 0 && (
                    <span className="text-blue-400"> ({updateCount} update)</span>
                  )}
                </div>
                <Button variant="ghost" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={selected.size === 0}
                  className="gap-2"
                >
                  <CloudDownload className="h-4 w-4" />
                  Import {selected.size} Project{selected.size !== 1 ? "s" : ""}
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* IMPORTING */}
          {status === "importing" && (
            <div className="flex flex-col items-center gap-3 py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-accent" />
              <p className="text-sm text-muted-foreground">Importing projects...</p>
            </div>
          )}

          {/* DONE */}
          {status === "done" && (
            <div className="space-y-4 py-4">
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
                  <Check className="h-6 w-6 text-emerald-400" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-foreground">Sync Complete</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {importResult.created > 0 && (
                      <span className="text-emerald-400">
                        {importResult.created} new project{importResult.created !== 1 ? "s" : ""} imported
                      </span>
                    )}
                    {importResult.created > 0 && importResult.updated > 0 && " and "}
                    {importResult.updated > 0 && (
                      <span className="text-blue-400">
                        {importResult.updated} project{importResult.updated !== 1 ? "s" : ""} updated
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleClose}>Done</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
