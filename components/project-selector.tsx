"use client"

import { useState, useMemo } from "react"
import { Search, Plus, Check, ChevronLeft, ListTodo } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { Project, ProjectTask } from "@/lib/types"

interface ProjectSelectorProps {
  projects: Project[]
  selectedProjectIds: string[]
  onSelectProject: (projectId: string, taskId?: string) => void
}

export function ProjectSelector({
  projects,
  selectedProjectIds,
  onSelectProject,
}: ProjectSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  // Task picker state: when a project with tasks is clicked, show its tasks
  const [taskPickerProject, setTaskPickerProject] = useState<Project | null>(null)

  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects
    const searchLower = search.toLowerCase()
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(searchLower) ||
        p.description.toLowerCase().includes(searchLower)
    )
  }, [projects, search])

  const handleSelect = (project: Project) => {
    const tasks = project.tasks ?? []
    if (tasks.length > 0) {
      // Show task picker
      setTaskPickerProject(project)
    } else {
      onSelectProject(project.id)
      setOpen(false)
      resetState()
    }
  }

  const handleTaskSelect = (taskId?: string) => {
    if (!taskPickerProject) return
    onSelectProject(taskPickerProject.id, taskId)
    setOpen(false)
    resetState()
  }

  const resetState = () => {
    setSearch("")
    setTaskPickerProject(null)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetState() }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 bg-transparent">
          <Plus className="h-4 w-4" />
          Add Project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {taskPickerProject ? "Select Task" : "Select Project"}
          </DialogTitle>
        </DialogHeader>

        {/* Task picker view */}
        {taskPickerProject ? (
          <div className="flex flex-col min-h-0 gap-3 overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              className="self-start gap-1.5 text-xs text-muted-foreground"
              onClick={() => setTaskPickerProject(null)}
            >
              <ChevronLeft className="h-3 w-3" />
              Back to projects
            </Button>

            <div className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2 shrink-0">
              <div className={`h-3 w-3 rounded-full shrink-0 ${taskPickerProject.color}`} />
              <span className="text-sm font-medium text-foreground truncate">{taskPickerProject.name}</span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
              {/* Option: no specific task (general project work) */}
              <button
                onClick={() => handleTaskSelect(undefined)}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3 text-left transition-colors hover:bg-secondary"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">General project work</p>
                  <p className="text-xs text-muted-foreground">No specific task</p>
                </div>
              </button>

              {(taskPickerProject.tasks ?? []).map((task) => (
                <button
                  key={task.id}
                  onClick={() => handleTaskSelect(task.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3 text-left transition-colors hover:bg-secondary"
                >
                  <ListTodo className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{task.name}</p>
                    {task.description && (
                      <p className="text-xs text-muted-foreground truncate">{task.description}</p>
                    )}
                  </div>
                  {task.progress > 0 && (
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{Math.round(task.progress)}%</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Project list view */
          <div className="flex flex-col min-h-0 gap-3 overflow-hidden">
            <div className="relative shrink-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {filteredProjects.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {projects.length === 0
                    ? "No projects yet. Create one in the Projects tab."
                    : "No projects found matching your search."}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredProjects.map((project) => {
                    const isSelected = selectedProjectIds.includes(project.id)
                    const taskCount = project.tasks?.length ?? 0
                    return (
                      <button
                        key={project.id}
                        onClick={() => handleSelect(project)}
                        disabled={isSelected}
                        className="flex w-full items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3 text-left transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className={`h-3 w-3 rounded-full shrink-0 ${project.color}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {project.name}
                          </p>
                          {project.description && (
                            <p className="text-xs text-muted-foreground truncate">
                              {project.description}
                            </p>
                          )}
                        </div>
                        {taskCount > 0 && (
                          <span className="shrink-0 flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                            <ListTodo className="h-3 w-3" />
                            {taskCount}
                          </span>
                        )}
                        {isSelected && (
                          <Check className="h-4 w-4 text-accent shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
