"use client"

import { Clock, LogIn, LogOut, UtensilsCrossed, Coffee, Plus, Trash2, Building2, Briefcase, Timer, Home, ArrowRightLeft } from "lucide-react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { DayEntry, Break, DayProjectEntry, WorkSession, LocationBlock, LocationType } from "@/lib/types"
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

// Calculate total minutes for location blocks, optionally filtered by type
function calculateLocationMinutes(blocks: LocationBlock[], location?: LocationType, useLive?: boolean): number {
  let total = 0
  for (const block of blocks) {
    if (location && block.location !== location) continue
    if (!block.start) continue
    const startMin = timeStringToMinutes(block.start)
    let endMin: number
    if (block.end) {
      endMin = timeStringToMinutes(block.end)
    } else if (useLive) {
      endMin = getCurrentTimeMinutes()
    } else {
      continue
    }
    const dur = endMin - startMin
    if (dur > 0) total += dur
  }
  return total
}

// Calculate total clocked minutes from location blocks minus breaks
function calculateTotalClockedMinutes(entry: DayEntry | undefined, useLive?: boolean): number {
  if (!entry) return 0
  const blocks = entry.locationBlocks ?? []
  if (blocks.length === 0) {
    // Fallback to legacy clockIn/clockOut
    if (!entry.clockIn) return 0
    const startMin = timeStringToMinutes(entry.clockIn)
    let endMin: number
    if (entry.clockOut) {
      endMin = timeStringToMinutes(entry.clockOut)
    } else if (useLive) {
      endMin = getCurrentTimeMinutes()
    } else {
      return 0
    }
    let total = endMin - startMin
    if (total <= 0) return 0
    // Subtract breaks
    for (const brk of entry.breaks ?? []) {
      if (brk.start && brk.end) {
        const d = timeStringToMinutes(brk.end) - timeStringToMinutes(brk.start)
        if (d > 0) total -= d
      } else if (brk.start && !brk.end && useLive) {
        const d = getCurrentTimeMinutes() - timeStringToMinutes(brk.start)
        if (d > 0) total -= d
      }
    }
    return Math.max(0, total)
  }

  let total = calculateLocationMinutes(blocks, undefined, useLive)
  // Subtract breaks
  for (const brk of entry.breaks ?? []) {
    if (brk.start && brk.end) {
      const d = timeStringToMinutes(brk.end) - timeStringToMinutes(brk.start)
      if (d > 0) total -= d
    } else if (brk.start && !brk.end && useLive) {
      const d = getCurrentTimeMinutes() - timeStringToMinutes(brk.start)
      if (d > 0) total -= d
    }
  }
  return Math.max(0, total)
}

// Calculate work hours from project sessions (completed only)
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
          const endMin = session.end ? timeStringToMinutes(session.end) : getCurrentTimeMinutes()
          const duration = endMin - startMin
          if (duration > 0) totalMinutes += duration
        }
      }
    }
  }
  return totalMinutes
}

