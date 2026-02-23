"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { format } from "date-fns"
import { Header } from "@/components/header"
import { DailyView } from "@/components/daily-view"
import { ProjectsView } from "@/components/projects-view"
import { StatsView } from "@/components/stats-view"
import { DataView } from "@/components/data-view"
import { UndoBar } from "@/components/undo-bar"
import { useProjects, useDayEntries } from "@/lib/store"
import { useUndo } from "@/lib/use-undo"
import type { View, DayEntry, DayProjectEntry, Project } from "@/lib/types"

export default function HomePage() {
  const [currentView, setCurrentView] = useState<View>("daily")
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), "yyyy-MM-dd"))

  const {
    projects,
    isLoaded: projectsLoaded,
    addProject,
    updateProject,
    deleteProject,
    importProjects,
    restoreProjects,
  } = useProjects()

  const {
    entries,
    isLoaded: entriesLoaded,
    getEntryForDate,
    createOrUpdateEntry,
    addProjectToDay,
    updateDayProject,
    removeDayProject,
    reorderDayProjects,
    importEntries,
    restoreEntries,
  } = useDayEntries()

  const {
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    pushSnapshot,
    undo,
    redo,
    setRestoreCallback,
  } = useUndo()

  // Register the restore callback once
  useEffect(() => {
    setRestoreCallback((entriesJson: string, projectsJson: string) => {
      restoreEntries(entriesJson)
      restoreProjects(projectsJson)
    })
  }, [setRestoreCallback, restoreEntries, restoreProjects])

  // Helper: snapshot before a destructive/significant action
  const isLoadedRef = useRef(false)
  useEffect(() => {
    if (projectsLoaded && entriesLoaded) {
      isLoadedRef.current = true
    }
  }, [projectsLoaded, entriesLoaded])

  const snapshot = useCallback(
    (label: string) => {
      if (!isLoadedRef.current) return
      pushSnapshot(label, JSON.stringify(entries), JSON.stringify(projects))
    },
    [entries, projects, pushSnapshot]
  )

  const currentEntry = getEntryForDate(selectedDate)

  const handleUpdateEntry = useCallback(
    (data: Partial<DayEntry>) => {
      createOrUpdateEntry(selectedDate, {
        ...data,
        projects: currentEntry?.projects,
      })
    },
    [selectedDate, currentEntry, createOrUpdateEntry]
  )

  const handleAddProjectToDay = useCallback(
    (projectId: string, _taskId?: string) => {
      snapshot("Add project to day")
      addProjectToDay(selectedDate, projectId)
    },
    [selectedDate, addProjectToDay, snapshot]
  )

  const handleUpdateDayProject = useCallback(
    (projectEntryId: string, data: Partial<DayProjectEntry>) => {
      updateDayProject(selectedDate, projectEntryId, data)
    },
    [selectedDate, updateDayProject]
  )

  const handleRemoveDayProject = useCallback(
    (projectEntryId: string) => {
      snapshot("Remove project from day")
      removeDayProject(selectedDate, projectEntryId)
    },
    [selectedDate, removeDayProject, snapshot]
  )

  const handleReorderProjects = useCallback(
    (fromIndex: number, toIndex: number) => {
      snapshot("Reorder projects")
      reorderDayProjects(selectedDate, fromIndex, toIndex)
    },
    [selectedDate, reorderDayProjects, snapshot]
  )

  // Wrapped project actions with snapshots
  const handleAddProject = useCallback(
    (data: Omit<Project, "id" | "color" | "createdAt" | "updatedAt">) => {
      snapshot("Create project")
      return addProject(data)
    },
    [addProject, snapshot]
  )

  const handleUpdateProject = useCallback(
    (id: string, data: Partial<Project>) => {
      snapshot("Edit project")
      updateProject(id, data)
    },
    [updateProject, snapshot]
  )

  const handleDeleteProject = useCallback(
    (id: string) => {
      snapshot("Delete project")
      deleteProject(id)
    },
    [deleteProject, snapshot]
  )

  const handleImport = useCallback(
    (data: { entries: DayEntry[]; projects: Project[] }) => {
      snapshot("Import data")
      if (data.projects.length > 0) {
        importProjects(data.projects)
      }
      
      const allProjects = [...projects, ...data.projects]
      const projectNameMap = new Map<string, string>()
      allProjects.forEach((p) => {
        projectNameMap.set(p.name.toLowerCase(), p.id)
      })
      
      if (data.entries.length > 0) {
        importEntries(data.entries, projectNameMap)
      }
    },
    [projects, importProjects, importEntries, snapshot]
  )

  // Snapshot on clock in/out and time changes
  const handleUpdateEntryWithSnapshot = useCallback(
    (data: Partial<DayEntry>) => {
      // Snapshot for significant time changes (clock, lunch, breaks)
      if (data.clockIn !== undefined || data.clockOut !== undefined) {
        snapshot("Update clock time")
      } else if (data.lunchStart !== undefined || data.lunchEnd !== undefined) {
        snapshot("Update lunch time")
      } else if (data.breaks !== undefined) {
        snapshot("Update break")
      }
      handleUpdateEntry(data)
    },
    [handleUpdateEntry, snapshot]
  )

  const isLoading = !projectsLoaded || !entriesLoaded

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading your data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header
        currentView={currentView}
        onViewChange={setCurrentView}
      />
      
      <main className="mx-auto max-w-7xl px-4 py-6">
        {currentView === "daily" ? (
          <DailyView
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            entry={currentEntry}
            entries={entries}
            projects={projects}
            onUpdateEntry={handleUpdateEntryWithSnapshot}
            onAddProject={handleAddProjectToDay}
            onUpdateProject={handleUpdateDayProject}
            onRemoveProject={handleRemoveDayProject}
            onReorderProjects={handleReorderProjects}
          />
        ) : currentView === "projects" ? (
          <ProjectsView
            projects={projects}
            entries={entries}
            onAddProject={handleAddProject}
            onUpdateProject={handleUpdateProject}
            onDeleteProject={handleDeleteProject}
          />
        ) : currentView === "stats" ? (
          <StatsView entries={entries} projects={projects} />
        ) : (
          <DataView
            selectedDate={selectedDate}
            entries={entries}
            projects={projects}
            currentEntry={currentEntry}
            onImport={handleImport}
            onImportProjects={importProjects}
            onUpdateProject={handleUpdateProject}
          />
        )}
      </main>

      <UndoBar
        canUndo={canUndo}
        canRedo={canRedo}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
        onUndo={undo}
        onRedo={redo}
      />
    </div>
  )
}
