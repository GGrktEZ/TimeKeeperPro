"use client"

import React from "react"

import { useState, useRef } from "react"
import { format, parseISO } from "date-fns"
import {
  Download,
  Upload,
  FileJson,
  Calendar,
  CalendarRange,
  Database,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import type { Project, DayEntry } from "@/lib/types"
import { exportDay, exportMonth, exportAll, downloadJson, type ExportedData } from "@/lib/export"

interface DataManagementDialogProps {
  selectedDate: string
  entries: DayEntry[]
  projects: Project[]
  currentEntry: DayEntry | undefined
  onImport: (data: { entries: DayEntry[]; projects: Project[] }) => void
}

export function DataManagementDialog({
  selectedDate,
  entries,
  projects,
  currentEntry,
  onImport,
}: DataManagementDialogProps) {
  const [open, setOpen] = useState(false)
  const [importStatus, setImportStatus] = useState<{
    type: "success" | "error" | null
    message: string
  }>({ type: null, message: "" })
  const fileInputRef = useRef<HTMLInputElement>(null)

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

        // Convert exported data back to internal format
        const importedEntries: DayEntry[] = data.entries.map((entry, idx) => ({
          id: `imported-${Date.now()}-${idx}`,
          date: entry.date,
          attendance: (entry.attendance ?? []).map((a, aIdx) => ({
            id: `att-${Date.now()}-${idx}-${aIdx}`,
            start: a.start ?? "",
            end: a.end ?? "",
            location: a.location ?? "office",
          })),
          // Support legacy imports that still have clockIn/clockOut
          ...(entry.clockIn && !entry.attendance ? {
            clockIn: entry.clockIn,
            clockOut: entry.clockOut,
            homeOffice: entry.homeOffice ?? false,
          } : {}),
          lunchStart: entry.lunchStart,
          lunchEnd: entry.lunchEnd,
          breaks: (entry.breaks ?? []).map((b, bIdx) => ({
            id: `break-${Date.now()}-${idx}-${bIdx}`,
            start: b.start,
            end: b.end,
          })),
          scheduleNotes: entry.scheduleNotes ?? "",
          projects: entry.projects.map((p, pIdx) => ({
            id: `proj-${Date.now()}-${idx}-${pIdx}`,
            projectId: "", // Will be resolved by name
            projectName: p.name, // Store temporarily for matching
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

        // Extract unique project names from import and create projects if needed
        const projectNames = new Set<string>()
        data.entries.forEach((entry) => {
          entry.projects.forEach((p) => {
            if (p.name && p.name !== "Unknown Project") {
              projectNames.add(p.name)
            }
          })
        })

        // Also include projects from the data if it's a full backup
        const importedProjects: Project[] = []
        if (data.projects && Array.isArray(data.projects)) {
          data.projects.forEach((p) => {
            importedProjects.push({
              id: p.id || `proj-${Date.now()}-${Math.random().toString(36).substring(7)}`,
              name: p.name,
              description: p.description ?? "",
              startDate: p.startDate ?? format(new Date(), "yyyy-MM-dd"),
              endDate: p.endDate ?? null,
              color: p.color ?? "bg-emerald-500",
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
      } catch (err) {
        setImportStatus({
          type: "error",
          message: "Failed to parse file. Please ensure it's a valid TimeTrack export.",
        })
      }
    }
    reader.readAsText(file)

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const clearStatus = () => {
    setImportStatus({ type: null, message: "" })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) clearStatus() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-transparent">
          <Database className="h-4 w-4" />
          <span className="hidden sm:inline">Data</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-accent" />
            Data Management
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="export" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="export" className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </TabsTrigger>
            <TabsTrigger value="import" className="gap-2">
              <Upload className="h-4 w-4" />
              Import
            </TabsTrigger>
          </TabsList>

          <TabsContent value="export" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Export your time tracking data as JSON files for backup or analysis.
            </p>

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleExportDay}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3 text-left transition-colors hover:bg-secondary"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/20">
                  <Calendar className="h-5 w-5 text-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">Export Day</p>
                  <p className="text-xs text-muted-foreground">
                    {format(parseISO(selectedDate), "MMMM d, yyyy")}
                  </p>
                </div>
                <FileJson className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>

              <button
                type="button"
                onClick={handleExportMonth}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3 text-left transition-colors hover:bg-secondary"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/20">
                  <CalendarRange className="h-5 w-5 text-blue-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">Export Month</p>
                  <p className="text-xs text-muted-foreground">
                    {format(parseISO(selectedDate), "MMMM yyyy")}
                  </p>
                </div>
                <FileJson className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>

              <button
                type="button"
                onClick={handleExportAll}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3 text-left transition-colors hover:bg-secondary"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/20">
                  <Database className="h-5 w-5 text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">Full Backup</p>
                  <p className="text-xs text-muted-foreground">
                    All entries & projects ({entries.length} days, {projects.length} projects)
                  </p>
                </div>
                <FileJson className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </div>
          </TabsContent>

          <TabsContent value="import" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Import previously exported TimeTrack data. This will merge with your existing data.
            </p>

            {importStatus.type && (
              <div
                className={`flex items-center gap-2 rounded-lg p-3 ${
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
                <span className="flex-1 text-sm">{importStatus.message}</span>
                <button type="button" onClick={clearStatus} className="shrink-0 opacity-70 hover:opacity-100">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="import-file" className="text-sm text-muted-foreground">
                Select a JSON file to import
              </Label>
              <div className="flex gap-2">
                <Input
                  ref={fileInputRef}
                  id="import-file"
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileSelect}
                  className="flex-1 cursor-pointer file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1 file:text-sm file:font-medium file:text-accent-foreground"
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Note:</span> Imported data will be merged with your existing entries. 
                Entries for the same date will be updated with the imported data. 
                New projects will be created if they don't exist.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
