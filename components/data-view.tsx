"use client"

import React, { useState, useRef, useMemo, useEffect, useCallback } from "react"
import {
  format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval,
  subWeeks, addWeeks, isSameWeek,
} from "date-fns"
import {
  Download,
  FileJson,
  Calendar,
  CalendarRange,
  Database,
  CheckCircle2,
  AlertCircle,
  X,
  Globe,
  ChevronLeft,
  ChevronRight,
  Send,
  Settings2,
  LogOut,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { DynamicsSync } from "./dynamics-sync"
import type { Project, DayEntry } from "@/lib/types"
import { exportDay, exportMonth, exportAll, downloadJson, type ExportedData } from "@/lib/export"
import {
  getCrmSettings, saveCrmSettings, signIn, signOut,
  tryRestoreSession, buildMergedEntries, syncToDataverse,
  type CrmSettings, type AuthState, type SyncResult,
} from "@/lib/crm-sync"


interface DataViewProps {
  selectedDate: string
  entries: DayEntry[]
  projects: Project[]
  currentEntry: DayEntry | undefined
  onImport: (data: { entries: DayEntry[]; projects: Project[] }) => void
  onImportProjects: (projects: Partial<Project>[]) => void
  onUpdateProject: (id: string, data: Partial<Project>) => void
}

export function DataView({
  selectedDate,
  entries,
  projects,
  currentEntry,
  onImport,
  onImportProjects,
  onUpdateProject,
}: DataViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = useState<{
    type: "success" | "error" | null
    message: string
  }>({ type: null, message: "" })

  // --- CRM Settings ---
  const [settings, setSettings] = useState<CrmSettings>(() => getCrmSettings())
  const [showSettings, setShowSettings] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  // --- Auth ---
  const [auth, setAuth] = useState<AuthState>({
    isAuthenticated: false, userName: null, userEmail: null,
  })
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  // --- Sync ---
  const today = useMemo(() => new Date(), [])
  const [selectedWeekStart, setSelectedWeekStart] = useState(() =>
    startOfWeek(today, { weekStartsOn: 1 })
  )
  const isCurrentWeek = isSameWeek(selectedWeekStart, today, { weekStartsOn: 1 })
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)

  // Try restore session on mount
  useEffect(() => {
    const s = getCrmSettings()
    if (s.clientId && s.tenantId) {
      tryRestoreSession(s).then(setAuth)
    }
  }, [])

  const handleSaveSettings = () => {
    saveCrmSettings(settings)
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
  }

  const handleSignIn = async () => {
    if (!settings.clientId || !settings.tenantId || !settings.orgUrl) {
      setAuthError("Please configure Client ID, Tenant ID, and Org URL first.")
      return
    }
    setAuthLoading(true)
    setAuthError(null)
    try {
      saveCrmSettings(settings)
      const result = await signIn(settings)
      setAuth(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign in failed"
      setAuthError(msg)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSignOut = async () => {
    setAuthLoading(true)
    try {
      await signOut(settings)
      setAuth({ isAuthenticated: false, userName: null, userEmail: null })
    } catch {
      // Force local state clear even if popup fails
      setAuth({ isAuthenticated: false, userName: null, userEmail: null })
    } finally {
      setAuthLoading(false)
    }
  }

  // Week entry count
  const weekEntries = useMemo(() => {
    const wsStart = selectedWeekStart
    const wsEnd = endOfWeek(wsStart, { weekStartsOn: 1 })
    const weekDays = eachDayOfInterval({ start: wsStart, end: wsEnd })
    const weekDates = weekDays.map((d) => format(d, "yyyy-MM-dd"))
    return buildMergedEntries({ entries, projects, weekDates })
  }, [entries, projects, selectedWeekStart])

  const handleSync = useCallback(async () => {
    if (!auth.isAuthenticated || weekEntries.length === 0) return
    setIsSyncing(true)
    setSyncResult(null)
    try {
      const wsStart = selectedWeekStart
      const wsEnd = endOfWeek(wsStart, { weekStartsOn: 1 })
      const weekDays = eachDayOfInterval({ start: wsStart, end: wsEnd })
      const weekDates = weekDays.map((d) => format(d, "yyyy-MM-dd"))
      const merged = buildMergedEntries({ entries, projects, weekDates })
      const result = await syncToDataverse(settings, merged)
      setSyncResult(result)
    } catch (err) {
      setSyncResult({
        success: false,
        message: err instanceof Error ? err.message : "Unknown error",
        created: 0,
        failed: 0,
        errors: [],
      })
    } finally {
      setIsSyncing(false)
    }
  }, [auth, weekEntries, selectedWeekStart, entries, projects, settings])

  // --- JSON exports ---
  const handleExportDay = () => {
    const data = exportDay(selectedDate, currentEntry, projects)
    downloadJson(data, `timetrack-${selectedDate}.json`)
  }

  const handleExportMonth = () => {
    const data = exportMonth(selectedDate, entries, projects)
    const monthStr = format(parseISO(selectedDate), "yyyy-MM")
    downloadJson(data, `timetrack-${monthStr}.json`)
  }

  const handleExportAll = () => {
    const data = exportAll(entries, projects)
    downloadJson(data, `timetrack-full-backup-${format(new Date(), "yyyy-MM-dd")}.json`)
  }

  // --- JSON import ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string
        const data = JSON.parse(content) as ExportedData

        if (!data.exportedAt || !data.entries) {
          throw new Error("Invalid file format")
        }

        const importedEntries: DayEntry[] = data.entries.map((entry, idx) => ({
          id: `imported-${Date.now()}-${idx}`,
          date: entry.date,
          clockIn: entry.clockIn,
          clockOut: entry.clockOut,
          lunchStart: entry.lunchStart,
          lunchEnd: entry.lunchEnd,
          breaks: (entry.breaks ?? []).map((b, bIdx) => ({
            id: `break-${Date.now()}-${idx}-${bIdx}`,
            start: b.start,
            end: b.end,
          })),
          locationBlocks: ((entry as Record<string, unknown>).locationBlocks as Array<Record<string, string>> ?? []).map((lb, lbIdx: number) => ({
            id: `loc-${Date.now()}-${idx}-${lbIdx}`,
            location: lb.location ?? "office",
            start: lb.start ?? "",
            end: lb.end ?? "",
          })),
          scheduleNotes: entry.scheduleNotes ?? "",
          projects: entry.projects.map((p, pIdx) => ({
            id: `proj-${Date.now()}-${idx}-${pIdx}`,
            projectId: "",
            projectName: p.name,
            notes: "",
            hoursWorked: p.hoursWorked,
            workSessions: (p.workSessions ?? []).map((s, sIdx) => ({
              id: `session-${Date.now()}-${idx}-${pIdx}-${sIdx}`,
              start: s.start,
              end: s.end,
              doneNotes: s.doneNotes ?? "",
              todoNotes: s.todoNotes ?? "",
            })),
          })),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }))

        const importedProjects: Project[] = []
        if (data.projects && Array.isArray(data.projects)) {
          data.projects.forEach((p) => {
            importedProjects.push({
              id: p.id || `proj-${Date.now()}-${Math.random().toString(36).substring(7)}`,
              name: p.name,
              description: p.description ?? "",
              startDate: p.startDate ?? format(new Date(), "yyyy-MM-dd"),
              endDate: p.endDate ?? null,
              color: p.color ?? "",
              tasks: (p as Record<string, unknown>).tasks as Project["tasks"] ?? [],
              createdAt: p.createdAt ?? new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
          })
        }

        onImport({ entries: importedEntries, projects: importedProjects })
        setImportStatus({
          type: "success",
          message: `Successfully imported ${importedEntries.length} day(s) of data`,
        })
      } catch {
        setImportStatus({
          type: "error",
          message: "Failed to parse file. Please ensure it's a valid TimeTrack export.",
        })
      }
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const settingsConfigured = settings.clientId && settings.tenantId && settings.orgUrl

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Database className="h-5 w-5 text-accent" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">Data Management</h2>
          <p className="text-sm text-muted-foreground">Import, export, and sync your time tracking data</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* JSON Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileJson className="h-4 w-4 text-accent" />
              JSON Data
            </CardTitle>
            <CardDescription>Backup and restore your TimeTrack data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Export */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Export</p>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={handleExportDay}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-secondary/50 p-2.5 text-left transition-colors hover:bg-secondary"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/20">
                    <Calendar className="h-4 w-4 text-accent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">Export Day</p>
                    <p className="text-[11px] text-muted-foreground">
                      {format(parseISO(selectedDate), "MMMM d, yyyy")}
                    </p>
                  </div>
                  <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>

                <button
                  type="button"
                  onClick={handleExportMonth}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-secondary/50 p-2.5 text-left transition-colors hover:bg-secondary"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/20">
                    <CalendarRange className="h-4 w-4 text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">Export Month</p>
                    <p className="text-[11px] text-muted-foreground">
                      {format(parseISO(selectedDate), "MMMM yyyy")}
                    </p>
                  </div>
                  <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>

                <button
                  type="button"
                  onClick={handleExportAll}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-secondary/50 p-2.5 text-left transition-colors hover:bg-secondary"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/20">
                    <Database className="h-4 w-4 text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">Full Backup</p>
                    <p className="text-[11px] text-muted-foreground">
                      {entries.length} days, {projects.length} projects
                    </p>
                  </div>
                  <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Import */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Import</p>

              {importStatus.type && (
                <div
                  className={`flex items-center gap-2 rounded-lg p-2.5 ${
                    importStatus.type === "success"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {importStatus.type === "success" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span className="flex-1 text-xs">{importStatus.message}</span>
                  <button
                    type="button"
                    onClick={() => setImportStatus({ type: null, message: "" })}
                    className="shrink-0 opacity-70 hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="import-file" className="text-xs text-muted-foreground">
                  Select a JSON file to import
                </Label>
                <Input
                  ref={fileInputRef}
                  id="import-file"
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileSelect}
                  className="cursor-pointer file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1 file:text-xs file:font-medium file:text-accent-foreground"
                />
              </div>

              <div className="rounded-lg border border-border bg-secondary/30 p-2.5">
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">Note:</span> Imported data merges with existing entries. Same-date entries are updated. New projects are created automatically.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dynamics 365 Section */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Globe className="h-4 w-4 text-blue-400" />
                  Dynamics 365
                </CardTitle>
                <CardDescription>
                  {auth.isAuthenticated
                    ? `Connected as ${auth.userName}`
                    : "Sign in to sync time entries to Dataverse"
                  }
                </CardDescription>
              </div>
              {auth.isAuthenticated && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-1.5 text-xs text-muted-foreground"
                  onClick={handleSignOut}
                  disabled={authLoading}
                >
                  {authLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
                  Sign out
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Auth section */}
            <div className="space-y-2">
              {authError && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-2.5">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  <p className="text-xs text-destructive">{authError}</p>
                  <button
                    type="button"
                    onClick={() => setAuthError(null)}
                    className="ml-auto shrink-0 text-destructive/70 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              {!auth.isAuthenticated && (
                <>
                  {/* Microsoft Sign In button -- branded style */}
                  <button
                    type="button"
                    onClick={handleSignIn}
                    disabled={authLoading || !settingsConfigured}
                    className="flex w-full items-center justify-center gap-3 rounded-md border border-[#8c8c8c] bg-white px-4 py-2.5 text-sm font-semibold text-[#5e5e5e] shadow-sm transition-colors hover:bg-[#f3f3f3] disabled:pointer-events-none disabled:opacity-50"
                  >
                    {authLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[#5e5e5e]" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 21 21">
                        <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                        <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                        <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                        <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                      </svg>
                    )}
                    Sign in with Microsoft
                  </button>

                  {!settingsConfigured && (
                    <p className="text-[11px] text-amber-400">
                      Configure your connection below to enable sign in.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Connection settings -- always visible when not signed in, collapsible when signed in */}
            {(!auth.isAuthenticated || showSettings) && (
              <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-xs font-medium text-foreground">Connection Settings</p>
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="client-id" className="text-[11px] text-muted-foreground">Client ID</Label>
                    <Input
                      id="client-id"
                      type="text"
                      value={settings.clientId}
                      onChange={(e) => setSettings((s) => ({ ...s, clientId: e.target.value }))}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="mt-1 h-8 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <Label htmlFor="tenant-id" className="text-[11px] text-muted-foreground">Tenant ID</Label>
                    <Input
                      id="tenant-id"
                      type="text"
                      value={settings.tenantId}
                      onChange={(e) => setSettings((s) => ({ ...s, tenantId: e.target.value }))}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="mt-1 h-8 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <Label htmlFor="org-url" className="text-[11px] text-muted-foreground">Dynamics 365 URL</Label>
                    <Input
                      id="org-url"
                      type="text"
                      value={settings.orgUrl}
                      onChange={(e) => setSettings((s) => ({ ...s, orgUrl: e.target.value }))}
                      placeholder="https://yourorg.crm4.dynamics.com"
                      className="mt-1 h-8 text-xs font-mono"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs"
                  onClick={handleSaveSettings}
                >
                  {settingsSaved ? (
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-accent" /> Saved
                    </span>
                  ) : "Save Settings"}
                </Button>
              </div>
            )}

            {/* When signed in, show a toggle for settings */}
            {auth.isAuthenticated && !showSettings && (
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Settings2 className="h-3 w-3" />
                Connection settings
              </button>
            )}
            {auth.isAuthenticated && showSettings && (
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
                Hide settings
              </button>
            )}

            {/* Import Projects */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Import Projects</p>
              <div className="rounded-lg border border-border bg-secondary/50 p-3">
                <p className="text-xs text-muted-foreground mb-3">
                  Paste project and task data from the Dynamics 365 API to sync projects into TimeTrack.
                </p>
                <DynamicsSync
                  projects={projects}
                  onImportProjects={onImportProjects}
                  onUpdateProject={onUpdateProject}
                />
              </div>
            </div>

            {/* Sync Time Entries */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sync Time Entries</p>
              <div className="rounded-lg border border-border bg-secondary/50 p-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Push weekly time entries directly to Dynamics 365 as draft time entries. Projects with Dynamics IDs are automatically linked.
                </p>

                {/* Week selector */}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-foreground">
                    <span className="font-medium">
                      {format(selectedWeekStart, "MMM d")}
                    </span>
                    <span className="text-muted-foreground"> &ndash; </span>
                    <span className="font-medium">
                      {format(endOfWeek(selectedWeekStart, { weekStartsOn: 1 }), "MMM d, yyyy")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {!isCurrentWeek && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setSelectedWeekStart(startOfWeek(today, { weekStartsOn: 1 }))}
                      >
                        This Week
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setSelectedWeekStart((prev) => subWeeks(prev, 1))}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      disabled={isCurrentWeek}
                      onClick={() => setSelectedWeekStart((prev) => addWeeks(prev, 1))}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Entry preview */}
                {weekEntries.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-background">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="px-2 py-1.5 text-left font-medium">Date</th>
                          <th className="px-2 py-1.5 text-left font-medium">Project</th>
                          <th className="px-2 py-1.5 text-left font-medium">Task</th>
                          <th className="px-2 py-1.5 text-right font-medium">Mins</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weekEntries.map((e, i) => (
                          <tr key={i} className="border-b border-border/50 last:border-0">
                            <td className="px-2 py-1 tabular-nums text-muted-foreground">{format(parseISO(e.date), "EEE d")}</td>
                            <td className="px-2 py-1 truncate max-w-[140px]">
                              <span className={e.dynamicsProjectId ? "text-foreground" : "text-amber-400"}>
                                {e.projectName}
                              </span>
                              {!e.dynamicsProjectId && (
                                <span className="ml-1 text-[10px] text-amber-400/70">(no CRM link)</span>
                              )}
                            </td>
                            <td className="px-2 py-1 text-muted-foreground truncate max-w-[100px]">{e.taskName || "--"}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{e.minutes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Sync result */}
                {syncResult && (
                  <div
                    className={`flex items-start gap-2 rounded-lg p-2.5 ${
                      syncResult.success
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {syncResult.success ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    )}
                    <div className="flex-1 space-y-1">
                      <p className="text-xs">{syncResult.message}</p>
                      {syncResult.errors.length > 0 && (
                        <details className="text-[10px]">
                          <summary className="cursor-pointer">Show {syncResult.errors.length} error(s)</summary>
                          <ul className="mt-1 space-y-0.5 font-mono">
                            {syncResult.errors.map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSyncResult(null)}
                      className="shrink-0 opacity-70 hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* Sync button */}
                <Button
                  className="w-full gap-2"
                  onClick={handleSync}
                  disabled={isSyncing || !auth.isAuthenticated || weekEntries.length === 0}
                >
                  {isSyncing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {isSyncing
                    ? "Syncing..."
                    : !auth.isAuthenticated
                      ? "Sign in to sync"
                      : weekEntries.length === 0
                        ? "No entries this week"
                        : `Sync ${weekEntries.length} ${weekEntries.length === 1 ? "entry" : "entries"} to Dynamics`
                  }
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
