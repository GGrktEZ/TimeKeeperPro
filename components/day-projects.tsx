"use client"

import React from "react"

import { Trash2, FolderKanban, Clock, Plus, Play, Square, CheckCircle2, ListTodo, ChevronDown, ChevronUp, GripVertical, Check } from "lucide-react"
import { useState, useEffect, useRef, useCallback } from "react"
import { getDay, parseISO } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProjectSelector } from "./project-selector"
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Project, ProjectTask, DayProjectEntry, WorkSession, TodoGroup, TodoItem } from "@/lib/types"
import { finalizeTimeInput, normalizeTimeInput, timeDiffMinutes } from "@/lib/utils"

interface DayProjectsProps {
  projects: Project[]
  dayProjects: DayProjectEntry[]
  todoGroups: TodoGroup[]
  selectedDate: string
  onAddProject: (projectId: string, taskId?: string) => void
  onAutoWeekly: () => void
  onUpdateProject: (projectEntryId: string, data: Partial<DayProjectEntry>) => void
  onRemoveProject: (projectEntryId: string) => void
  onReorderProjects: (fromIndex: number, toIndex: number) => void
  onUpdateTodoItem: (groupId: string, itemId: string, data: Partial<TodoItem>) => void
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
      totalMinutes += timeDiffMinutes(session.start, session.end)
    }
  }
  return totalMinutes
}

