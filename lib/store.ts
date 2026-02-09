"use client"

import { useState, useEffect, useCallback } from "react"
import type { Project, DayEntry, DayProjectEntry, LocationBlock } from "./types"

const PROJECTS_KEY = "timetrack-projects"
const ENTRIES_KEY = "timetrack-entries"

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

const PROJECT_COLORS = [
  "bg-emerald-500",
  "bg-blue-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-pink-500",
]

function getNextColor(existingProjects: Project[]): string {
  const usedColors = existingProjects.map((p) => p.color)
  const availableColors = PROJECT_COLORS.filter((c) => !usedColors.includes(c))
  if (availableColors.length > 0) {
    return availableColors[0]
  }
  return PROJECT_COLORS[existingProjects.length % PROJECT_COLORS.length]
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(PROJECTS_KEY)
    if (stored) {
      try {
        setProjects(JSON.parse(stored))
      } catch {
        setProjects([])
      }
    }
    setIsLoaded(true)
  }, [])

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
    }
  }, [projects, isLoaded])

  const addProject = useCallback(
    (data: Omit<Project, "id" | "color" | "createdAt" | "updatedAt">) => {
      const newProject: Project = {
        ...data,
        id: generateId(),
        color: getNextColor(projects),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setProjects((prev) => [...prev, newProject])
      return newProject
    },
    [projects]
  )

  const updateProject = useCallback((id: string, data: Partial<Project>) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p
      )
    )
  }, [])

  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const getProject = useCallback(
    (id: string) => projects.find((p) => p.id === id),
    [projects]
  )

  const importProjects = useCallback((importedProjects: Project[]) => {
    setProjects((prev) => {
      const existingNames = new Map(prev.map((p) => [p.name.toLowerCase(), p]))
      const newProjects = [...prev]
      
      for (const proj of importedProjects) {
        const existing = existingNames.get(proj.name.toLowerCase())
        if (!existing) {
          // Add new project with proper color
          newProjects.push({
            ...proj,
            id: proj.id || generateId(),
            color: proj.color || getNextColor(newProjects),
          })
        }
      }
      
      return newProjects
    })
  }, [])

  const restoreProjects = useCallback((json: string) => {
    try {
      setProjects(JSON.parse(json))
    } catch {
      // ignore
    }
  }, [])

  return {
    projects,
    isLoaded,
    addProject,
    updateProject,
    deleteProject,
    getProject,
    importProjects,
    restoreProjects,
  }
}

