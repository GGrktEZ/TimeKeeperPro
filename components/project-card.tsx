"use client"

import React from "react"

import { useState } from "react"
import { Calendar, Edit2, Trash2, MoreVertical, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ProjectForm } from "./project-form"
import { ProjectDetailDialog } from "./project-detail-dialog"
import { format, parseISO, differenceInDays, isAfter } from "date-fns"
import type { Project, DayEntry } from "@/lib/types"

interface ProjectCardProps {
  project: Project
  entries: DayEntry[]
  onUpdate: (data: Partial<Project>) => void
  onDelete: () => void
}

export function ProjectCard({ project, entries, onUpdate, onDelete }: ProjectCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  const startDate = parseISO(project.startDate)
  const endDate = project.endDate ? parseISO(project.endDate) : null
  const today = new Date()

  const getStatus = () => {
    if (endDate && isAfter(today, endDate)) {
      return { label: "Completed", className: "bg-muted text-muted-foreground" }
    }
    if (isAfter(startDate, today)) {
      return { label: "Upcoming", className: "bg-blue-500/20 text-blue-400" }
    }
    return { label: "Active", className: "bg-accent/20 text-accent" }
  }

  const getDuration = () => {
    if (!endDate) return "Ongoing"
    const days = differenceInDays(endDate, startDate) + 1
    if (days === 1) return "1 day"
    if (days < 7) return `${days} days`
    const weeks = Math.floor(days / 7)
    return weeks === 1 ? "1 week" : `${weeks} weeks`
  }

  // Calculate quick stats for the card
  const quickStats = (() => {
    let totalMinutes = 0
    let sessionsCount = 0
    
    for (const entry of entries) {
      const projectEntry = entry.projects.find(p => p.projectId === project.id)
      if (!projectEntry) continue
      
      const sessions = projectEntry.workSessions ?? []
      for (const session of sessions) {
        if (session.start && session.end) {
          const [sH, sM] = session.start.split(":").map(Number)
          const [eH, eM] = session.end.split(":").map(Number)
          const mins = Math.max(0, (eH * 60 + eM) - (sH * 60 + sM))
          totalMinutes += mins
          sessionsCount++
        }
      }
    }
    
    const hours = Math.floor(totalMinutes / 60)
    const mins = Math.round(totalMinutes % 60)
    const timeStr = hours > 0 ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`) : (mins > 0 ? `${mins}m` : "0h")
    
    return { timeStr, sessionsCount }
  })()

  const status = getStatus()

  const handleEdit = (data: Omit<Project, "id" | "color" | "createdAt" | "updatedAt">) => {
    onUpdate(data)
    setIsEditing(false)
  }

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't open details if clicking on dropdown or its children
    const target = e.target as HTMLElement
    if (target.closest('[data-dropdown-trigger]') || target.closest('[role="menu"]')) {
      return
    }
    setShowDetails(true)
  }

  return (
    <>
      <Card 
        className="group overflow-hidden transition-colors hover:bg-secondary/50 cursor-pointer"
        onClick={handleCardClick}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`h-4 w-4 rounded-full shrink-0 ${project.color}`} />
              <h3 className="font-semibold text-foreground truncate">{project.name}</h3>
              {project.dynamics && (
                <Globe className="h-3.5 w-3.5 shrink-0 text-blue-400" aria-label="Synced from Dynamics" />
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>
                {status.label}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    data-dropdown-trigger
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
                    <Edit2 className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => { e.stopPropagation(); setShowDeleteDialog(true); }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {project.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{project.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{format(startDate, "MMM d, yyyy")}</span>
              {endDate && (
                <>
                  <span>-</span>
                  <span>{format(endDate, "MMM d, yyyy")}</span>
                </>
              )}
            </div>
            <span className="text-muted-foreground/60">|</span>
            <span>{getDuration()}</span>
          </div>
          
          {/* Quick Stats */}
          <div className="flex items-center gap-3 pt-1 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-medium text-accent">{quickStats.timeStr}</span>
            </div>
            <span className="text-muted-foreground/40">|</span>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Sessions:</span>
              <span className="font-medium text-foreground">{quickStats.sessionsCount}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{project.name}"? This action cannot be undone.
              Daily entries that reference this project will lose the project association.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Project Form */}
      <ProjectForm
        project={project}
        onSubmit={handleEdit}
        onCancel={() => setIsEditing(false)}
        open={isEditing}
        onOpenChange={setIsEditing}
      />

      {/* Project Detail Dialog */}
      <ProjectDetailDialog
        project={project}
        entries={entries}
        open={showDetails}
        onOpenChange={setShowDetails}
      />
    </>
  )
}
