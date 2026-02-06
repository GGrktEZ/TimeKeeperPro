"use client"

import React from "react"

import { Trash2, FolderKanban, Clock, Plus, Play, Square, CheckCircle2, ListTodo, ChevronDown, ChevronUp, GripVertical } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProjectSelector } from "./project-selector"
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea"
import type { Project, DayProjectEntry, WorkSession } from "@/lib/types"
import { getCurrentTimeString } from "@/lib/utils"

interface DayProjectsProps {
  projects: Project[]
  dayProjects: DayProjectEntry[]
  onAddProject: (projectId: string) => void
  onUpdateProject: (projectEntryId: string, data: Partial<DayProjectEntry>) => void
  onRemoveProject: (projectEntryId: string) => void
  onReorderProjects: (fromIndex: number, toIndex: number) => void
  roundToFive: boolean
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

function timeStringToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function getCurrentTimeMinutes(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
}

function calculateSessionsMinutes(sessions: WorkSession[]): number {
  let totalMinutes = 0
  for (const session of sessions) {
    if (session.start && session.end) {
      const [sH, sM] = session.start.split(":").map(Number)
      const [eH, eM] = session.end.split(":").map(Number)
      const duration = (eH * 60 + eM) - (sH * 60 + sM)
      if (duration > 0) {
        totalMinutes += duration
      }
    }
  }
  return totalMinutes
}

function calculateLiveSessionsMinutes(sessions: WorkSession[]): number {
  let totalMinutes = 0
  for (const session of sessions) {
    if (session.start) {
      const startMin = timeStringToMinutes(session.start)
      let endMin: number
      
      if (session.end) {
        endMin = timeStringToMinutes(session.end)
      } else {
        // Active session - use current time
        endMin = getCurrentTimeMinutes()
      }
      
      const duration = endMin - startMin
      if (duration > 0) {
        totalMinutes += duration
      }
    }
  }
  return totalMinutes
}

function minutesToString(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.floor(minutes % 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function LiveSessionTimer({ session }: { session: WorkSession }) {
  const [currentTime, setCurrentTime] = useState(Date.now())
  const isActive = session.start && !session.end

  useEffect(() => {
    if (!isActive) return
    
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    
    return () => clearInterval(interval)
  }, [isActive])

  if (!session.start) return null

  void currentTime // Trigger re-render
  
  const startMin = timeStringToMinutes(session.start)
  const endMin = session.end ? timeStringToMinutes(session.end) : getCurrentTimeMinutes()
  const duration = Math.max(0, endMin - startMin)

  if (duration === 0 && !isActive) return null

  return (
    <span className={`shrink-0 text-xs tabular-nums ${isActive ? "font-medium text-green-400" : "text-muted-foreground"}`}>
      {minutesToString(duration)}
    </span>
  )
}

function LiveProjectTimer({ sessions }: { sessions: WorkSession[] }) {
  const [currentTime, setCurrentTime] = useState(Date.now())
  const hasActiveSession = sessions.some(s => s.start && !s.end)

  useEffect(() => {
    if (!hasActiveSession) return
    
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    
    return () => clearInterval(interval)
  }, [hasActiveSession])

  void currentTime // Trigger re-render
  
  const totalMinutes = hasActiveSession 
    ? calculateLiveSessionsMinutes(sessions) 
    : calculateSessionsMinutes(sessions)

  if (totalMinutes === 0) return null

  return (
    <span className={`rounded px-2 py-0.5 text-xs tabular-nums ${
      hasActiveSession ? "bg-green-500/20 font-medium text-green-400" : "bg-accent/20 text-accent"
    }`}>
      {minutesToString(totalMinutes)}
    </span>
  )
}

function WorkSessionItem({
  session,
  index,
  projectEntryId,
  sessions,
  onUpdate,
  roundToFive,
}: {
  session: WorkSession
  index: number
  projectEntryId: string
  sessions: WorkSession[]
  onUpdate: (projectEntryId: string, data: Partial<DayProjectEntry>) => void
  roundToFive: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isActive = session.start && !session.end

  const updateSession = (field: keyof WorkSession, value: string) => {
    const updatedSessions = sessions.map((s) =>
      s.id === session.id ? { ...s, [field]: value } : s
    )
    const totalMinutes = calculateSessionsMinutes(updatedSessions)
    const hoursWorked = Math.round((totalMinutes / 60) * 100) / 100
    onUpdate(projectEntryId, { workSessions: updatedSessions, hoursWorked })
  }

  const setCurrentTime = (field: 'start' | 'end') => {
    const timeString = getCurrentTimeString(roundToFive)
    updateSession(field, timeString)
  }

  const removeSession = () => {
    const updatedSessions = sessions.filter((s) => s.id !== session.id)
    const totalMinutes = calculateSessionsMinutes(updatedSessions)
    const hoursWorked = Math.round((totalMinutes / 60) * 100) / 100
    onUpdate(projectEntryId, { workSessions: updatedSessions, hoursWorked })
  }

  const hasNotes = (session.doneNotes && session.doneNotes.trim()) || (session.todoNotes && session.todoNotes.trim())

  return (
    <div
      className={`rounded-lg border ${
        isActive
          ? "border-green-500/50 bg-green-500/10"
          : "border-border/50 bg-background/30"
      }`}
    >
      {/* Session Header */}
      <div className="flex items-center gap-2 p-2">
        <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">
          {index + 1}.
        </span>
        <div className="grid flex-1 grid-cols-2 gap-2">
          <div className="flex gap-1">
            <Input
              type="time"
              value={session.start}
              onChange={(e) => updateSession("start", e.target.value)}
              className="h-8 text-sm"
              placeholder="Start"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentTime("start")}
              className="h-8 w-8 shrink-0"
              title="Set current time"
            >
              <Play className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex gap-1">
            <Input
              type="time"
              value={session.end}
              onChange={(e) => updateSession("end", e.target.value)}
              className="h-8 text-sm"
              placeholder="End"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentTime("end")}
              className="h-8 w-8 shrink-0"
              title="Set current time"
            >
              <Square className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <LiveSessionTimer session={session} />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsExpanded(!isExpanded)}
          className={`h-8 w-8 shrink-0 ${hasNotes ? "text-accent" : "text-muted-foreground"}`}
          title={isExpanded ? "Hide notes" : "Show notes"}
        >
          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={removeSession}
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
          title="Remove session"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Session Notes (Expandable) */}
      {isExpanded && (
        <div className="border-t border-border/30 p-3">
          <div className="grid gap-3 md:grid-cols-2">
            {/* Done Section */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Done
              </Label>
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5">
                <AutoResizeTextarea
                  placeholder="What did you complete in this session?"
                  value={session.doneNotes ?? ""}
                  onChange={(value) => updateSession("doneNotes", value)}
                  className="min-h-[80px] w-full resize-none border-0 bg-transparent px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0"
                />
              </div>
            </div>

            {/* To Do Section */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
                <ListTodo className="h-3 w-3" />
                To Do
              </Label>
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5">
                <AutoResizeTextarea
                  placeholder="What still needs to be done?"
                  value={session.todoNotes ?? ""}
                  onChange={(value) => updateSession("todoNotes", value)}
                  className="min-h-[80px] w-full resize-none border-0 bg-transparent px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function DayProjects({
  projects,
  dayProjects,
  onAddProject,
  onUpdateProject,
  onRemoveProject,
  onReorderProjects,
  roundToFive,
}: DayProjectsProps) {
  const getProject = (projectId: string) => projects.find((p) => p.id === projectId)
  const selectedProjectIds = dayProjects.map((dp) => dp.projectId)

  // Drag-and-drop state
  const dragItemIndex = useRef<number | null>(null)
  const dragOverIndex = useRef<number | null>(null)
  const [dragActiveIndex, setDragActiveIndex] = useState<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)

  const handleDragStart = (index: number) => {
    dragItemIndex.current = index
    setDragActiveIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    dragOverIndex.current = index
    setDropTargetIndex(index)
  }

  const handleDragEnd = () => {
    if (
      dragItemIndex.current !== null &&
      dragOverIndex.current !== null &&
      dragItemIndex.current !== dragOverIndex.current
    ) {
      onReorderProjects(dragItemIndex.current, dragOverIndex.current)
    }
    dragItemIndex.current = null
    dragOverIndex.current = null
    setDragActiveIndex(null)
    setDropTargetIndex(null)
  }

  const addWorkSession = (projectEntryId: string, currentSessions: WorkSession[]) => {
    const newSession: WorkSession = {
      id: generateId(),
      start: "",
      end: "",
      doneNotes: "",
      todoNotes: "",
    }
    onUpdateProject(projectEntryId, { workSessions: [...currentSessions, newSession] })
  }

  // Check if any session is currently active (has start but no end)
  const hasActiveSession = (sessions: WorkSession[]) => {
    return sessions.some(s => s.start && !s.end)
  }

  // Start a new session with current time
  const startNewSession = (projectEntryId: string, currentSessions: WorkSession[]) => {
    const timeString = getCurrentTimeString(roundToFive)
    const newSession: WorkSession = {
      id: generateId(),
      start: timeString,
      end: "",
      doneNotes: "",
      todoNotes: "",
    }
    onUpdateProject(projectEntryId, { workSessions: [...currentSessions, newSession] })
  }

  // End the active session
  const endActiveSession = (projectEntryId: string, currentSessions: WorkSession[]) => {
    const timeString = getCurrentTimeString(roundToFive)
    const updatedSessions = currentSessions.map((s) =>
      s.start && !s.end ? { ...s, end: timeString } : s
    )
    const totalMinutes = calculateSessionsMinutes(updatedSessions)
    const hoursWorked = Math.round((totalMinutes / 60) * 100) / 100
    onUpdateProject(projectEntryId, { workSessions: updatedSessions, hoursWorked })
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderKanban className="h-4 w-4 text-accent" />
            {"Today's Projects"}
          </CardTitle>
          <ProjectSelector
            projects={projects}
            selectedProjectIds={selectedProjectIds}
            onSelectProject={onAddProject}
          />
        </div>
      </CardHeader>
      <CardContent>
        {dayProjects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-secondary/30 py-8 text-center">
            <FolderKanban className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              No projects assigned to this day yet.
            </p>
            <p className="text-xs text-muted-foreground/70">
              Click "Add Project" to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {dayProjects.map((dayProject, index) => {
              const project = getProject(dayProject.projectId)
              if (!project) return null

              const sessions = dayProject.workSessions ?? []
              const isActive = hasActiveSession(sessions)
              const isDragging = dragActiveIndex === index
              const isDropTarget = dropTargetIndex === index && dragActiveIndex !== null && dragActiveIndex !== index

              return (
                <div
                  key={dayProject.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`rounded-lg border p-4 transition-all ${
                    isDragging
                      ? "border-accent/50 bg-accent/5 opacity-50"
                      : isDropTarget
                        ? "border-accent bg-accent/10"
                        : "border-border bg-secondary/30"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
                        title="Drag to reorder"
                      >
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <div className={`h-3 w-3 rounded-full ${project.color}`} />
                      <h4 className="font-medium text-foreground">{project.name}</h4>
                      <LiveProjectTimer sessions={sessions} />
                      {isActive && (
                        <span className="flex items-center gap-1 rounded bg-green-500/20 px-2 py-0.5 text-xs text-green-400">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                          Working
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveProject(dayProject.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Quick Start/Stop Buttons */}
                  <div className="mb-3 flex gap-2">
                    {!isActive ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startNewSession(dayProject.id, sessions)}
                        className="h-8 gap-1.5 bg-transparent text-xs"
                      >
                        <Play className="h-3 w-3" />
                        Start Working
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => endActiveSession(dayProject.id, sessions)}
                        className="h-8 gap-1.5 border-green-500/50 bg-green-500/10 text-xs text-green-400 hover:bg-green-500/20 hover:text-green-300"
                      >
                        <Square className="h-3 w-3" />
                        Stop Working
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => addWorkSession(dayProject.id, sessions)}
                      className="h-8 gap-1 text-xs"
                    >
                      <Plus className="h-3 w-3" />
                      Add Session
                    </Button>
                  </div>

                  {/* Work Sessions */}
                  {sessions.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Work Sessions
                        <span className="text-muted-foreground/60">
                          (click arrow to expand notes)
                        </span>
                      </Label>
                      {sessions.map((session, index) => (
                        <WorkSessionItem
                          key={session.id}
                          session={session}
                          index={index}
                          projectEntryId={dayProject.id}
                          sessions={sessions}
                          onUpdate={onUpdateProject}
                          roundToFive={roundToFive}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
