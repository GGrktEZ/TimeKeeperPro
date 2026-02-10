"use client"

import { useState, useCallback, useMemo } from "react"
import {
  RefreshCw, CloudDownload, Check, AlertTriangle,
  Globe, ClipboardPaste, ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { Project, DynamicsMetadata } from "@/lib/types"
import { format, parseISO } from "date-fns"

const DYNAMICS_URL =
  "https://theia.crm4.dynamics.com/api/data/v9.0/msdyn_projects?$filter=statuscode%20eq%201"

// ---- Dynamics types & mapper ----

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

// ---- Component ----

type SyncStatus = "idle" | "paste" | "preview" | "importing" | "done" | "error"

interface DynamicsSyncProps {
  projects: Project[]
  onImportProjects: (projects: Omit<Project, "id" | "color" | "createdAt" | "updatedAt">[]) => void
  onUpdateProject: (id: string, data: Partial<Project>) => void
}

export function DynamicsSync({ projects, onImportProjects, onUpdateProject }: DynamicsSyncProps) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<SyncStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [rawJson, setRawJson] = useState("")
  const [fetched, setFetched] = useState<ReturnType<typeof mapDynamicsToProject>[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importResult, setImportResult] = useState<{ created: number; updated: number }>({ created: 0, updated: 0 })

  const existingDynamicsIds = useMemo(
    () => new Map(projects.filter((p) => p.dynamics?.dynamicsId).map((p) => [p.dynamics!.dynamicsId, p])),
    [projects]
  )

  const handleParse = useCallback(() => {
    setError(null)
    const trimmed = rawJson.trim()
    if (!trimmed) {
      setError("Paste the JSON response first.")
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch (e) {
      setError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`)
      return
    }

    // Accept either { value: [...] } or a raw array [...]
    let projectArray: DynamicsProject[]
    if (
      parsed &&
      typeof parsed === "object" &&
      "value" in parsed &&
      Array.isArray((parsed as { value: unknown }).value)
    ) {
      projectArray = (parsed as { value: DynamicsProject[] }).value
    } else if (Array.isArray(parsed)) {
      projectArray = parsed as DynamicsProject[]
    } else {
      const keys = parsed && typeof parsed === "object" ? Object.keys(parsed).join(", ") : typeof parsed
      setError(`Expected a JSON object with a "value" array, or a plain array.\n\nGot: ${keys}`)
      return
    }

    if (projectArray.length === 0) {
      setError("The JSON contains 0 projects.")
      return
    }

    // Validate first entry has expected fields
    const first = projectArray[0]
    if (!first.msdyn_projectid || !first.msdyn_subject) {
      setError(
        `The data doesn't look like Dynamics project data.\n\nFirst item keys: ${Object.keys(first).slice(0, 10).join(", ")}...`
      )
      return
    }

    try {
      const mapped = projectArray.map(mapDynamicsToProject)
      setFetched(mapped)
      setSelected(new Set(mapped.map((m) => m.dynamics.dynamicsId)))
      setStatus("preview")
    } catch (e) {
      setError(`Failed to map projects: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [rawJson])

  const handleImport = useCallback(() => {
    setStatus("importing")
    let created = 0
    let updated = 0
    const toCreate: Omit<Project, "id" | "color" | "createdAt" | "updatedAt">[] = []

    for (const dp of fetched) {
      if (!selected.has(dp.dynamics.dynamicsId)) continue
      const existing = existingDynamicsIds.get(dp.dynamics.dynamicsId)
      if (existing) {
        onUpdateProject(existing.id, {
          name: dp.name, description: dp.description,
          startDate: dp.startDate, endDate: dp.endDate, dynamics: dp.dynamics,
        })
        updated++
      } else {
        toCreate.push({
          name: dp.name, description: dp.description,
          startDate: dp.startDate, endDate: dp.endDate, dynamics: dp.dynamics,
        })
        created++
      }
    }
    if (toCreate.length > 0) onImportProjects(toCreate)
    setImportResult({ created, updated })
    setStatus("done")
  }, [fetched, selected, existingDynamicsIds, onImportProjects, onUpdateProject])

  const handleClose = () => {
    setOpen(false)
    setTimeout(() => {
      setStatus("idle")
      setError(null)
      setRawJson("")
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
    if (selected.size === fetched.length) setSelected(new Set())
    else setSelected(new Set(fetched.map((f) => f.dynamics.dynamicsId)))
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
            onClick={() => { setOpen(true); setStatus("paste") }}
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

          {/* PASTE step */}
          {status === "paste" && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Paste the Dynamics API JSON response below.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs text-accent"
                    onClick={() => window.open(DYNAMICS_URL, "_blank")}
                  >
                    Open API URL <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
                <Textarea
                  placeholder='{"@odata.context":"...","value":[...]}'
                  value={rawJson}
                  onChange={(e) => { setRawJson(e.target.value); setError(null) }}
                  className="h-[200px] font-mono text-xs"
                />
                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <pre className="whitespace-pre-wrap break-words text-xs text-foreground font-mono leading-relaxed">{error}</pre>
                  </div>
                )}
              </div>

              <div className="rounded-lg bg-secondary/30 p-3 space-y-1.5">
                <p className="text-xs font-medium text-foreground">How to get the data</p>
                <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
                  <li>
                    Click{" "}
                    <button
                      onClick={() => window.open(DYNAMICS_URL, "_blank")}
                      className="text-accent hover:underline"
                    >
                      Open API URL
                    </button>
                    {" "}above (sign in to Dynamics if prompted)
                  </li>
                  <li>Select all the JSON in the page (Ctrl+A / Cmd+A)</li>
                  <li>Copy it (Ctrl+C / Cmd+C)</li>
                  <li>Paste it here (Ctrl+V / Cmd+V)</li>
                </ol>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="ghost" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleParse} disabled={!rawJson.trim()} className="gap-2">
                  <ClipboardPaste className="h-4 w-4" />
                  Parse JSON
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* PREVIEW */}
          {status === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Found <span className="font-medium text-foreground">{fetched.length}</span>{" "}
                  active project{fetched.length !== 1 ? "s" : ""}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setStatus("paste")} className="text-xs">
                    Back
                  </Button>
                  <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs">
                    {selected.size === fetched.length ? "Deselect All" : "Select All"}
                  </Button>
                </div>
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
                          isSelected ? "border-accent/50 bg-accent/5" : "border-border bg-secondary/30 opacity-60"
                        }`}
                      >
                        <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                          isSelected ? "border-accent bg-accent text-accent-foreground" : "border-muted-foreground/30"
                        }`}>
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground truncate">{dp.name}</p>
                            {isExisting ? (
                              <span className="shrink-0 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-400">Update</span>
                            ) : (
                              <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">New</span>
                            )}
                          </div>
                          {dp.description && (
                            <p className="mt-0.5 text-xs text-muted-foreground truncate">{dp.description}</p>
                          )}
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                            <span>{dp.startDate}{dp.endDate ? ` - ${dp.endDate}` : ""}</span>
                            {dp.dynamics.teamSize > 0 && <span>{dp.dynamics.teamSize} members</span>}
                            {dp.dynamics.duration != null && <span>{dp.dynamics.duration} days</span>}
                            {dp.dynamics.progress > 0 && <span>{dp.dynamics.progress}% done</span>}
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
                  {newCount > 0 && <span className="text-emerald-400"> ({newCount} new)</span>}
                  {updateCount > 0 && <span className="text-blue-400"> ({updateCount} update)</span>}
                </div>
                <Button variant="ghost" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleImport} disabled={selected.size === 0} className="gap-2">
                  <CloudDownload className="h-4 w-4" />
                  Import {selected.size}
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
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
                  <Check className="h-6 w-6 text-emerald-400" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-foreground">Import complete</p>
                  <p className="text-xs text-muted-foreground">
                    {importResult.created > 0 && (
                      <span className="text-emerald-400">{importResult.created} created</span>
                    )}
                    {importResult.created > 0 && importResult.updated > 0 && ", "}
                    {importResult.updated > 0 && (
                      <span className="text-blue-400">{importResult.updated} updated</span>
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
