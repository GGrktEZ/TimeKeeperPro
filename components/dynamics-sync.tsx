"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import {
  RefreshCw, CloudDownload, Check, AlertTriangle,
  Globe, Bookmark, Radio,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { Project, DynamicsMetadata } from "@/lib/types"
import { format, parseISO } from "date-fns"

const DYNAMICS_API_URL =
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

// ---- Generate bookmarklet code ----

function generateBookmarkletCode(targetOrigin: string): string {
  // The bookmarklet runs on the Dynamics domain (same-origin = no CORS).
  // It fetches the API, then opens a popup to our app and sends the data via postMessage.
  const code = `
(async()=>{
  try{
    document.title='[Syncing...] '+document.title;
    const r=await fetch('${DYNAMICS_API_URL}',{credentials:'include',headers:{Accept:'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0'}});
    if(!r.ok){alert('Dynamics API error: HTTP '+r.status+'\\n'+r.statusText);document.title=document.title.replace('[Syncing...] ','');return;}
    const d=await r.json();
    if(!d.value||!Array.isArray(d.value)){alert('Unexpected response shape. Keys: '+Object.keys(d).join(', '));document.title=document.title.replace('[Syncing...] ','');return;}
    const w=window.open('${targetOrigin}?dynamics-receive=1','TimeKeeperSync','width=700,height=500');
    if(!w){alert('Popup blocked! Allow popups for this site and try again.');document.title=document.title.replace('[Syncing...] ','');return;}
    let sent=false;
    const iv=setInterval(()=>{
      try{w.postMessage({type:'dynamics-projects',projects:d.value,count:d.value.length},'${targetOrigin}');}catch(e){}
    },300);
    window.addEventListener('message',(ev)=>{
      if(ev.origin==='${targetOrigin}'&&ev.data&&ev.data.type==='dynamics-ack'){
        clearInterval(iv);sent=true;
        document.title=document.title.replace('[Syncing...] ','');
      }
    });
    setTimeout(()=>{clearInterval(iv);if(!sent){document.title=document.title.replace('[Syncing...] ','');}},30000);
  }catch(e){alert('Bookmarklet error:\\n'+e.message);document.title=document.title.replace('[Syncing...] ','');}
})()`.trim().replace(/\n\s*/g, "")

  return `javascript:${encodeURIComponent(code)}`
}

// ---- Component ----

type SyncStatus = "idle" | "setup" | "waiting" | "preview" | "importing" | "done" | "error"

interface DynamicsSyncProps {
  projects: Project[]
  onImportProjects: (projects: Omit<Project, "id" | "color" | "createdAt" | "updatedAt">[]) => void
  onUpdateProject: (id: string, data: Partial<Project>) => void
}

