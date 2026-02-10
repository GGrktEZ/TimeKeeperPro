"use client"

import { useState, useCallback, useEffect } from "react"
import {
  RefreshCw, CloudDownload, Check, AlertTriangle, ExternalLink,
  Globe, LogIn, LogOut, Settings2, User,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { Project, DynamicsMetadata } from "@/lib/types"
import {
  getSavedMsalConfig, saveMsalConfig, clearMsalConfig,
  acquireDynamicsToken, logoutMsal, getActiveAccount,
  type MsalConfig,
} from "@/lib/msal"
import { format, parseISO } from "date-fns"
import type { AccountInfo } from "@azure/msal-browser"

const DYNAMICS_API_URL =
  "https://theia.crm4.dynamics.com/api/data/v9.0/msdyn_projects?$filter=statuscode%20eq%201"
const PROXY_URL = "/api/dynamics"

// ---- Dynamics types & mapper (unchanged) ----

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

// ---- Component ----

type SyncStatus = "idle" | "config" | "authenticating" | "fetching" | "preview" | "importing" | "done" | "error"

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
  const [importResult, setImportResult] = useState<{ created: number; updated: number }>({ created: 0, updated: 0 })

  // Auth state
  const [msalConfig, setMsalConfig] = useState<MsalConfig | null>(null)
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [configDraft, setConfigDraft] = useState({ clientId: "", tenantId: "" })
  const [showConfig, setShowConfig] = useState(false)

  // Load saved config on mount
  useEffect(() => {
    const saved = getSavedMsalConfig()
    if (saved) {
      setMsalConfig(saved)
      setConfigDraft({ clientId: saved.clientId, tenantId: saved.tenantId })
      // Check if we have a cached account
      getActiveAccount(saved).then(setAccount).catch(() => {})
    }
  }, [])

  const existingDynamicsIds = new Map(
    projects.filter((p) => p.dynamics?.dynamicsId).map((p) => [p.dynamics!.dynamicsId, p])
  )

  const handleSaveConfig = () => {
    if (!configDraft.clientId.trim() || !configDraft.tenantId.trim()) return
    const cfg: MsalConfig = {
      clientId: configDraft.clientId.trim(),
      tenantId: configDraft.tenantId.trim(),
    }
    saveMsalConfig(cfg)
    setMsalConfig(cfg)
    setShowConfig(false)
    setAccount(null) // Reset account since config changed
  }

  const handleSignIn = useCallback(async () => {
    if (!msalConfig) {
      setShowConfig(true)
      return
    }
    setStatus("authenticating")
    setError(null)
    try {
      const token = await acquireDynamicsToken(msalConfig)
      const acc = await getActiveAccount(msalConfig)
      setAccount(acc)
      // Immediately fetch after sign-in
      await fetchProjects(token)
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      setError(`Microsoft sign-in failed:\n\n${msg}`)
      setStatus("error")
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msalConfig])

  const handleSignOut = useCallback(async () => {
    if (!msalConfig) return
    try {
      await logoutMsal(msalConfig)
    } catch { /* ignore */ }
    setAccount(null)
  }, [msalConfig])

  const handleDisconnect = () => {
    clearMsalConfig()
    setMsalConfig(null)
    setAccount(null)
    setConfigDraft({ clientId: "", tenantId: "" })
  }

  const fetchProjects = useCallback(async (token: string) => {
    setStatus("fetching")
    setError(null)
    setErrorCode(null)

    try {
      // Use proxy to bypass CORS, passing the Bearer token
      const res = await fetch(PROXY_URL, {
        headers: {
          "X-Dynamics-Token": token,
        },
      })

      if (!res.ok) {
        setErrorCode(res.status)
        let body = ""
        try { body = await res.text() } catch { /* */ }

        let jsonMsg = ""
        try {
          const j = JSON.parse(body)
          jsonMsg = j?.error?.message || j?.Message || j?.message || ""
        } catch { /* */ }

        setError(`HTTP ${res.status}\n\n${jsonMsg || body?.slice(0, 500) || res.statusText}`)
        setStatus("error")
        return
      }

      let rawBody = ""
      let data: DynamicsApiResponse
      try {
        rawBody = await res.text()
        data = JSON.parse(rawBody)
      } catch (parseErr) {
        setError(`Response is not valid JSON.\n\nFirst 500 chars:\n${rawBody.slice(0, 500)}\n\n${parseErr instanceof Error ? parseErr.message : String(parseErr)}`)
        setStatus("error")
        return
      }

      if (!data.value || !Array.isArray(data.value)) {
        setError(`Response has no "value" array.\n\nKeys: ${Object.keys(data).join(", ")}\n\nFirst 500 chars:\n${rawBody.slice(0, 500)}`)
        setStatus("error")
        return
      }

      const mapped = data.value.map(mapDynamicsToProject)
      setFetched(mapped)
      setSelected(new Set(mapped.map((m) => m.dynamics.dynamicsId)))
      setStatus("preview")
    } catch (err) {
      setError(`Fetch failed:\n\n${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`)
      setStatus("error")
    }
  }, [])

  const handleFetch = useCallback(async () => {
    if (!msalConfig) {
      setShowConfig(true)
      return
    }
    setStatus("authenticating")
    setError(null)
    try {
      const token = await acquireDynamicsToken(msalConfig)
      const acc = await getActiveAccount(msalConfig)
      setAccount(acc)
      await fetchProjects(token)
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      setError(`Token acquisition failed:\n\n${msg}`)
      setStatus("error")
    }
  }, [msalConfig, fetchProjects])

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
    setShowConfig(false)
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
    if (!msalConfig) {
      setShowConfig(true)
    } else {
      handleFetch()
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
              {account && (
                <span className="ml-auto flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                  <User className="h-3 w-3" />
                  {account.username}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* CONFIG / SETUP */}
          {(showConfig || (status === "idle" && !msalConfig)) && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                To connect to Dynamics 365, you need an Azure AD App Registration with
                the <code className="rounded bg-secondary px-1 py-0.5 text-xs">Dynamics CRM user_impersonation</code> permission.
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="clientId" className="text-xs">Application (Client) ID</Label>
                  <Input
                    id="clientId"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    value={configDraft.clientId}
                    onChange={(e) => setConfigDraft((d) => ({ ...d, clientId: e.target.value }))}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tenantId" className="text-xs">Directory (Tenant) ID</Label>
                  <Input
                    id="tenantId"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    value={configDraft.tenantId}
                    onChange={(e) => setConfigDraft((d) => ({ ...d, tenantId: e.target.value }))}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                These are saved in your browser only. Find them in Azure Portal under App Registrations.
                Make sure <code className="rounded bg-secondary px-1 py-0.5 text-[11px]">Single-page application</code> redirect URI is set to <code className="rounded bg-secondary px-1 py-0.5 text-[11px]">{typeof window !== "undefined" ? window.location.origin : "your-app-url"}</code>.
              </p>
              <DialogFooter className="gap-2 sm:gap-0">
                {msalConfig && (
                  <Button variant="ghost" size="sm" className="mr-auto text-xs text-destructive" onClick={handleDisconnect}>
                    Disconnect
                  </Button>
                )}
                <Button variant="ghost" onClick={handleClose}>Cancel</Button>
                <Button
                  onClick={handleSaveConfig}
                  disabled={!configDraft.clientId.trim() || !configDraft.tenantId.trim()}
                >
                  Save & Connect
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* AUTHENTICATING */}
          {status === "authenticating" && (
            <div className="flex flex-col items-center gap-3 py-12">
              <LogIn className="h-8 w-8 animate-pulse text-blue-400" />
              <p className="text-sm text-muted-foreground">Signing in with Microsoft...</p>
              <p className="text-xs text-muted-foreground">A popup window should appear. Complete the sign-in there.</p>
            </div>
          )}

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
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                  <span className="text-sm font-medium text-destructive">
                    {errorCode ? `HTTP ${errorCode}` : "Error"}
                  </span>
                </div>
                <ScrollArea className="max-h-[300px]">
                  <pre className="whitespace-pre-wrap break-words text-xs text-foreground font-mono leading-relaxed">{error}</pre>
                </ScrollArea>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="ghost" size="sm" className="mr-auto gap-1 text-xs" onClick={() => setShowConfig(true)}>
                  <Settings2 className="h-3 w-3" /> Config
                </Button>
                <Button variant="ghost" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleFetch}>Retry</Button>
              </DialogFooter>
            </div>
          )}

          {/* PREVIEW */}
          {status === "preview" && !showConfig && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Found <span className="font-medium text-foreground">{fetched.length}</span>{" "}
                  active project{fetched.length !== 1 ? "s" : ""}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowConfig(true)} className="gap-1 text-xs text-muted-foreground">
                    <Settings2 className="h-3 w-3" />
                  </Button>
                  {account && (
                    <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-1 text-xs text-muted-foreground">
                      <LogOut className="h-3 w-3" /> Sign Out
                    </Button>
                  )}
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