export function useDayEntries() {
  const [entries, setEntries] = useState<DayEntry[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(ENTRIES_KEY)
    if (stored) {
      try {
        const parsed: DayEntry[] = JSON.parse(stored)
        // Migrate old entries that don't have locationBlocks
        const migrated = parsed.map((e) => ({
          ...e,
          locationBlocks: e.locationBlocks ?? [],
        }))
        setEntries(migrated)
      } catch {
        setEntries([])
      }
    }
    setIsLoaded(true)
  }, [])

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries))
    }
  }, [entries, isLoaded])

  const getEntryForDate = useCallback(
    (date: string) => entries.find((e) => e.date === date),
    [entries]
  )

  const createOrUpdateEntry = useCallback(
    (date: string, data: Partial<Omit<DayEntry, "id" | "date" | "createdAt" | "updatedAt">>) => {
      setEntries((prev) => {
        const existing = prev.find((e) => e.date === date)
        if (existing) {
          return prev.map((e) =>
            e.date === date
              ? { ...e, ...data, updatedAt: new Date().toISOString() }
              : e
          )
        }
        const newEntry: DayEntry = {
          id: generateId(),
          date,
          clockIn: data.clockIn ?? null,
          clockOut: data.clockOut ?? null,
          lunchStart: data.lunchStart ?? null,
          lunchEnd: data.lunchEnd ?? null,
          breaks: data.breaks ?? [],
          locationBlocks: data.locationBlocks ?? [],
          scheduleNotes: data.scheduleNotes ?? "",
          projects: data.projects ?? [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        return [...prev, newEntry]
      })
    },
    []
  )

  const addProjectToDay = useCallback(
    (date: string, projectId: string) => {
      const entry = entries.find((e) => e.date === date)
      const existingProjects = entry?.projects ?? []
      
      if (existingProjects.some((p) => p.projectId === projectId)) {
        return
      }

      const newProjectEntry: DayProjectEntry = {
        id: generateId(),
        projectId,
        notes: "",
        hoursWorked: 0,
        workSessions: [],
      }

      createOrUpdateEntry(date, {
        projects: [...existingProjects, newProjectEntry],
      })
    },
    [entries, createOrUpdateEntry]
  )

  const updateDayProject = useCallback(
    (date: string, projectEntryId: string, data: Partial<DayProjectEntry>) => {
      setEntries((prev) =>
        prev.map((e) =>
          e.date === date
            ? {
                ...e,
                projects: e.projects.map((p) =>
                  p.id === projectEntryId ? { ...p, ...data } : p
                ),
                updatedAt: new Date().toISOString(),
              }
            : e
        )
      )
    },
    []
  )

  const removeDayProject = useCallback(
    (date: string, projectEntryId: string) => {
      setEntries((prev) =>
        prev.map((e) =>
          e.date === date
            ? {
                ...e,
                projects: e.projects.filter((p) => p.id !== projectEntryId),
                updatedAt: new Date().toISOString(),
              }
            : e
        )
      )
    },
    []
  )

  const reorderDayProjects = useCallback(
    (date: string, fromIndex: number, toIndex: number) => {
      setEntries((prev) =>
        prev.map((e) => {
          if (e.date !== date) return e
          const newProjects = [...e.projects]
          const [moved] = newProjects.splice(fromIndex, 1)
          newProjects.splice(toIndex, 0, moved)
          return { ...e, projects: newProjects, updatedAt: new Date().toISOString() }
        })
      )
    },
    []
  )

  const importEntries = useCallback((importedEntries: DayEntry[], projectNameMap: Map<string, string>) => {
    setEntries((prev) => {
      const existingDates = new Map(prev.map((e) => [e.date, e]))
      const result = [...prev]
      
      for (const entry of importedEntries) {
        // Map project names to IDs
        const mappedProjects = entry.projects.map((p) => {
          const projectId = projectNameMap.get((p as DayProjectEntry & { projectName?: string }).projectName?.toLowerCase() ?? "") || p.projectId
          return {
            ...p,
            projectId,
          }
        }).filter((p) => p.projectId) // Only keep projects that could be mapped
        
        const existingEntry = existingDates.get(entry.date)
        if (existingEntry) {
          // Merge with existing entry
          const idx = result.findIndex((e) => e.date === entry.date)
          if (idx !== -1) {
            result[idx] = {
              ...existingEntry,
              clockIn: entry.clockIn || existingEntry.clockIn,
              clockOut: entry.clockOut || existingEntry.clockOut,
              lunchStart: entry.lunchStart || existingEntry.lunchStart,
              lunchEnd: entry.lunchEnd || existingEntry.lunchEnd,
              breaks: entry.breaks.length > 0 ? entry.breaks : existingEntry.breaks,
              locationBlocks: (entry.locationBlocks ?? []).length > 0 ? entry.locationBlocks : (existingEntry.locationBlocks ?? []),
              scheduleNotes: entry.scheduleNotes || existingEntry.scheduleNotes,
              projects: mappedProjects.length > 0 ? mappedProjects : existingEntry.projects,
              updatedAt: new Date().toISOString(),
            }
          }
        } else {
          // Add new entry
          result.push({
            ...entry,
            locationBlocks: entry.locationBlocks ?? [],
            projects: mappedProjects,
          })
        }
      }
      
      return result
    })
  }, [])

  return {
    entries,
    isLoaded,
    getEntryForDate,
    createOrUpdateEntry,
    addProjectToDay,
    updateDayProject,
    removeDayProject,
    reorderDayProjects,
    importEntries,
    restoreEntries: useCallback((json: string) => {
      try {
        setEntries(JSON.parse(json))
      } catch {
        // ignore
      }
    }, []),
  }
}
