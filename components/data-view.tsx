"use client"

import React, { useState, useRef, useMemo, useEffect, useCallback } from "react"
import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, subWeeks, addWeeks, isSameWeek } from "date-fns"
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
  Link,
  Copy,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { DynamicsSync } from "./dynamics-sync"
import type { Project, DayEntry } from "@/lib/types"
import { exportDay, exportMonth, exportAll, downloadJson, type ExportedData } from "@/lib/export"
import { buildCrmPayload, syncToCrm, getWebhookUrl, setWebhookUrl, POWER_AUTOMATE_SCHEMA } from "@/lib/crm-sync"


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
  const [importStatus, setImportStatus] = useState<{
    type: "success" | "error" | null
    message: string
  }>({ type: null, message: "" })
  const fileInputRef = useRef<HTMLInputElement>(null)

  // JSON exports
  const handleExportDay = () => {
    const data = exportDay(selectedDate, currentEntry, projects)
    const filename = `timetrack-${selectedDate}.json`
    downloadJson(data, filename)
  }

  const handleExportMonth = () => {
    const data = exportMonth(selectedDate, entries, projects)
    const monthStr = format(parseISO(selectedDate), "yyyy-MM")
    const filename = `timetrack-${monthStr}.json`
    downloadJson(data, filename)
  }

  const handleExportAll = () => {
    const data = exportAll(entries, projects)
    const filename = `timetrack-full-backup-${format(new Date(), "yyyy-MM-dd")}.json`
    downloadJson(data, filename)
  }

  // JSON import
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
          locationBlocks: ((entry as any).locationBlocks ?? []).map((lb: any, lbIdx: number) => ({
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
              tasks: (p as any).tasks ?? [],
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

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }



  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Database className="h-5 w-5 text-accent" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">Data Management</h2>
          <p className="text-sm text-muted-foreground">Import and export your time tracking data</p>
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
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-blue-400" />
              Dynamics 365
            </CardTitle>
            <CardDescription>Sync projects and export time entries for CRM</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Import from Dynamics */}
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


          </CardContent>
        </Card>
      </div>
    </div>
  )
}
