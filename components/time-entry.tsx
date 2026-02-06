"use client"

import { Clock, LogIn, LogOut, UtensilsCrossed, Coffee, Plus, Trash2, Building2, Briefcase, Home } from "lucide-react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { DayEntry, Break, DayProjectEntry, WorkSession, AttendancePeriod, AttendanceLocation } from "@/lib/types"
import { timeToMin } from "@/lib/utils"
import { parseISO, isToday } from "date-fns"

interface TimeEntryProps {
  entry: DayEntry | undefined
  selectedDate: string
  onUpdate: (data: Partial<DayEntry>) => void
  dayProjects: DayProjectEntry[]
  onUpdateProject: (projectEntryId: string, data: Partial<DayProjectEntry>) => void
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
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

function timeStringToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function getCurrentTimeMinutes(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
}

// Calculate total attendance minutes (all periods, minus breaks)
function calculateAttendanceMinutes(attendance: AttendancePeriod[], breaks: Break[], useCurrentForOpen: boolean): number {
  let totalMinutes = 0
  for (const period of attendance) {
    if (!period.start) continue
    const startMin = timeToMin(period.start)
    if (Number.isNaN(startMin)) continue

    let endMin: number
    if (period.end) {
      endMin = timeToMin(period.end)
      if (Number.isNaN(endMin)) continue
    } else if (useCurrentForOpen) {
      endMin = getCurrentTimeMinutes()
    } else {
      continue
    }

    const dur = endMin - startMin
    if (dur > 0) totalMinutes += dur
  }

  // Subtract completed breaks
  for (const brk of breaks) {
    if (brk.start && brk.end) {
      const bs = timeToMin(brk.start)
      const be = timeToMin(brk.end)
      if (!Number.isNaN(bs) && !Number.isNaN(be) && be - bs > 0) {
        totalMinutes -= (be - bs)
      }
    } else if (brk.start && !brk.end && useCurrentForOpen) {
      const bs = timeToMin(brk.start)
      if (!Number.isNaN(bs)) {
        const ongoing = getCurrentTimeMinutes() - bs
        if (ongoing > 0) totalMinutes -= ongoing
      }
    }
  }

  return Math.max(0, totalMinutes)
}

// Calculate minutes per location
function calculateLocationMinutes(
  attendance: AttendancePeriod[],
  useCurrentForOpen: boolean
): { home: number; office: number } {
  let home = 0
  let office = 0
  for (const period of attendance) {
    if (!period.start) continue
    const startMin = timeToMin(period.start)
    if (Number.isNaN(startMin)) continue

    let endMin: number
    if (period.end) {
      endMin = timeToMin(period.end)
      if (Number.isNaN(endMin)) continue
    } else if (useCurrentForOpen) {
      endMin = getCurrentTimeMinutes()
    } else {
      continue
    }

    const dur = endMin - startMin
    if (dur > 0) {
      if (period.location === "home") home += dur
      else office += dur
    }
  }
  return { home, office }
}

// Calculate work hours from project sessions
function calculateProjectMinutesForEntry(entry: DayEntry | undefined): number {
  if (!entry?.projects) return 0
  let totalMinutes = 0
  for (const project of entry.projects) {
    if (project.workSessions) {
      totalMinutes += calculateSessionsMinutes(project.workSessions)
    }
  }
  return totalMinutes
}

// Calculate live project time (including active sessions)
function calculateLiveProjectMinutes(entry: DayEntry | undefined): number {
  if (!entry?.projects) return 0
  let totalMinutes = 0
  for (const project of entry.projects) {
    if (project.workSessions) {
      for (const session of project.workSessions) {
        if (session.start) {
          const startMin = timeStringToMinutes(session.start)
          let endMin: number
          if (session.end) {
            endMin = timeStringToMinutes(session.end)
          } else {
            endMin = getCurrentTimeMinutes()
          }
          const duration = endMin - startMin
          if (duration > 0) {
            totalMinutes += duration
          }
        }
      }
    }
  }
  return totalMinutes
}

function minutesToString(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.floor(minutes % 60)
  return `${h}h ${m}m`
}

export function TimeEntry({ entry, selectedDate, onUpdate, dayProjects, onUpdateProject }: TimeEntryProps) {
  const [currentTime, setCurrentTime] = useState(Date.now())

  const attendance = entry?.attendance ?? []
  const lunchStart = entry?.lunchStart ?? ""
  const lunchEnd = entry?.lunchEnd ?? ""
  const breaks = entry?.breaks ?? []
  const scheduleNotes = entry?.scheduleNotes ?? ""

  // Derived state
  const isViewingToday = isToday(parseISO(selectedDate))
  const isClockedIn = attendance.some(a => a.start && !a.end)
  const isOnLunch = lunchStart !== "" && lunchEnd === ""
  const isOnBreak = breaks.some(b => b.start && !b.end)
  const hasActiveProjectSession = dayProjects.some(p => p.workSessions?.some(s => s.start && !s.end))
  const shouldShowLiveTime = isViewingToday && (isClockedIn || hasActiveProjectSession)

  useEffect(() => {
    if (!shouldShowLiveTime) return
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [shouldShowLiveTime])

  // End all active project sessions
  const endAllActiveProjectSessions = (timeString: string) => {
    for (const dayProject of dayProjects) {
      const sessions = dayProject.workSessions ?? []
      const hasActive = sessions.some(s => s.start && !s.end)
      if (hasActive) {
        const updatedSessions = sessions.map((s) =>
          s.start && !s.end ? { ...s, end: timeString, doneNotes: s.doneNotes ?? "", todoNotes: s.todoNotes ?? "" } : s
        )
        const totalMinutes = calculateSessionsMinutes(updatedSessions)
        const hoursWorked = Math.round((totalMinutes / 60) * 100) / 100
        onUpdateProject(dayProject.id, { workSessions: updatedSessions, hoursWorked })
      }
    }
  }

  // --- Attendance period handlers ---
  const addAttendancePeriod = (location: AttendanceLocation) => {
    const now = new Date()
    const timeString = now.toTimeString().slice(0, 5)
    const newPeriod: AttendancePeriod = {
      id: generateId(),
      start: timeString,
      end: "",
      location,
    }
    onUpdate({ attendance: [...attendance, newPeriod] })
  }

  const updateAttendancePeriod = (id: string, data: Partial<AttendancePeriod>) => {
    const updated = attendance.map(a => a.id === id ? { ...a, ...data } : a)
    onUpdate({ attendance: updated })
  }

  const endCurrentAttendance = () => {
    const now = new Date()
    const timeString = now.toTimeString().slice(0, 5)
    // End the last open period
    const updated = attendance.map((a, i) => {
      if (a.start && !a.end) {
        return { ...a, end: timeString }
      }
      return a
    })
    endAllActiveProjectSessions(timeString)
    onUpdate({ attendance: updated })
  }

  const removeAttendancePeriod = (id: string) => {
    onUpdate({ attendance: attendance.filter(a => a.id !== id) })
  }

  const setAttendanceCurrentTime = (id: string, field: 'start' | 'end') => {
    const now = new Date()
    const timeString = now.toTimeString().slice(0, 5)
    if (field === 'end') {
      endAllActiveProjectSessions(timeString)
    }
    updateAttendancePeriod(id, { [field]: timeString })
  }

  // --- Lunch & breaks (same as before) ---
  const setLunchTime = (field: 'lunchStart' | 'lunchEnd') => {
    const now = new Date()
    const timeString = now.toTimeString().slice(0, 5)
    if (field === 'lunchStart') {
      endAllActiveProjectSessions(timeString)
    }
    onUpdate({ [field]: timeString })
  }

  const addBreak = () => {
    const newBreak: Break = { id: generateId(), start: "", end: "" }
    onUpdate({ breaks: [...breaks, newBreak] })
  }

  const updateBreak = (id: string, field: 'start' | 'end', value: string) => {
    const updatedBreaks = breaks.map((b) => b.id === id ? { ...b, [field]: value } : b)
    onUpdate({ breaks: updatedBreaks })
  }

  const setBreakCurrentTime = (id: string, field: 'start' | 'end') => {
    const now = new Date()
    const timeString = now.toTimeString().slice(0, 5)
    if (field === 'start') {
      endAllActiveProjectSessions(timeString)
    }
    updateBreak(id, field, timeString)
  }

  const removeBreak = (id: string) => {
    onUpdate({ breaks: breaks.filter((b) => b.id !== id) })
  }

  // --- Calculated values ---
  const calculateLunchDuration = () => {
    if (!lunchStart || !lunchEnd) return null
    const diff = timeToMin(lunchEnd) - timeToMin(lunchStart)
    if (diff <= 0) return null
    const hours = Math.floor(diff / 60)
    const minutes = diff % 60
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  }

  const calculateTotalBreaksDuration = () => {
    let totalMinutes = 0
    for (const brk of breaks) {
      if (brk.start && brk.end) {
        const duration = timeToMin(brk.end) - timeToMin(brk.start)
        if (duration > 0) totalMinutes += duration
      }
    }
    if (totalMinutes <= 0) return null
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  }

  const lunchDuration = calculateLunchDuration()
  const totalBreaksDuration = calculateTotalBreaksDuration()

  void currentTime // re-render dependency
  const todayWorkMinutes = shouldShowLiveTime
    ? calculateLiveProjectMinutes(entry)
    : calculateProjectMinutesForEntry(entry)
  const todayAttendanceMinutes = calculateAttendanceMinutes(attendance, breaks, isViewingToday && isClockedIn)
  const locationMinutes = calculateLocationMinutes(attendance, isViewingToday && isClockedIn)
  const showLiveHours = attendance.length > 0 || dayProjects.length > 0

  // Status text
  const getStatusText = () => {
    if (hasActiveProjectSession) return "Working on Project"
    if (!isClockedIn) return null
    if (isOnLunch) return "On Lunch"
    if (isOnBreak) return "On Break"
    const activeAttendance = attendance.find(a => a.start && !a.end)
    return activeAttendance?.location === "home" ? "Home Office" : "In Office"
  }

  const statusText = getStatusText()

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-accent" />
          Time Tracking
          {shouldShowLiveTime && statusText && (
            <span className={`ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              isOnLunch || isOnBreak
                ? "bg-amber-500/20 text-amber-400"
                : hasActiveProjectSession
                  ? "bg-green-500/20 text-green-400"
                  : "bg-blue-500/20 text-blue-400"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${
                isOnLunch || isOnBreak ? "bg-amber-400" : hasActiveProjectSession ? "animate-pulse bg-green-400" : "bg-blue-400"
              }`} />
              {statusText}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Live Hours Stats */}
        {showLiveHours && (
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Net Hours Worked */}
            <div className={`rounded-lg px-4 py-3 ${shouldShowLiveTime && hasActiveProjectSession ? "bg-accent/10 ring-1 ring-accent/30" : "bg-accent/10"}`}>
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Briefcase className="h-3.5 w-3.5" />
                  Hours Worked
                </p>
                {shouldShowLiveTime && hasActiveProjectSession && (
                  <span className="flex items-center gap-1 text-xs text-accent">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                    Live
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold tabular-nums text-accent">{minutesToString(todayWorkMinutes)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground/70">
                From project sessions
              </p>
            </div>

            {/* Total Attendance */}
            {attendance.length > 0 && (
              <div className={`rounded-lg px-4 py-3 ${shouldShowLiveTime && isClockedIn ? "bg-blue-500/10 ring-1 ring-blue-500/30" : "bg-blue-500/10"}`}>
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    Total Attendance
                  </p>
                  {shouldShowLiveTime && isClockedIn && (
                    <span className="flex items-center gap-1 text-xs text-blue-400">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
                      Live
                    </span>
                  )}
                </div>
                <p className="text-2xl font-bold tabular-nums text-blue-400">{minutesToString(todayAttendanceMinutes)}</p>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground/70">
                  {locationMinutes.office > 0 && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {minutesToString(locationMinutes.office)}
                    </span>
                  )}
                  {locationMinutes.home > 0 && (
                    <span className="flex items-center gap-1">
                      <Home className="h-3 w-3" />
                      {minutesToString(locationMinutes.home)}
                    </span>
                  )}
                  {totalBreaksDuration && (
                    <span>Breaks: -{totalBreaksDuration}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Attendance Periods */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm text-muted-foreground">Attendance</Label>
            <div className="ml-auto flex gap-1.5">
              {!isClockedIn ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addAttendancePeriod("office")}
                    className="h-7 gap-1.5 bg-transparent text-xs"
                  >
                    <Building2 className="h-3 w-3" />
                    Clock In Office
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addAttendancePeriod("home")}
                    className="h-7 gap-1.5 bg-transparent text-xs"
                  >
                    <Home className="h-3 w-3" />
                    Clock In Home
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={endCurrentAttendance}
                  className="h-7 gap-1.5 border-red-500/30 bg-transparent text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  <LogOut className="h-3 w-3" />
                  Clock Out
                </Button>
              )}
            </div>
          </div>

          {attendance.length === 0 && (
            <p className="text-xs text-muted-foreground/60 italic">
              Not clocked in yet. Choose Office or Home to start.
            </p>
          )}

          <div className="space-y-2">
            {attendance.map((period, index) => {
              const isActive = period.start && !period.end
              return (
                <div
                  key={period.id}
                  className={`rounded-lg border p-2.5 ${
                    isActive
                      ? period.location === "home"
                        ? "border-cyan-500/40 bg-cyan-500/10"
                        : "border-blue-500/40 bg-blue-500/10"
                      : "border-border/50 bg-secondary/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {/* Location toggle */}
                    <button
                      type="button"
                      onClick={() => updateAttendancePeriod(period.id, {
                        location: period.location === "home" ? "office" : "home"
                      })}
                      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                        period.location === "home"
                          ? "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"
                          : "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                      }`}
                      title="Toggle location"
                    >
                      {period.location === "home" ? <Home className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                      {period.location === "home" ? "Home" : "Office"}
                    </button>

                    {/* Time inputs */}
                    <div className="grid flex-1 grid-cols-2 gap-2">
                      <div className="flex gap-1">
                        <Input
                          type="time"
                          value={period.start}
                          onChange={(e) => updateAttendancePeriod(period.id, { start: e.target.value })}
                          className="h-8 text-sm"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setAttendanceCurrentTime(period.id, 'start')}
                          className="h-8 w-8 shrink-0"
                          title="Set current time"
                        >
                          <LogIn className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex gap-1">
                        <Input
                          type="time"
                          value={period.end}
                          onChange={(e) => updateAttendancePeriod(period.id, { end: e.target.value })}
                          className="h-8 text-sm"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setAttendanceCurrentTime(period.id, 'end')}
                          className="h-8 w-8 shrink-0"
                          title="Set current time"
                        >
                          <LogOut className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAttendancePeriod(period.id)}
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      title="Remove period"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Lunch Break */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm text-muted-foreground">Lunch Break</Label>
            {lunchDuration && (
              <span className="ml-auto text-xs text-muted-foreground">
                ({lunchDuration})
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lunch-start" className="text-xs text-muted-foreground">
                Start
              </Label>
              <div className="flex gap-2">
                <Input
                  id="lunch-start"
                  type="time"
                  value={lunchStart}
                  onChange={(e) => onUpdate({ lunchStart: e.target.value })}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setLunchTime('lunchStart')}
                  title="Start lunch now"
                  className="bg-transparent"
                >
                  <Clock className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lunch-end" className="text-xs text-muted-foreground">
                End
              </Label>
              <div className="flex gap-2">
                <Input
                  id="lunch-end"
                  type="time"
                  value={lunchEnd}
                  onChange={(e) => onUpdate({ lunchEnd: e.target.value })}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setLunchTime('lunchEnd')}
                  title="End lunch now"
                  className="bg-transparent"
                >
                  <Clock className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Short Breaks */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Coffee className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm text-muted-foreground">Short Breaks</Label>
            {totalBreaksDuration && (
              <span className="text-xs text-muted-foreground">
                ({totalBreaksDuration} total)
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={addBreak}
              className="ml-auto h-7 gap-1 bg-transparent text-xs"
            >
              <Plus className="h-3 w-3" />
              Add Break
            </Button>
          </div>

          {breaks.length === 0 && (
            <p className="text-xs text-muted-foreground/60 italic">
              No breaks tracked yet. Click "Add Break" to add one.
            </p>
          )}

          <div className="space-y-2">
            {breaks.map((brk, index) => (
              <div key={brk.id} className="flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/30 p-2">
                <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">
                  {index + 1}.
                </span>
                <div className="grid flex-1 grid-cols-2 gap-2">
                  <div className="flex gap-1">
                    <Input
                      type="time"
                      value={brk.start}
                      onChange={(e) => updateBreak(brk.id, 'start', e.target.value)}
                      className="h-8 text-sm"
                      placeholder="Start"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setBreakCurrentTime(brk.id, 'start')}
                      className="h-8 w-8 shrink-0"
                      title="Set current time"
                    >
                      <Clock className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex gap-1">
                    <Input
                      type="time"
                      value={brk.end}
                      onChange={(e) => updateBreak(brk.id, 'end', e.target.value)}
                      className="h-8 text-sm"
                      placeholder="End"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setBreakCurrentTime(brk.id, 'end')}
                      className="h-8 w-8 shrink-0"
                      title="Set current time"
                    >
                      <Clock className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeBreak(brk.id)}
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  title="Remove break"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Schedule Notes */}
        <div className="space-y-2">
          <Label htmlFor="schedule-notes" className="text-sm text-muted-foreground">
            Schedule Notes / Changes
          </Label>
          <Textarea
            id="schedule-notes"
            placeholder="Any notable changes to your schedule or tasks today..."
            value={scheduleNotes}
            onChange={(e) => onUpdate({ scheduleNotes: e.target.value })}
            className="min-h-[80px] resize-none"
          />
        </div>
      </CardContent>
    </Card>
  )
}