export function DynamicsSync({ projects, onImportProjects, onUpdateProject }: DynamicsSyncProps) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<SyncStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [fetched, setFetched] = useState<ReturnType<typeof mapDynamicsToProject>[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importResult, setImportResult] = useState<{ created: number; updated: number }>({ created: 0, updated: 0 })
  const [bookmarkletHref, setBookmarkletHref] = useState("")
  const [bookmarkletSaved, setBookmarkletSaved] = useState(false)
  const listenerActive = useRef(false)

  // Check if bookmarklet was saved before
  useEffect(() => {
    setBookmarkletSaved(localStorage.getItem("dynamics-bookmarklet-saved") === "1")
  }, [])

  // Generate bookmarklet href on mount (needs window.location.origin)
  useEffect(() => {
    setBookmarkletHref(generateBookmarkletCode(window.location.origin))
  }, [])

  // Listen for postMessage from the bookmarklet
  useEffect(() => {
    function handleMessage(ev: MessageEvent) {
      if (!listenerActive.current) return
      // Accept from any origin since the bookmarklet opens our page as a popup
      if (ev.data?.type === "dynamics-projects" && Array.isArray(ev.data.projects)) {
        // Send ack back to the Dynamics tab
        if (ev.source && typeof (ev.source as Window).postMessage === "function") {
          try {
            (ev.source as Window).postMessage({ type: "dynamics-ack" }, "*")
          } catch { /* ignore */ }
        }

        try {
          const mapped = (ev.data.projects as DynamicsProject[]).map(mapDynamicsToProject)
          setFetched(mapped)
          setSelected(new Set(mapped.map((m) => m.dynamics.dynamicsId)))
          setStatus("preview")
        } catch (err) {
          setError(`Failed to parse Dynamics data:\n\n${err instanceof Error ? err.message : String(err)}`)
          setStatus("error")
        }
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [])

  // Also check URL params on mount -- if opened by bookmarklet as popup, start listening
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("dynamics-receive") === "1") {
      listenerActive.current = true
      setOpen(true)
      setStatus("waiting")
      // Clean up the URL param
      const url = new URL(window.location.href)
      url.searchParams.delete("dynamics-receive")
      window.history.replaceState({}, "", url.toString())
    }
  }, [])

  const existingDynamicsIds = new Map(
    projects.filter((p) => p.dynamics?.dynamicsId).map((p) => [p.dynamics!.dynamicsId, p])
  )

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
    listenerActive.current = false
    setTimeout(() => {
      setStatus("idle")
      setError(null)
      setFetched([])
      setSelected(new Set())
    }, 200)
  }

  const handleStartWaiting = () => {
    listenerActive.current = true
    setStatus("waiting")
  }

  const handleMarkBookmarkletSaved = () => {
    setBookmarkletSaved(true)
    localStorage.setItem("dynamics-bookmarklet-saved", "1")
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

  const handleOpen = () => {
    setOpen(true)
    if (bookmarkletSaved) {
      handleStartWaiting()
    } else {
      setStatus("setup")
    }
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" className="gap-2 bg-transparent" onClick={handleOpen}>
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

          {/* SETUP -- drag bookmarklet */}
          {status === "setup" && (
            <div className="space-y-5 py-2">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  One-time setup: drag this button to your bookmarks bar.
                </p>
                <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-accent/30 bg-accent/5 py-6">
                  {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
                  <a
                    href={bookmarkletHref}
                    onClick={(e) => e.preventDefault()}
                    draggable
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-md transition-transform hover:scale-105 active:scale-95 cursor-grab"
                  >
                    <Bookmark className="h-4 w-4" />
                    Sync to TimeKeeper
                  </a>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Drag the blue button above to your bookmarks bar
                </p>
              </div>

              <div className="space-y-2 rounded-lg bg-secondary/30 p-4">
                <p className="text-sm font-medium text-foreground">How it works</p>
                <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal list-inside">
                  <li>Drag the bookmarklet to your bookmarks bar (once)</li>
                  <li>Open <a href="https://theia.crm4.dynamics.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Dynamics 365</a> and sign in</li>
                  <li>Click the <span className="font-medium text-foreground">Sync to TimeKeeper</span> bookmark</li>
                  <li>Projects appear here for import</li>
                </ol>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  The bookmarklet fetches data directly from Dynamics using your existing browser session -- no extra login needed.
                </p>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="ghost" onClick={handleClose}>Cancel</Button>
                <Button
                  onClick={() => {
                    handleMarkBookmarkletSaved()
                    handleStartWaiting()
                  }}
                >
                  I saved it, continue
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* WAITING for bookmarklet data */}
          {status === "waiting" && (
            <div className="space-y-5 py-4">
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="relative">
                  <Radio className="h-10 w-10 text-accent" />
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
                  </span>
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-foreground">Waiting for data...</p>
                  <p className="text-xs text-muted-foreground">
                    Go to your Dynamics 365 tab and click the <span className="font-medium text-foreground">Sync to TimeKeeper</span> bookmarklet
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">
                  Not working? Make sure you are signed into Dynamics at{" "}
                  <a href="https://theia.crm4.dynamics.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    theia.crm4.dynamics.com
                  </a>{" "}
                  and allow popups if prompted.
                </p>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="ghost" size="sm" className="mr-auto text-xs" onClick={() => setStatus("setup")}>
                  Setup bookmarklet
                </Button>
                <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              </DialogFooter>
            </div>
          )}

          {/* ERROR */}
          {status === "error" && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                  <span className="text-sm font-medium text-destructive">Error</span>
                </div>
                <ScrollArea className="max-h-[300px]">
                  <pre className="whitespace-pre-wrap break-words text-xs text-foreground font-mono leading-relaxed">{error}</pre>
                </ScrollArea>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="ghost" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleStartWaiting}>Try Again</Button>
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
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
                  <Check className="h-6 w-6 text-emerald-400" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-foreground">Sync Complete</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {importResult.created > 0 && (
                      <span className="text-emerald-400">{importResult.created} imported</span>
                    )}
                    {importResult.created > 0 && importResult.updated > 0 && " and "}
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
