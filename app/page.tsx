"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { format } from "date-fns"
import { Header } from "@/components/header"
import { DailyView } from "@/components/daily-view"
import { ProjectsView } from "@/components/projects-view"
import { StatsView } from "@/components/stats-view"
import { DataView } from "@/components/data-view"
import { TodosView } from "@/components/todos-view"
import { UndoBar } from "@/components/undo-bar"
import { useProjects, useDayEntries, useTodos } from "@/lib/store"
import { useUndo } from "@/lib/use-undo"
import type { View, DayEntry, DayProjectEntry, Project } from "@/lib/types"

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

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
    groups: todoGroups,
    addGroup,
    updateGroup,
    deleteGroup,
    addItem,
    updateItem,
    deleteItem,
  } = useTodos()

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

  const handleAutoWeekly = useCallback(() => {
    const interneAdminProject = projects.find(
      (project) => project.name.trim().toLowerCase() === "ip - interne admin"
    )
    if (!interneAdminProject) return

    snapshot("Auto add weekly meetings")

    const weeklySessions = [
      { start: "10:30", end: "11:00" },
      { start: "11:00", end: "11:30" },
    ]

    const existingProjects = currentEntry?.projects ?? []
    const existingInterneAdmin = existingProjects.find(
      (projectEntry) => projectEntry.projectId === interneAdminProject.id
    )

    const existingSessions = existingInterneAdmin?.workSessions ?? []
    const missingSessions = weeklySessions
      .filter(
        (weeklySession) =>
          !existingSessions.some(
            (session) =>
              session.start === weeklySession.start && session.end === weeklySession.end
          )
      )
      .map((session) => ({
        id: generateId(),
        start: session.start,
        end: session.end,
        doneNotes: "",
        todoNotes: "",
      }))

    const mergedSessions = [...existingSessions, ...missingSessions]
    const totalMinutes = mergedSessions.reduce((sum, session) => {
      if (!session.start || !session.end) return sum
      const [startHour, startMinute] = session.start.split(":").map(Number)
      const [endHour, endMinute] = session.end.split(":").map(Number)
      return sum + (endHour * 60 + endMinute) - (startHour * 60 + startMinute)
    }, 0)

    const interneAdminEntry: DayProjectEntry = existingInterneAdmin
      ? {
          ...existingInterneAdmin,
          notes: "30min weekly, 30min Dev Meeting",
          workSessions: mergedSessions,
          hoursWorked: Math.max(0, Math.round((totalMinutes / 60) * 100) / 100),
        }
      : {
          id: generateId(),
          projectId: interneAdminProject.id,
          notes: "30min weekly, 30min Dev Meeting",
          hoursWorked: Math.max(0, Math.round((totalMinutes / 60) * 100) / 100),
          workSessions: mergedSessions,
        }

    const updatedProjects = existingInterneAdmin
      ? existingProjects.map((projectEntry) =>
          projectEntry.id === existingInterneAdmin.id ? interneAdminEntry : projectEntry
        )
      : [...existingProjects, interneAdminEntry]

    createOrUpdateEntry(selectedDate, { projects: updatedProjects })
  }, [projects, currentEntry, snapshot, createOrUpdateEntry, selectedDate])

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
            todoGroups={todoGroups}
            onUpdateEntry={handleUpdateEntryWithSnapshot}
            onAddProject={handleAddProjectToDay}
            onAutoWeekly={handleAutoWeekly}
            onUpdateProject={handleUpdateDayProject}
            onRemoveProject={handleRemoveDayProject}
            onReorderProjects={handleReorderProjects}
            onUpdateTodoItem={updateItem}
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
        ) : currentView === "todos" ? (
          <TodosView
            groups={todoGroups}
            projects={projects}
            onAddGroup={addGroup}
            onUpdateGroup={updateGroup}
            onDeleteGroup={deleteGroup}
            onAddItem={addItem}
            onUpdateItem={updateItem}
            onDeleteItem={deleteItem}
          />
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
