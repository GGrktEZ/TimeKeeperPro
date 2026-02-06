"use client"

import { useState, useMemo } from "react"
import { Search, Plus, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Project } from "@/lib/types"

interface ProjectSelectorProps {
  projects: Project[]
  selectedProjectIds: string[]
  onSelectProject: (projectId: string) => void
}

export function ProjectSelector({
  projects,
  selectedProjectIds,
  onSelectProject,
}: ProjectSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects
    const searchLower = search.toLowerCase()
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(searchLower) ||
        p.description.toLowerCase().includes(searchLower)
    )
  }, [projects, search])

  const handleSelect = (projectId: string) => {
    onSelectProject(projectId)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 bg-transparent">
          <Plus className="h-4 w-4" />
          Add Project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select Project</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <ScrollArea className="h-[300px]">
            {filteredProjects.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {projects.length === 0
                  ? "No projects yet. Create one in the Projects tab."
                  : "No projects found matching your search."}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredProjects.map((project) => {
                  const isSelected = selectedProjectIds.includes(project.id)
                  return (
                    <button
                      key={project.id}
                      onClick={() => handleSelect(project.id)}
                      disabled={isSelected}
                      className="flex w-full items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3 text-left transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className={`h-3 w-3 rounded-full ${project.color}`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {project.name}
                        </p>
                        {project.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {project.description}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-accent shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}