function roundTimeToNearest5(time: string): string {
  if (!time) return time
  const [h, m] = time.split(":").map(Number)
  if (isNaN(h) || isNaN(m)) return time
  const rounded = Math.round(m / 5) * 5
  const newH = h + Math.floor(rounded / 60)
  const newM = rounded % 60
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`
}

function minutesToString(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.floor(minutes % 60)
  return `${h}h ${m}m`
}

export function TimeEntry({ entry, selectedDate, onUpdate, dayProjects, onUpdateProject }: TimeEntryProps) {
  const [currentTime, setCurrentTime] = useState(Date.now())

  const clockIn = entry?.clockIn ?? ""
  const clockOut = entry?.clockOut ?? ""
  const lunchStart = entry?.lunchStart ?? ""
  const lunchEnd = entry?.lunchEnd ?? ""
  const breaks = entry?.breaks ?? []
  const locationBlocks = entry?.locationBlocks ?? []
  const scheduleNotes = entry?.scheduleNotes ?? ""

  // Check if we're viewing today and currently clocked in
  const isViewingToday = isToday(parseISO(selectedDate))
  const activeBlock = locationBlocks.find(b => b.start && !b.end)
  const isClockedIn = activeBlock != null || (clockIn !== "" && clockOut === "")
  const isOnLunch = lunchStart !== "" && lunchEnd === ""
  const isOnBreak = breaks.some(b => b.start && !b.end)
  const hasActiveProjectSession = dayProjects.some(p => p.workSessions?.some(s => s.start && !s.end))
  const shouldShowLiveTime = isViewingToday && (isClockedIn || hasActiveProjectSession)

  // Update current time every second when live tracking is active
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

  // --- Location block actions ---
  const clockInAt = (location: LocationType) => {
    const now = new Date()
    const timeString = now.toTimeString().slice(0, 5)
    const newBlock: LocationBlock = {
      id: generateId(),
      location,
      start: timeString,
      end: "",
    }
    // Also set legacy clockIn for backward compat if first block
    const updates: Partial<DayEntry> = {
      locationBlocks: [...locationBlocks, newBlock],
    }
    if (locationBlocks.length === 0) {
      updates.clockIn = timeString
    }
    onUpdate(updates)
  }

  const clockOutNow = () => {
    const now = new Date()
    const timeString = now.toTimeString().slice(0, 5)
    endAllActiveProjectSessions(timeString)
    // End active block
    if (activeBlock) {
      const updated = locationBlocks.map(b =>
        b.id === activeBlock.id ? { ...b, end: timeString } : b
      )
      onUpdate({ locationBlocks: updated, clockOut: timeString })
    } else {
      onUpdate({ clockOut: timeString })
    }
  }

  const switchLocation = () => {
    if (!activeBlock) return
    const now = new Date()
    const timeString = now.toTimeString().slice(0, 5)
    const newLocation: LocationType = activeBlock.location === 'office' ? 'home' : 'office'
    // End current block and start new one
    const updatedBlocks = locationBlocks.map(b =>
      b.id === activeBlock.id ? { ...b, end: timeString } : b
    )
    const newBlock: LocationBlock = {
      id: generateId(),
      location: newLocation,
      start: timeString,
      end: "",
    }
    onUpdate({ locationBlocks: [...updatedBlocks, newBlock] })
  }

  const updateLocationBlock = (id: string, field: keyof LocationBlock, value: string) => {
    const updated = locationBlocks.map(b =>
      b.id === id ? { ...b, [field]: value } : b
    )
    onUpdate({ locationBlocks: updated })
  }

  const removeLocationBlock = (id: string) => {
    onUpdate({ locationBlocks: locationBlocks.filter(b => b.id !== id) })
  }

  const addLocationBlock = (location: LocationType) => {
    const newBlock: LocationBlock = {
      id: generateId(),
      location,
      start: "",
      end: "",
    }
    onUpdate({ locationBlocks: [...locationBlocks, newBlock] })
  }

  // --- Round to 5 ---
  const handleRoundTo5 = () => {
    const roundedData: Partial<DayEntry> = {}
    if (clockIn) roundedData.clockIn = roundTimeToNearest5(clockIn)
    if (clockOut) roundedData.clockOut = roundTimeToNearest5(clockOut)
    if (lunchStart) roundedData.lunchStart = roundTimeToNearest5(lunchStart)
    if (lunchEnd) roundedData.lunchEnd = roundTimeToNearest5(lunchEnd)

    if (breaks.length > 0) {
      roundedData.breaks = breaks.map((brk) => ({
        ...brk,
        start: brk.start ? roundTimeToNearest5(brk.start) : brk.start,
        end: brk.end ? roundTimeToNearest5(brk.end) : brk.end,
      }))
    }

    if (locationBlocks.length > 0) {
      roundedData.locationBlocks = locationBlocks.map((blk) => ({
        ...blk,
        start: blk.start ? roundTimeToNearest5(blk.start) : blk.start,
        end: blk.end ? roundTimeToNearest5(blk.end) : blk.end,
      }))
    }

    if (Object.keys(roundedData).length > 0) {
      onUpdate(roundedData)
    }

    for (const dayProject of dayProjects) {
      const sessions = dayProject.workSessions ?? []
      if (sessions.length === 0) continue
      const roundedSessions = sessions.map((s) => ({
        ...s,
        start: s.start ? roundTimeToNearest5(s.start) : s.start,
        end: s.end ? roundTimeToNearest5(s.end) : s.end,
      }))
      const totalMinutes = calculateSessionsMinutes(roundedSessions)
      const hoursWorked = Math.round((totalMinutes / 60) * 100) / 100
      onUpdateProject(dayProject.id, { workSessions: roundedSessions, hoursWorked })
    }
  }

  // --- Legacy time field helpers ---
  const setCurrentTimeField = (field: keyof Pick<DayEntry, 'clockIn' | 'clockOut' | 'lunchStart' | 'lunchEnd'>) => {
    const now = new Date()
    const timeString = now.toTimeString().slice(0, 5)
    if (field === 'lunchStart' || field === 'clockOut') {
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
    if (field === 'start') endAllActiveProjectSessions(timeString)
    updateBreak(id, field, timeString)
  }

  const removeBreak = (id: string) => {
    onUpdate({ breaks: breaks.filter((b) => b.id !== id) })
  }

  // --- Duration calculations ---
  const calculateLunchDuration = () => {
    if (!lunchStart || !lunchEnd) return null
    const diff = timeStringToMinutes(lunchEnd) - timeStringToMinutes(lunchStart)
    if (diff <= 0) return null
    const hours = Math.floor(diff / 60)
    const minutes = diff % 60
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  }

  const calculateTotalBreaksDuration = () => {
    let totalMinutes = 0
    for (const brk of breaks) {
      if (brk.start && brk.end) {
        const duration = timeStringToMinutes(brk.end) - timeStringToMinutes(brk.start)
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

  // Use currentTime dependency to trigger recalculation
  void currentTime
  const todayWorkMinutes = shouldShowLiveTime ? calculateLiveProjectMinutes(entry) : calculateProjectMinutesForEntry(entry)
  const todayClockedMinutes = calculateTotalClockedMinutes(entry, isViewingToday && isClockedIn)

  const officeMinutes = locationBlocks.length > 0
    ? calculateLocationMinutes(locationBlocks, 'office', isViewingToday && isClockedIn)
    : todayClockedMinutes
  const homeMinutes = locationBlocks.length > 0
    ? calculateLocationMinutes(locationBlocks, 'home', isViewingToday && isClockedIn)
    : 0

  const hasAnyClockData = locationBlocks.length > 0 || clockIn !== ""
  const showLiveHours = hasAnyClockData || dayProjects.length > 0

  // Get status text
  const getStatusText = () => {
    if (hasActiveProjectSession) return "Working on Project"
    if (!isClockedIn) return null
    if (isOnLunch) return "On Lunch"
    if (isOnBreak) return "On Break"
    if (activeBlock?.location === 'home') return "At Home"
    return "In Office"
  }

  const statusText = getStatusText()

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-accent" />
          Time Tracking
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRoundTo5}
                className="ml-auto h-7 gap-1.5 bg-transparent text-xs font-normal text-muted-foreground"
              >
                <Timer className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Round to 5</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Round all times to nearest 5 minutes</TooltipContent>
          </Tooltip>
          {shouldShowLiveTime && statusText && (
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              isOnLunch || isOnBreak
                ? "bg-amber-500/20 text-amber-400"
                : hasActiveProjectSession
                  ? "bg-green-500/20 text-green-400"
                  : activeBlock?.location === 'home'
                    ? "bg-violet-500/20 text-violet-400"
                    : "bg-blue-500/20 text-blue-400"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${
                isOnLunch || isOnBreak ? "bg-amber-400" : hasActiveProjectSession ? "animate-pulse bg-green-400" : activeBlock?.location === 'home' ? "bg-violet-400" : "bg-blue-400"
              }`} />
              {statusText}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Live Hours Stats */}
        {showLiveHours && (
          <div className={`grid gap-3 ${homeMinutes > 0 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
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
              <p className="mt-0.5 text-xs text-muted-foreground/70">From project sessions</p>
            </div>

            {/* Office Hours */}
            {hasAnyClockData && (
              <div className={`rounded-lg px-4 py-3 ${shouldShowLiveTime && activeBlock?.location === 'office' ? "bg-blue-500/10 ring-1 ring-blue-500/30" : "bg-blue-500/10"}`}>
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    Office
                  </p>
                  {shouldShowLiveTime && activeBlock?.location === 'office' && (
                    <span className="flex items-center gap-1 text-xs text-blue-400">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
                      Live
                    </span>
                  )}
                </div>
                <p className="text-2xl font-bold tabular-nums text-blue-400">{minutesToString(officeMinutes)}</p>
                {totalBreaksDuration && (
                  <p className="mt-0.5 text-xs text-muted-foreground/70">Breaks: -{totalBreaksDuration}</p>
                )}
              </div>
            )}

            {/* Home Hours */}
            {homeMinutes > 0 && (
              <div className={`rounded-lg px-4 py-3 ${shouldShowLiveTime && activeBlock?.location === 'home' ? "bg-violet-500/10 ring-1 ring-violet-500/30" : "bg-violet-500/10"}`}>
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Home className="h-3.5 w-3.5" />
                    Home
                  </p>
                  {shouldShowLiveTime && activeBlock?.location === 'home' && (
                    <span className="flex items-center gap-1 text-xs text-violet-400">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
                      Live
                    </span>
                  )}
                </div>
                <p className="text-2xl font-bold tabular-nums text-violet-400">{minutesToString(homeMinutes)}</p>
              </div>
            )}
          </div>
        )}

        {/* Location Clock In/Out */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm text-muted-foreground">Clock In / Out</Label>
          </div>

          {/* Quick action buttons */}
          {!isClockedIn ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => clockInAt('office')}
                className="flex-1 gap-1.5 bg-transparent text-xs"
              >
                <Building2 className="h-3.5 w-3.5" />
                Clock In - Office
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => clockInAt('home')}
                className="flex-1 gap-1.5 bg-transparent text-xs"
              >
                <Home className="h-3.5 w-3.5" />
                Clock In - Home
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={switchLocation}
                className="flex-1 gap-1.5 bg-transparent text-xs"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Switch to {activeBlock?.location === 'office' ? 'Home' : 'Office'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clockOutNow}
                className="flex-1 gap-1.5 border-red-500/30 bg-transparent text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
              >
                <LogOut className="h-3.5 w-3.5" />
                Clock Out
              </Button>
            </div>
          )}

          {/* Location blocks list */}
          {locationBlocks.length > 0 && (
            <div className="space-y-2">
              {locationBlocks.map((block, index) => {
                const isActive = block.start && !block.end
                const blockDuration = block.start && block.end
                  ? timeStringToMinutes(block.end) - timeStringToMinutes(block.start)
                  : block.start && isViewingToday
                    ? getCurrentTimeMinutes() - timeStringToMinutes(block.start)
                    : 0
                return (
                  <div key={block.id} className={`flex items-center gap-2 rounded-lg border p-2 ${
                    isActive
                      ? block.location === 'home'
                        ? "border-violet-500/50 bg-violet-500/10"
                        : "border-blue-500/50 bg-blue-500/10"
                      : "border-border/50 bg-secondary/30"
                  }`}>
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${
                      block.location === 'home' ? "bg-violet-500/20" : "bg-blue-500/20"
                    }`}>
                      {block.location === 'home'
                        ? <Home className="h-3 w-3 text-violet-400" />
                        : <Building2 className="h-3 w-3 text-blue-400" />
                      }
                    </div>
                    <span className="w-12 shrink-0 text-xs text-muted-foreground">
                      {block.location === 'home' ? 'Home' : 'Office'}
                    </span>
                    <div className="grid flex-1 grid-cols-2 gap-2">
                      <Input
                        type="time"
                        value={block.start}
                        onChange={(e) => updateLocationBlock(block.id, 'start', e.target.value)}
                        className="h-8 text-sm"
                      />
                      <Input
                        type="time"
                        value={block.end}
                        onChange={(e) => updateLocationBlock(block.id, 'end', e.target.value)}
                        className="h-8 text-sm"
                        placeholder="--:--"
                      />
                    </div>
                    {blockDuration > 0 && (
                      <span className={`shrink-0 text-xs tabular-nums ${isActive ? (block.location === 'home' ? "text-violet-400" : "text-blue-400") : "text-muted-foreground"}`}>
                        {minutesToString(Math.max(0, blockDuration))}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLocationBlock(block.id)}
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Manual add block */}
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => addLocationBlock('office')}
              className="h-7 gap-1 text-xs text-muted-foreground"
            >
              <Plus className="h-3 w-3" />
              Office Block
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => addLocationBlock('home')}
              className="h-7 gap-1 text-xs text-muted-foreground"
            >
              <Plus className="h-3 w-3" />
              Home Block
            </Button>
          </div>
        </div>

        {/* Lunch Break */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm text-muted-foreground">Lunch Break</Label>
            {lunchDuration && (
              <span className="ml-auto text-xs text-muted-foreground">({lunchDuration})</span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lunch-start" className="text-xs text-muted-foreground">Start</Label>
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
                  onClick={() => setCurrentTimeField('lunchStart')}
                  title="Start lunch now"
                  className="bg-transparent"
                >
                  <Clock className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lunch-end" className="text-xs text-muted-foreground">End</Label>
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
                  onClick={() => setCurrentTimeField('lunchEnd')}
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
              <span className="text-xs text-muted-foreground">({totalBreaksDuration} total)</span>
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
            <p className="text-xs italic text-muted-foreground/60">
              No breaks tracked yet. Click &quot;Add Break&quot; to add one.
            </p>
          )}

          <div className="space-y-2">
            {breaks.map((brk, index) => (
              <div key={brk.id} className="flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/30 p-2">
                <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">{index + 1}.</span>
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
