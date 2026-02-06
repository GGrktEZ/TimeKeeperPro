"use client"

import { useState, useMemo } from "react"
import { Search, FolderKanban, Filter } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ProjectForm } from "./project-form"
import { ProjectCard } from "./project-card"
import type { Project, DayEntry } from "@/lib/types"
import { isAfter, parseISO } from "date-fns"

type FilterOption = "all" | "active" | "completed" | "upcoming"

interface ProjectsViewProps {
  projects: Project[]
  entries: DayEntry[]
  onAddProject: (data: Omit<Project, "id" | "color" | "createdAt" | "updatedAt">) => void
  onUpdateProject: (id: string, data: Partial<Project>) => void
  onDeleteProject: (id: string) => void
}

export function ProjectsView({
  projects,
  entries,
  onAddProject,
  onUpdateProject,
  onDeleteProject,
}: ProjectsViewProps) {
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterOption>("all")

  const filteredProjects = useMemo(() => {
    let result = projects

    // Apply search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.description.toLowerCase().includes(searchLower)
      )
    }

    // Apply status filter
    if (filter !== "all") {
      const today = new Date()
      result = result.filter((p) => {
        const startDate = parseISO(p.startDate)
        const endDate = p.endDate ? parseISO(p.endDate) : null

        if (filter === "completed") {
          return endDate && isAfter(today, endDate)
        }
        if (filter === "upcoming") {
          return isAfter(startDate, today)
        }
        if (filter === "active") {
          return !isAfter(startDate, today) && (!endDate || !isAfter(today, endDate))
        }
        return true
      })
    }

    // Sort by most recently updated
    return result.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  }, [projects, search, filter])

  const stats = useMemo(() => {
    const today = new Date()
    return {
      total: projects.length,
      active: projects.filter((p) => {
        const startDate = parseISO(p.startDate)
        const endDate = p.endDate ? parseISO(p.endDate) : null
        return !isAfter(startDate, today) && (!endDate || !isAfter(today, endDate))
      }).length,
      completed: projects.filter((p) => {
        const endDate = p.endDate ? parseISO(p.endDate) : null
        return endDate && isAfter(today, endDate)
      }).length,
    }
  }, [projects])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Project Management</h2>
          <p className="text-sm text-muted-foreground">
            Manage and track all your projects in one place
          </p>
        </div>
        <ProjectForm onSubmit={onAddProject} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total Projects</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-2xl font-bold text-accent">{stats.active}</p>
          <p className="text-xs text-muted-foreground">Active</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-2xl font-bold text-muted-foreground">{stats.completed}</p>
          <p className="text-xs text-muted-foreground">Completed</p>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2 bg-transparent">
              <Filter className="h-4 w-4" />
              {filter === "all" ? "All Projects" : filter.charAt(0).toUpperCase() + filter.slice(1)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={filter} onValueChange={(v) => setFilter(v as FilterOption)}>
              <DropdownMenuRadioItem value="all">All Projects</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="active">Active</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="upcoming">Upcoming</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="completed">Completed</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-12 text-center">
          <FolderKanban className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium text-foreground">
            {projects.length === 0 ? "No projects yet" : "No projects found"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {projects.length === 0
              ? "Create your first project to get started"
              : "Try adjusting your search or filter criteria"}
          </p>
          {projects.length === 0 && (
            <div className="mt-4">
              <ProjectForm onSubmit={onAddProject} />
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              entries={entries}
              onUpdate={(data) => onUpdateProject(project.id, data)}
              onDelete={() => onDeleteProject(project.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
