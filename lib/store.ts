"use client"

import { useState, useEffect, useCallback } from "react"
import type { Project, DayEntry, DayProjectEntry, LocationBlock } from "./types"

const PROJECTS_KEY = "timetrack-projects"
const ENTRIES_KEY = "timetrack-entries"

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

// Generate a color from a smooth HSL hue gradient based on alphabetical position.
// Projects close alphabetically get similar hues.
// Hue range: 0-330 (skip deep magenta/red overlap at 330-360)
function getColorForAlphaPosition(index: number, total: number): string {
  if (total <= 1) return "hsl(160, 65%, 50%)"
  const hue = Math.round((index / (total - 1)) * 330)
  return `hsl(${hue}, 65%, 50%)`
}

// Reassign colors to all projects based on alphabetical sort order
function reassignColors(projects: Project[]): Project[] {
  const sorted = [...projects].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  )
  const colorMap = new Map<string, string>()
  sorted.forEach((p, i) => colorMap.set(p.id, getColorForAlphaPosition(i, sorted.length)))
  return projects.map((p) => ({ ...p, color: colorMap.get(p.id) ?? p.color }))
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(PROJECTS_KEY)
    if (stored) {
      try {
        const parsed: Project[] = JSON.parse(stored)
        // Migrate old projects that don't have tasks array
        const migrated = parsed.map((p) => ({
          ...p,
          tasks: p.tasks ?? [],
        }))
        setProjects(reassignColors(migrated))
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
        tasks: data.tasks ?? [],
        id: generateId(),
        color: "", // will be reassigned
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setProjects((prev) => reassignColors([...prev, newProject]))
      return newProject
    },
    []
  )

  const updateProject = useCallback((id: string, data: Partial<Project>) => {
    setProjects((prev) => {
      const updated = prev.map((p) =>
        p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p
      )
      // Reassign colors if name changed (alphabetical position may shift)
      return data.name !== undefined ? reassignColors(updated) : updated
    })
  }, [])

  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => reassignColors(prev.filter((p) => p.id !== id)))
  }, [])

  const getProject = useCallback(
    (id: string) => projects.find((p) => p.id === id),
    [projects]
  )

  const importProjects = useCallback((importedProjects: (Project | Omit<Project, "id" | "color" | "createdAt" | "updatedAt">)[]) => {
    setProjects((prev) => {
      const existingNames = new Map(prev.map((p) => [p.name.toLowerCase(), p]))
      const existingDynamicsIds = new Map(
        prev.filter((p) => p.dynamics?.dynamicsId).map((p) => [p.dynamics!.dynamicsId, p])
      )
      const newProjects = [...prev]
      
      for (const proj of importedProjects) {
        // Check by Dynamics ID first, then by name
        const dynamicsId = proj.dynamics?.dynamicsId
        const existingByDynamics = dynamicsId ? existingDynamicsIds.get(dynamicsId) : undefined
        const existing = existingByDynamics || existingNames.get(proj.name.toLowerCase())
        
        if (!existing) {
          // Add new project with proper color
          newProjects.push({
            ...proj,
            tasks: ("tasks" in proj ? proj.tasks : undefined) ?? [],
            id: ("id" in proj && proj.id) ? proj.id : generateId(),
            color: "", // will be reassigned
            createdAt: ("createdAt" in proj && proj.createdAt) ? proj.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        }
      }
      
      return reassignColors(newProjects)
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
