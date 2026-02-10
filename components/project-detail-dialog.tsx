"use client"

import { useMemo } from "react"
import { Calendar, Clock, TrendingUp, BarChart3, CalendarDays, Timer, Hash, Globe, ListTodo } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { format, parseISO, differenceInDays, isAfter, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns"
import type { Project, DayEntry, WorkSession } from "@/lib/types"

interface ProjectDetailDialogProps {
  project: Project
  entries: DayEntry[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

function minutesToHoursString(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function calculateSessionMinutes(session: WorkSession): number {
  if (!session.start || !session.end) return 0
  const [sH, sM] = session.start.split(":").map(Number)
  const [eH, eM] = session.end.split(":").map(Number)
  return Math.max(0, (eH * 60 + eM) - (sH * 60 + sM))
}

export function ProjectDetailDialog({ project, entries, open, onOpenChange }: ProjectDetailDialogProps) {
  const stats = useMemo(() => {
    const today = new Date()
    const thisWeekStart = startOfWeek(today, { weekStartsOn: 1 })
    const thisWeekEnd = endOfWeek(today, { weekStartsOn: 1 })
    const thisMonthStart = startOfMonth(today)
    const thisMonthEnd = endOfMonth(today)

    let totalMinutes = 0
    let totalSessions = 0
    let daysWorked = 0
    let thisWeekMinutes = 0
    let thisMonthMinutes = 0
    const dailyMinutes: { date: string; minutes: number }[] = []
    const weekdayMinutes: Record<string, number> = {
      Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0, Sunday: 0
    }
    let firstWorkedDate: string | null = null
    let lastWorkedDate: string | null = null
    let longestSession = 0
    let shortestSession = Infinity

    for (const entry of entries) {
      const projectEntry = entry.projects.find(p => p.projectId === project.id)
      if (!projectEntry) continue

      const sessions = projectEntry.workSessions ?? []
      const completedSessions = sessions.filter(s => s.start && s.end)
      
      if (completedSessions.length === 0) continue

      daysWorked++
      const entryDate = parseISO(entry.date)
      const dayOfWeek = format(entryDate, "EEEE")
      
      if (!firstWorkedDate || entry.date < firstWorkedDate) {
        firstWorkedDate = entry.date
      }
      if (!lastWorkedDate || entry.date > lastWorkedDate) {
        lastWorkedDate = entry.date
      }

      let dayMinutes = 0
      for (const session of completedSessions) {
        const sessionMins = calculateSessionMinutes(session)
        dayMinutes += sessionMins
        totalSessions++
        
        if (sessionMins > longestSession) longestSession = sessionMins
        if (sessionMins < shortestSession && sessionMins > 0) shortestSession = sessionMins
      }

      totalMinutes += dayMinutes
      weekdayMinutes[dayOfWeek] += dayMinutes
      dailyMinutes.push({ date: entry.date, minutes: dayMinutes })

      if (isWithinInterval(entryDate, { start: thisWeekStart, end: thisWeekEnd })) {
        thisWeekMinutes += dayMinutes
      }
      if (isWithinInterval(entryDate, { start: thisMonthStart, end: thisMonthEnd })) {
        thisMonthMinutes += dayMinutes
      }
    }

    const avgMinutesPerDay = daysWorked > 0 ? totalMinutes / daysWorked : 0
    const avgMinutesPerSession = totalSessions > 0 ? totalMinutes / totalSessions : 0
    
    // Find most productive day of week
    const mostProductiveDay = Object.entries(weekdayMinutes)
      .filter(([, mins]) => mins > 0)
      .sort((a, b) => b[1] - a[1])[0]

    // Recent activity (last 7 days with work)
    const recentActivity = dailyMinutes
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 7)

    return {
      totalMinutes,
      totalSessions,
      daysWorked,
      thisWeekMinutes,
      thisMonthMinutes,
      avgMinutesPerDay,
      avgMinutesPerSession,
      firstWorkedDate,
      lastWorkedDate,
      longestSession: longestSession > 0 ? longestSession : 0,
      shortestSession: shortestSession < Infinity ? shortestSession : 0,
      mostProductiveDay: mostProductiveDay ? { day: mostProductiveDay[0], minutes: mostProductiveDay[1] } : null,
      recentActivity,
    }
  }, [project.id, entries])

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

  const status = getStatus()

  const getDuration = () => {
    if (!endDate) return "Ongoing"
    const days = differenceInDays(endDate, startDate) + 1
    if (days === 1) return "1 day"
    if (days < 7) return `${days} days`
    const weeks = Math.floor(days / 7)
    return weeks === 1 ? "1 week" : `${weeks} weeks`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`h-5 w-5 rounded-full shrink-0 ${project.color}`} />
            <DialogTitle className="text-xl">{project.name}</DialogTitle>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>
              {status.label}
            </span>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-120px)] pr-4">
          <div className="space-y-6">
            {/* Project Info */}
            {project.description && (
              <p className="text-sm text-muted-foreground">{project.description}</p>
            )}
            
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                <span>{format(startDate, "MMM d, yyyy")}</span>
                {endDate && (
                  <>
                    <span className="mx-1">-</span>
                    <span>{format(endDate, "MMM d, yyyy")}</span>
                  </>
                )}
              </div>
              <span className="text-muted-foreground/40">|</span>
              <span>{getDuration()}</span>
            </div>

            {/* Tasks */}
            {(project.tasks?.length ?? 0) > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <ListTodo className="h-4 w-4" />
                  Tasks ({project.tasks.length})
                </h4>
                <div className="space-y-1.5">
                  {project.tasks.map((task) => {
                    const startLabel = task.actualStart
                      ? format(parseISO(task.actualStart), "MMM d, yyyy")
                      : task.scheduledStart
                        ? format(parseISO(task.scheduledStart), "MMM d, yyyy")
                        : null
                    const isActualStart = !!task.actualStart
                    return (
                      <div
                        key={task.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{task.name}</p>
                          {task.description && (
                            <p className="text-xs text-muted-foreground truncate">{task.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground ml-3">
                          {startLabel && (
                            <span className={isActualStart ? "" : "italic"}>
                              {isActualStart ? "Started" : "Planned"} {startLabel}
                            </span>
                          )}
                          {task.progress > 0 && (
                            <div className="flex items-center gap-1.5">
                              <div className="h-1.5 w-12 rounded-full bg-secondary overflow-hidden">
                                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, task.progress)}%` }} />
                              </div>
                              <span className="text-[11px]">{task.progress}%</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Main Stats Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs">Total Time</span>
                </div>
                <p className="text-xl font-bold text-foreground">
                  {minutesToHoursString(stats.totalMinutes)}
                </p>
              </div>
              
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <CalendarDays className="h-4 w-4" />
                  <span className="text-xs">Days Worked</span>
                </div>
                <p className="text-xl font-bold text-foreground">{stats.daysWorked}</p>
              </div>
              
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Hash className="h-4 w-4" />
                  <span className="text-xs">Sessions</span>
                </div>
                <p className="text-xl font-bold text-foreground">{stats.totalSessions}</p>
              </div>
              
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs">Avg/Day</span>
                </div>
                <p className="text-xl font-bold text-foreground">
                  {minutesToHoursString(stats.avgMinutesPerDay)}
                </p>
              </div>
            </div>

            {/* Period Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
                <p className="text-xs text-muted-foreground mb-1">This Week</p>
                <p className="text-lg font-semibold text-accent">
                  {minutesToHoursString(stats.thisWeekMinutes)}
                </p>
              </div>
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
                <p className="text-xs text-muted-foreground mb-1">This Month</p>
                <p className="text-lg font-semibold text-blue-400">
                  {minutesToHoursString(stats.thisMonthMinutes)}
                </p>
              </div>
            </div>

            {/* Additional Insights */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Insights
              </h4>
              <div className="grid gap-2 text-sm">
                {stats.avgMinutesPerSession > 0 && (
                  <div className="flex justify-between rounded-lg bg-secondary/50 px-3 py-2">
                    <span className="text-muted-foreground">Avg Session Length</span>
                    <span className="font-medium text-foreground">{minutesToHoursString(stats.avgMinutesPerSession)}</span>
                  </div>
                )}
                {stats.longestSession > 0 && (
                  <div className="flex justify-between rounded-lg bg-secondary/50 px-3 py-2">
                    <span className="text-muted-foreground">Longest Session</span>
                    <span className="font-medium text-foreground">{minutesToHoursString(stats.longestSession)}</span>
                  </div>
                )}
                {stats.shortestSession > 0 && (
                  <div className="flex justify-between rounded-lg bg-secondary/50 px-3 py-2">
                    <span className="text-muted-foreground">Shortest Session</span>
                    <span className="font-medium text-foreground">{minutesToHoursString(stats.shortestSession)}</span>
                  </div>
                )}
                {stats.mostProductiveDay && (
                  <div className="flex justify-between rounded-lg bg-secondary/50 px-3 py-2">
                    <span className="text-muted-foreground">Most Productive Day</span>
                    <span className="font-medium text-foreground">
                      {stats.mostProductiveDay.day} ({minutesToHoursString(stats.mostProductiveDay.minutes)})
                    </span>
                  </div>
                )}
                {stats.firstWorkedDate && (
                  <div className="flex justify-between rounded-lg bg-secondary/50 px-3 py-2">
                    <span className="text-muted-foreground">First Worked</span>
                    <span className="font-medium text-foreground">
                      {format(parseISO(stats.firstWorkedDate), "MMM d, yyyy")}
                    </span>
                  </div>
                )}
                {stats.lastWorkedDate && (
                  <div className="flex justify-between rounded-lg bg-secondary/50 px-3 py-2">
                    <span className="text-muted-foreground">Last Worked</span>
                    <span className="font-medium text-foreground">
                      {format(parseISO(stats.lastWorkedDate), "MMM d, yyyy")}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Activity */}
            {stats.recentActivity.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Timer className="h-4 w-4" />
                  Recent Activity
                </h4>
                <div className="space-y-1.5">
                  {stats.recentActivity.map((day) => (
                    <div
                      key={day.date}
                      className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2"
                    >
                      <span className="text-sm text-muted-foreground">
                        {format(parseISO(day.date), "EEE, MMM d")}
                      </span>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 rounded-full bg-accent"
                          style={{ width: `${Math.min(100, (day.minutes / 480) * 100)}px` }}
                        />
                        <span className="text-sm font-medium text-foreground w-16 text-right">
                          {minutesToHoursString(day.minutes)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dynamics 365 Info */}
            {project.dynamics && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Globe className="h-4 w-4 text-blue-400" />
                  Dynamics 365
                </h4>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between rounded-lg bg-blue-500/5 border border-blue-500/20 px-3 py-2">
                    <span className="text-muted-foreground">Dynamics ID</span>
                    <span className="font-mono text-xs text-foreground">{project.dynamics.dynamicsId.slice(0, 8)}...</span>
                  </div>
                  {project.dynamics.teamSize > 0 && (
                    <div className="flex justify-between rounded-lg bg-secondary/50 px-3 py-2">
                      <span className="text-muted-foreground">Team Size</span>
                      <span className="font-medium text-foreground">{project.dynamics.teamSize}</span>
                    </div>
                  )}
                  {project.dynamics.duration != null && (
                    <div className="flex justify-between rounded-lg bg-secondary/50 px-3 py-2">
                      <span className="text-muted-foreground">Duration</span>
                      <span className="font-medium text-foreground">{project.dynamics.duration} days</span>
                    </div>
                  )}
                  <div className="flex justify-between rounded-lg bg-secondary/50 px-3 py-2">
                    <span className="text-muted-foreground">Hours/Day</span>
                    <span className="font-medium text-foreground">{project.dynamics.hoursPerDay}h ({project.dynamics.hoursPerWeek}h/week)</span>
                  </div>
                  {project.dynamics.effort > 0 && (
                    <div className="flex justify-between rounded-lg bg-secondary/50 px-3 py-2">
                      <span className="text-muted-foreground">Effort</span>
                      <span className="font-medium text-foreground">{project.dynamics.effort}h (completed: {project.dynamics.effortCompleted}h)</span>
                    </div>
                  )}
                  <div className="flex justify-between rounded-lg bg-secondary/50 px-3 py-2">
                    <span className="text-muted-foreground">Last Synced</span>
                    <span className="font-medium text-foreground">
                      {format(parseISO(project.dynamics.lastSyncedAt), "MMM d, yyyy HH:mm")}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {stats.daysWorked === 0 && (
              <div className="rounded-lg border border-dashed border-border py-8 text-center">
                <Clock className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-3 text-sm text-muted-foreground">
                  No time tracked for this project yet
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Add this project to a day and start a work session
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
