"use client"

import { useState, useCallback, useMemo } from "react"
import {
  RefreshCw, CloudDownload, Check, AlertTriangle,
  Globe, ClipboardPaste, ExternalLink, ChevronDown, ChevronRight, ListTodo,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { Project, DynamicsMetadata, ProjectTask } from "@/lib/types"
import { format, parseISO } from "date-fns"

const DYNAMICS_PROJECTS_URL =
  "https://theia.crm4.dynamics.com/api/data/v9.0/msdyn_projects?$filter=statuscode%20eq%201"
const DYNAMICS_TASKS_URL =
  "https://theia.crm4.dynamics.com/api/data/v9.0/msdyn_projecttasks?$select=msdyn_projecttaskid,msdyn_subject,msdyn_description,_msdyn_project_value,msdyn_scheduledstart,msdyn_scheduledend,msdyn_actualstart,msdyn_actualend,msdyn_progress,msdyn_effort,msdyn_effortcompleted,msdyn_effortremaining&$filter=statecode%20eq%200"

// ---- Dynamics raw types ----

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

interface DynamicsTask {
  msdyn_projecttaskid: string
  msdyn_subject: string
  msdyn_description: string | null
  _msdyn_project_value: string
  msdyn_scheduledstart: string | null
  msdyn_scheduledend: string | null
  msdyn_actualstart: string | null
  msdyn_actualend: string | null
  msdyn_progress: number
  msdyn_effort: number
  msdyn_effortcompleted: number
  msdyn_effortremaining: number
}

// ---- Mapped result ----

interface MappedProject {
  name: string
  description: string
  startDate: string
  endDate: string | null
  actualStart: string | null
  scheduledStart: string | null
  tasks: ProjectTask[]
  dynamics: DynamicsMetadata
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

function mapDynamicsToProject(dp: DynamicsProject, tasks: DynamicsTask[]): MappedProject {
  const actualStart = dp.msdyn_actualstart
  const scheduledStart = dp.msdyn_scheduledstart
  const start = actualStart ?? scheduledStart ?? dp.createdon
  const end = dp.msdyn_finish ?? dp.msdyn_scheduledend ?? dp.msdyn_actualend

  const projectTasks: ProjectTask[] = tasks
    .filter((t) => t._msdyn_project_value === dp.msdyn_projectid)
    .map((t) => ({
      id: generateId(),
      name: t.msdyn_subject,
      description: t.msdyn_description ?? "",
      dynamicsTaskId: t.msdyn_projecttaskid,
      scheduledStart: t.msdyn_scheduledstart,
      scheduledEnd: t.msdyn_scheduledend,
      actualStart: t.msdyn_actualstart,
      actualEnd: t.msdyn_actualend,
      progress: t.msdyn_progress ?? 0,
      effort: t.msdyn_effort ?? 0,
      effortCompleted: t.msdyn_effortcompleted ?? 0,
      effortRemaining: t.msdyn_effortremaining ?? 0,
    }))

  return {
    name: dp.msdyn_subject,
    description: dp.msdyn_description ?? "",
    startDate: start ? format(parseISO(start), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
    endDate: end ? format(parseISO(end), "yyyy-MM-dd") : null,
    actualStart: actualStart,
    scheduledStart: scheduledStart,
    tasks: projectTasks,
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

function formatDate(iso: string | null): string {
  if (!iso) return "--"
  try {
    return format(parseISO(iso), "MMM d, yyyy")
  } catch {
    return iso
  }
}

export function DynamicsSync({ projects, onImportProjects, onUpdateProject }: DynamicsSyncProps) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<SyncStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [projectsJson, setProjectsJson] = useState("")
  const [tasksJson, setTasksJson] = useState("")
  const [fetched, setFetched] = useState<MappedProject[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [importResult, setImportResult] = useState<{ created: number; updated: number }>({ created: 0, updated: 0 })

  const existingDynamicsIds = useMemo(
    () => new Map(projects.filter((p) => p.dynamics?.dynamicsId).map((p) => [p.dynamics!.dynamicsId, p])),
    [projects]
  )

  function parseODataArray(raw: string, label: string): unknown[] | null {
    const trimmed = raw.trim()
    if (!trimmed) return []

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch (e) {
      setError(`Invalid JSON in ${label}: ${e instanceof Error ? e.message : String(e)}`)
      return null
    }

    if (parsed && typeof parsed === "object" && "value" in parsed && Array.isArray((parsed as { value: unknown }).value)) {
      return (parsed as { value: unknown[] }).value
    }
    if (Array.isArray(parsed)) return parsed

    const keys = parsed && typeof parsed === "object" ? Object.keys(parsed).join(", ") : typeof parsed
    setError(`Expected a JSON object with a "value" array in ${label}.\n\nGot: ${keys}`)
    return null
  }

  const handleParse = useCallback(() => {
    setError(null)

    if (!projectsJson.trim()) {
      setError("Paste the Projects JSON first.")
      return
    }

    const projectArray = parseODataArray(projectsJson, "Projects") as DynamicsProject[] | null
    if (projectArray === null) return

    if (projectArray.length === 0) {
      setError("The Projects JSON contains 0 projects.")
      return
    }

    const first = projectArray[0]
    if (!first.msdyn_projectid || !first.msdyn_subject) {
      setError(`Doesn't look like Dynamics project data.\n\nFirst item keys: ${Object.keys(first).slice(0, 10).join(", ")}...`)
      return
    }

    // Tasks are optional
    let taskArray: DynamicsTask[] = []
    if (tasksJson.trim()) {
      const parsed = parseODataArray(tasksJson, "Tasks") as DynamicsTask[] | null
      if (parsed === null) return
      taskArray = parsed
    }

    try {
      const mapped = projectArray.map((dp) => mapDynamicsToProject(dp, taskArray))
      setFetched(mapped)
      setSelected(new Set(mapped.map((m) => m.dynamics.dynamicsId)))
      setStatus("preview")
    } catch (e) {
      setError(`Failed to map projects: ${e instanceof Error ? e.message : String(e)}`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectsJson, tasksJson])

  const handleImport = useCallback(() => {
    setStatus("importing")
    let created = 0
    let updated = 0
    const toCreate: Omit<Project, "id" | "color" | "createdAt" | "updatedAt">[] = []

    for (const dp of fetched) {
      if (!selected.has(dp.dynamics.dynamicsId)) continue
      const existing = existingDynamicsIds.get(dp.dynamics.dynamicsId)

      if (existing) {
        // UPDATE: merge Dynamics data but keep local data (time, color, etc.)
        // For tasks: merge -- keep existing tasks that aren't from Dynamics, update ones that are
        const existingTasks = existing.tasks ?? []
        const localOnlyTasks = existingTasks.filter((t) => !t.dynamicsTaskId)
        const mergedTasks = [...localOnlyTasks, ...dp.tasks]

        onUpdateProject(existing.id, {
          name: dp.name,
          description: dp.description,
          startDate: dp.startDate,
          endDate: dp.endDate,
          tasks: mergedTasks,
          dynamics: dp.dynamics,
        })
        updated++
      } else {
        toCreate.push({
          name: dp.name,
          description: dp.description,
          startDate: dp.startDate,
          endDate: dp.endDate,
          tasks: dp.tasks,
          dynamics: dp.dynamics,
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
      setProjectsJson("")
      setTasksJson("")
      setFetched([])
      setSelected(new Set())
      setExpandedProjects(new Set())
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

  const toggleExpand = (id: string) => {
    setExpandedProjects((prev) => {
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
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-400" />
              Dynamics 365 Sync
            </DialogTitle>
          </DialogHeader>

          {/* PASTE step */}
          {status === "paste" && (
            <div className="flex flex-col gap-4">
              {/* Projects JSON */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">
                    Projects JSON <span className="text-destructive">*</span>
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs text-accent"
                    onClick={() => window.open(DYNAMICS_PROJECTS_URL, "_blank")}
                  >
                    Open API URL <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
                <div
                  className={`relative flex items-center gap-3 rounded-md border px-3 py-3 cursor-text transition-colors ${
                    projectsJson ? "border-accent/50 bg-accent/5" : "border-input bg-transparent hover:border-accent/30"
                  }`}
                  onClick={() => document.getElementById("projects-paste-input")?.focus()}
                >
                  {/* Hidden input that captures paste */}
                  <textarea
                    id="projects-paste-input"
                    className="sr-only"
                    value=""
                    onChange={() => {}}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text")
                      if (text) { setProjectsJson(text); setError(null) }
                    }}
                  />
                  {projectsJson ? (
                    <>
                      <Check className="h-4 w-4 shrink-0 text-accent" />
                      <span className="text-sm text-foreground">
                        JSON pasted ({(projectsJson.length / 1024).toFixed(0)} KB)
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-6 text-xs text-muted-foreground"
                        onClick={(e) => { e.stopPropagation(); setProjectsJson("") }}
                      >
                        Clear
                      </Button>
                    </>
                  ) : (
                    <>
                      <ClipboardPaste className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Click here and paste (Ctrl+V / Cmd+V)</span>
                    </>
                  )}
                </div>
              </div>

              {/* Tasks JSON (optional) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">
                    Tasks JSON <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs text-accent"
                    onClick={() => window.open(DYNAMICS_TASKS_URL, "_blank")}
                  >
                    Open Tasks URL <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
                <div
                  className={`relative flex items-center gap-3 rounded-md border px-3 py-3 cursor-text transition-colors ${
                    tasksJson ? "border-violet-500/50 bg-violet-500/5" : "border-input bg-transparent hover:border-violet-500/30"
                  }`}
                  onClick={() => document.getElementById("tasks-paste-input")?.focus()}
                >
                  <textarea
                    id="tasks-paste-input"
                    className="sr-only"
                    value=""
                    onChange={() => {}}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text")
                      if (text) { setTasksJson(text); setError(null) }
                    }}
                  />
                  {tasksJson ? (
                    <>
                      <Check className="h-4 w-4 shrink-0 text-violet-400" />
                      <span className="text-sm text-foreground">
                        JSON pasted ({(tasksJson.length / 1024).toFixed(0)} KB)
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-6 text-xs text-muted-foreground"
                        onClick={(e) => { e.stopPropagation(); setTasksJson("") }}
                      >
                        Clear
                      </Button>
                    </>
                  ) : (
                    <>
                      <ClipboardPaste className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Click here and paste tasks (optional)</span>
                    </>
                  )}
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <pre className="whitespace-pre-wrap break-words text-xs text-foreground font-mono leading-relaxed overflow-hidden">{error}</pre>
                </div>
              )}

              <div className="rounded-lg bg-secondary/30 p-3 space-y-1.5">
                <p className="text-xs font-medium text-foreground">How to get the data</p>
                <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
                  <li>Click an &quot;Open URL&quot; link above (sign in to Dynamics if prompted)</li>
                  <li>Select all (Ctrl+A / Cmd+A), copy (Ctrl+C / Cmd+C)</li>
                  <li>Click the paste area above, then paste (Ctrl+V / Cmd+V)</li>
                  <li>Tasks are optional -- import projects first, tasks can be added later</li>
                </ol>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="ghost" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleParse} disabled={!projectsJson.trim()} className="gap-2">
                  <ClipboardPaste className="h-4 w-4" />
                  Parse JSON
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* PREVIEW */}
          {status === "preview" && (
            <div className="flex flex-col min-h-0 overflow-hidden flex-1">
              <div className="flex items-center justify-between shrink-0 pb-3">
                <p className="text-sm text-muted-foreground">
                  Found <span className="font-medium text-foreground">{fetched.length}</span>{" "}
                  project{fetched.length !== 1 ? "s" : ""}
                  {fetched.reduce((acc, f) => acc + f.tasks.length, 0) > 0 && (
                    <span>
                      {" "}with <span className="font-medium text-foreground">
                        {fetched.reduce((acc, f) => acc + f.tasks.length, 0)}
                      </span> tasks
                    </span>
                  )}
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

              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="space-y-2 pr-1">
                  {fetched.map((dp) => {
                    const isExisting = existingDynamicsIds.has(dp.dynamics.dynamicsId)
                    const isSelected = selected.has(dp.dynamics.dynamicsId)
                    const isExpanded = expandedProjects.has(dp.dynamics.dynamicsId)
                    const startLabel = dp.actualStart
                      ? `Started ${formatDate(dp.actualStart)}`
                      : dp.scheduledStart
                        ? `Planned ${formatDate(dp.scheduledStart)}`
                        : null

                    return (
                      <div
                        key={dp.dynamics.dynamicsId}
                        className={`rounded-lg border transition-colors ${
                          isSelected ? "border-accent/50 bg-accent/5" : "border-border bg-secondary/30 opacity-60"
                        }`}
                      >
                        <button
                          onClick={() => toggleSelect(dp.dynamics.dynamicsId)}
                          className="flex w-full items-start gap-3 p-3 text-left"
                        >
                          <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                            isSelected ? "border-accent bg-accent text-accent-foreground" : "border-muted-foreground/30"
                          }`}>
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-foreground">{dp.name}</p>
                              {isExisting ? (
                                <span className="shrink-0 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-400">Update</span>
                              ) : (
                                <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">New</span>
                              )}
                              {dp.tasks.length > 0 && (
                                <span className="shrink-0 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-400">
                                  {dp.tasks.length} task{dp.tasks.length !== 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                            {dp.description && (
                              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{dp.description}</p>
                            )}
                            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                              {startLabel && <span>{startLabel}</span>}
                              {dp.endDate && <span>End {formatDate(dp.endDate)}</span>}
                              {dp.dynamics.teamSize > 0 && <span>{dp.dynamics.teamSize} members</span>}
                              {dp.dynamics.progress > 0 && <span>{dp.dynamics.progress}% done</span>}
                            </div>
                          </div>
                        </button>

                        {/* Expandable tasks */}
                        {dp.tasks.length > 0 && (
                          <div className="border-t border-border/40">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleExpand(dp.dynamics.dynamicsId) }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              <ListTodo className="h-3 w-3" />
                              {dp.tasks.length} task{dp.tasks.length !== 1 ? "s" : ""}
                            </button>
                            {isExpanded && (
                              <div className="px-3 pb-2 space-y-1">
                                {dp.tasks.map((task) => (
                                  <div
                                    key={task.id}
                                    className="flex items-center justify-between rounded bg-background/50 px-2.5 py-1.5 text-xs"
                                  >
                                    <span className="text-foreground font-medium truncate">{task.name}</span>
                                    <div className="flex items-center gap-3 shrink-0 text-muted-foreground">
                                      {task.actualStart ? (
                                        <span>Started {formatDate(task.actualStart)}</span>
                                      ) : task.scheduledStart ? (
                                        <span className="italic">Planned {formatDate(task.scheduledStart)}</span>
                                      ) : null}
                                      {task.progress > 0 && <span>{task.progress}%</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="shrink-0 flex items-center justify-between border-t border-border pt-4 mt-4">
                <div className="text-xs text-muted-foreground">
                  {selected.size} selected
                  {newCount > 0 && <span className="text-emerald-400"> ({newCount} new)</span>}
                  {updateCount > 0 && <span className="text-blue-400"> ({updateCount} update)</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={handleClose}>Cancel</Button>
                  <Button onClick={handleImport} disabled={selected.size === 0} className="gap-2">
                    <CloudDownload className="h-4 w-4" />
                    Import {selected.size}
                  </Button>
                </div>
              </div>
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