function calculateLiveSessionsMinutes(sessions: WorkSession[]): number {
  let totalMinutes = 0
  for (const session of sessions) {
    if (session.start) {
      let endTime: string
      if (session.end) {
        endTime = session.end
      } else {
        const now = new Date()
        endTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
      }
      totalMinutes += timeDiffMinutes(session.start, endTime)
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

function getAssignedSessionIds(item: TodoItem): string[] {
  if (item.assignedSessionIds && item.assignedSessionIds.length > 0) {
    return item.assignedSessionIds
  }
  return item.sessionId ? [item.sessionId] : []
}

function getCompletedSessionId(item: TodoItem): string | undefined {
  return item.completedSessionId ?? item.sessionId
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
  assignedTodos,
  onDropTodo,
  onUpdate,
}: {
  session: WorkSession
  index: number
  projectEntryId: string
  sessions: WorkSession[]
  assignedTodos: TodoItem[]
  onDropTodo: (sessionId: string, payload: { groupId: string; itemId: string }) => void
  onUpdate: (projectEntryId: string, data: Partial<DayProjectEntry>) => void
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
    const now = new Date()
    const timeString = now.toTimeString().slice(0, 5)
    updateSession(field, timeString)
  }

  const removeSession = () => {
    const updatedSessions = sessions.filter((s) => s.id !== session.id)
    const totalMinutes = calculateSessionsMinutes(updatedSessions)
    const hoursWorked = Math.round((totalMinutes / 60) * 100) / 100
    onUpdate(projectEntryId, { workSessions: updatedSessions, hoursWorked })
  }

  const hasNotes = assignedTodos.length > 0 || (session.todoNotes && session.todoNotes.trim())

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
        <div className="w-auto shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-4 text-center">{index + 1}.</span>
          {session.taskName && (
            <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[11px] text-accent font-medium truncate max-w-[100px]" title={session.taskName}>
              {session.taskName}
            </span>
          )}
        </div>
          <div className="grid flex-1 grid-cols-2 gap-2">
          <div className="flex gap-1">
            <Input
              type="text"
              inputMode="numeric"
              value={session.start}
              onChange={(e) => updateSession("start", normalizeTimeInput(e.target.value))}
              onBlur={(e) => updateSession("start", finalizeTimeInput(e.target.value))}
              className="h-8 text-sm tabular-nums"
              placeholder="HH:MM"
              maxLength={5}
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
              type="text"
              inputMode="numeric"
              value={session.end}
              onChange={(e) => updateSession("end", normalizeTimeInput(e.target.value))}
              onBlur={(e) => updateSession("end", finalizeTimeInput(e.target.value))}
              className="h-8 text-sm tabular-nums"
              placeholder="HH:MM"
              maxLength={5}
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
            {/* Todos Done Section */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Todos Done
              </Label>
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 min-h-[80px] px-2.5 py-2">
                <div
                  className="min-h-[64px]"
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = "move"
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const raw = e.dataTransfer.getData("application/x-timekeeper-todo")
                    if (!raw) return
                    try {
                      const parsed = JSON.parse(raw) as { groupId: string; itemId: string }
                      if (!parsed.groupId || !parsed.itemId) return
                      onDropTodo(session.id, parsed)
                    } catch {
                      // Ignore malformed drag payloads.
                    }
                  }}
                >
                {assignedTodos.length === 0 ? (
                  <p className="text-xs text-muted-foreground/40">No todos assigned to this session.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {assignedTodos.map((todo) => (
                      <li key={todo.id} className="flex items-start gap-1.5 text-xs text-foreground">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0 mt-px" />
                        <span>{todo.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
                </div>
              </div>
            </div>

            {/* Notizen Section */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                Notizen
              </Label>
              <div className="rounded-md border border-border/50 bg-background/20">
                <AutoResizeTextarea
                  placeholder="Notizen…"
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
  todoGroups,
  selectedDate,
  onAddProject,
  onAutoWeekly,
  onUpdateProject,
  onRemoveProject,
  onReorderProjects,
  onUpdateTodoItem,
}: DayProjectsProps) {
  const getProject = (projectId: string) => projects.find((p) => p.id === projectId)
  const selectedProjectIds = dayProjects.map((dp) => dp.projectId)
  const isTuesday = getDay(parseISO(selectedDate)) === 2
  const hasInterneAdminProject = projects.some(
    (project) => project.name.trim().toLowerCase() === "ip - weekly"
  )

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

  // Start a new session with current time, optionally for a specific task
  const startNewSession = (projectEntryId: string, currentSessions: WorkSession[], task?: ProjectTask) => {
    const now = new Date()
    const timeString = now.toTimeString().slice(0, 5)
    const newSession: WorkSession = {
      id: generateId(),
      start: timeString,
      end: "",
      taskId: task?.id,
      taskName: task?.name,
      doneNotes: "",
      todoNotes: "",
    }
    onUpdateProject(projectEntryId, { workSessions: [...currentSessions, newSession] })
  }

  // End the active session
  const endActiveSession = (projectEntryId: string, currentSessions: WorkSession[]) => {
    const now = new Date()
    const timeString = now.toTimeString().slice(0, 5)
    const updatedSessions = currentSessions.map((s) =>
      s.start && !s.end ? { ...s, end: timeString } : s
    )
    const totalMinutes = calculateSessionsMinutes(updatedSessions)
    const hoursWorked = Math.round((totalMinutes / 60) * 100) / 100
    onUpdateProject(projectEntryId, { workSessions: updatedSessions, hoursWorked })
  }

  const assignTodoToSession = (
    groupId: string,
    item: TodoItem,
    session: WorkSession,
    completeInSession: boolean
  ) => {
    const assignedSessionIds = getAssignedSessionIds(item)
    const nextAssignedSessionIds = assignedSessionIds.includes(session.id)
      ? assignedSessionIds
      : [...assignedSessionIds, session.id]

    onUpdateTodoItem(groupId, item.id, {
      assignedSessionIds: nextAssignedSessionIds,
      done: completeInSession ? true : item.done,
      doneAt: completeInSession ? new Date().toISOString() : item.doneAt,
      completedSessionId: completeInSession
        ? session.id
        : (item.completedSessionId ?? item.sessionId),
      completedSessionSnapshot: completeInSession
        ? { date: selectedDate, start: session.start, end: session.end }
        : (item.completedSessionSnapshot ?? item.sessionSnapshot),
    })
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderKanban className="h-4 w-4 text-accent" />
            {"Today's Projects"}
          </CardTitle>
          <div className="flex items-center gap-2">
            {isTuesday && (
              <Button
                variant="outline"
                size="sm"
                onClick={onAutoWeekly}
                disabled={!hasInterneAdminProject}
                className="h-8 text-xs"
                title={!hasInterneAdminProject ? "Project 'IP - Weekly' not found" : undefined}
              >
                Auto Weekly
              </Button>
            )}
            <ProjectSelector
              projects={projects}
              selectedProjectIds={selectedProjectIds}
              onSelectProject={(projectId, taskId) => onAddProject(projectId, taskId)}
            />
          </div>
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
              const linkedTodoGroup = todoGroups.find((g) => g.projectId === project.id)

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
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />
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
                      (project.tasks?.length ?? 0) > 0 ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 bg-transparent text-xs"
                            >
                              <Play className="h-3 w-3" />
                              Start Working
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-64">
                            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                              Which task?
                            </DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => startNewSession(dayProject.id, sessions)}>
                              General work
                            </DropdownMenuItem>
                            {(project.tasks ?? []).map((task) => (
                              <DropdownMenuItem
                                key={task.id}
                                onClick={() => startNewSession(dayProject.id, sessions, task)}
                                className="gap-2"
                              >
                                <ListTodo className="h-3 w-3 shrink-0 text-muted-foreground" />
                                <span className="truncate">{task.name}</span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startNewSession(dayProject.id, sessions)}
                          className="h-8 gap-1.5 bg-transparent text-xs"
                        >
                          <Play className="h-3 w-3" />
                          Start Working
                        </Button>
                      )
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
                          assignedTodos={linkedTodoGroup ? linkedTodoGroup.items.filter((item) => getCompletedSessionId(item) === session.id) : []}
                          onDropTodo={(sessionId, payload) => {
                            if (!linkedTodoGroup || payload.groupId !== linkedTodoGroup.id) return
                            const targetSession = sessions.find((s) => s.id === sessionId)
                            const todo = linkedTodoGroup.items.find((i) => i.id === payload.itemId)
                            if (!targetSession || !todo) return
                            assignTodoToSession(linkedTodoGroup.id, todo, targetSession, true)
                          }}
                          onUpdate={onUpdateProject}
                        />
                      ))}
                    </div>
                  )}

                  {/* Linked Todos */}
                  {linkedTodoGroup && linkedTodoGroup.items.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <ListTodo className="h-3 w-3" />
                        Todos
                        <span className="text-muted-foreground/60">
                          ({linkedTodoGroup.items.filter(i => !i.done).length} open)
                        </span>
                      </Label>
                      <div className="rounded-md border border-border/50 bg-background/30 px-1 py-1 space-y-0.5">
                        {linkedTodoGroup.items.map((item) => {
                          const activeSession = sessions.find(s => s.start && !s.end)
                          const completedSessionId = getCompletedSessionId(item)
                          const completedSession = completedSessionId ? sessions.find(s => s.id === completedSessionId) : null
                          const completedSessionIndex = completedSessionId ? sessions.findIndex(s => s.id === completedSessionId) : -1
                          const assignedSessionIds = getAssignedSessionIds(item)
                          const assignedSessions = sessions.filter((s) => assignedSessionIds.includes(s.id))

                          const handleToggleDone = () => {
                            const nowDone = !item.done
                            const preferredCompletedSession = activeSession
                              ?? completedSession
                              ?? sessions.find((s) => assignedSessionIds.includes(s.id))
                            onUpdateTodoItem(linkedTodoGroup.id, item.id, {
                              done: nowDone,
                              doneAt: nowDone ? new Date().toISOString() : undefined,
                              completedSessionId: nowDone && preferredCompletedSession
                                ? preferredCompletedSession.id
                                : undefined,
                              completedSessionSnapshot: nowDone && preferredCompletedSession
                                ? { date: selectedDate, start: preferredCompletedSession.start, end: preferredCompletedSession.end }
                                : undefined,
                            })
                          }

                          return (
                            <div
                              key={item.id}
                              className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-secondary/50 group"
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData(
                                  "application/x-timekeeper-todo",
                                  JSON.stringify({ groupId: linkedTodoGroup.id, itemId: item.id })
                                )
                                e.dataTransfer.effectAllowed = "move"
                              }}
                            >
                              <button
                                onClick={handleToggleDone}
                                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                              >
                                {item.done
                                  ? <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                                  : <CheckCircle2 className="h-3.5 w-3.5 opacity-30" />
                                }
                              </button>
                              <span className={`text-xs flex-1 ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                {item.text}
                              </span>
                              {/* Session badge / picker */}
                              {item.done ? (
                                completedSession && (
                                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] tabular-nums bg-accent/20 text-accent">
                                    {`Done S${completedSessionIndex + 1} · ${completedSession.start}${completedSession.end ? `–${completedSession.end}` : ""}`}
                                  </span>
                                )
                              ) : (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] tabular-nums transition-colors ${
                                      assignedSessions.length > 0
                                        ? "bg-accent/20 text-accent hover:bg-accent/30"
                                        : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                                    }`}>
                                      {assignedSessions.length > 0
                                        ? `${assignedSessions.length} sessions`
                                        : "assign"
                                      }
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Assign sessions</DropdownMenuLabel>
                                    {sessions.filter(s => s.start).map((s, si) => (
                                      <DropdownMenuItem
                                        key={s.id}
                                        onClick={() => {
                                          const currentAssignedSessionIds = getAssignedSessionIds(item)
                                          const hasSession = currentAssignedSessionIds.includes(s.id)
                                          const nextAssignedSessionIds = hasSession
                                            ? currentAssignedSessionIds.filter((id) => id !== s.id)
                                            : [...currentAssignedSessionIds, s.id]
                                          onUpdateTodoItem(linkedTodoGroup.id, item.id, {
                                            assignedSessionIds: nextAssignedSessionIds,
                                          })
                                        }}
                                        className="gap-2 text-xs"
                                      >
                                        <span className="text-muted-foreground w-4">S{si + 1}</span>
                                        <span>{s.start}{s.end ? `–${s.end}` : " (active)"}</span>
                                        {assignedSessionIds.includes(s.id) && <Check className="h-3 w-3 ml-auto text-accent" />}
                                      </DropdownMenuItem>
                                    ))}
                                    {assignedSessionIds.length > 0 && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          onClick={() => onUpdateTodoItem(linkedTodoGroup.id, item.id, { assignedSessionIds: [] })}
                                          className="text-xs text-muted-foreground"
                                        >
                                          Clear assignments
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                    {sessions.filter(s => s.start).length === 0 && (
                                      <DropdownMenuItem disabled className="text-xs">No sessions yet</DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          )
                        })}
                      </div>
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
