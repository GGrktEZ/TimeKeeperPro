"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts"
import {
  Briefcase, Building2, CalendarDays, TrendingUp,
  Flame, Target, BarChart3, Zap, CalendarRange, Home,
  ChevronLeft, ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, isWithinInterval,
  format, subDays, eachDayOfInterval, getDay, subWeeks, addWeeks, isSameWeek,
} from "date-fns"
import type { DayEntry, Project, LocationBlock } from "@/lib/types"

interface StatsViewProps {
  entries: DayEntry[]
  projects: Project[]
}

// --- Utility functions ---
function sessionMinutes(sessions: { start: string; end: string }[]): number {
  let total = 0
  for (const s of sessions) {
    if (s.start && s.end) {
      const [sH, sM] = s.start.split(":").map(Number)
      const [eH, eM] = s.end.split(":").map(Number)
      const d = (eH * 60 + eM) - (sH * 60 + sM)
      if (d > 0) total += d
    }
  }
  return total
}

function entryWorkMinutes(entry: DayEntry): number {
  let total = 0
  for (const p of entry.projects ?? []) {
    total += sessionMinutes(p.workSessions ?? [])
  }
  return total
}

function entryOfficeMinutes(entry: DayEntry): number {
  if (!entry.clockIn || !entry.clockOut) return 0
  const [iH, iM] = entry.clockIn.split(":").map(Number)
  const [oH, oM] = entry.clockOut.split(":").map(Number)
  let total = (oH * 60 + oM) - (iH * 60 + iM)
  if (total <= 0) return 0
  for (const b of entry.breaks ?? []) {
    if (b.start && b.end) {
      const [bsH, bsM] = b.start.split(":").map(Number)
      const [beH, beM] = b.end.split(":").map(Number)
      const d = (beH * 60 + beM) - (bsH * 60 + bsM)
      if (d > 0) total -= d
    }
  }
  return Math.max(0, total)
}

function entryLunchMinutes(entry: DayEntry): number {
  if (!entry.lunchStart || !entry.lunchEnd) return 0
  const [sH, sM] = entry.lunchStart.split(":").map(Number)
  const [eH, eM] = entry.lunchEnd.split(":").map(Number)
  const d = (eH * 60 + eM) - (sH * 60 + sM)
  return d > 0 ? d : 0
}

function entryLocationMinutes(entry: DayEntry, location: 'office' | 'home'): number {
  const blocks = entry.locationBlocks ?? []
  if (blocks.length === 0) {
    // Legacy: if no blocks, all clocked time counts as office
    return location === 'office' ? entryOfficeMinutes(entry) : 0
  }
  let total = 0
  for (const b of blocks) {
    if (b.location !== location || !b.start || !b.end) continue
    const [sH, sM] = b.start.split(":").map(Number)
    const [eH, eM] = b.end.split(":").map(Number)
    const d = (eH * 60 + eM) - (sH * 60 + sM)
    if (d > 0) total += d
  }
  return total
}

function entryBreakMinutes(entry: DayEntry): number {
  let total = 0
  for (const b of entry.breaks ?? []) {
    if (b.start && b.end) {
      const [sH, sM] = b.start.split(":").map(Number)
      const [eH, eM] = b.end.split(":").map(Number)
      const d = (eH * 60 + eM) - (sH * 60 + sM)
      if (d > 0) total += d
    }
  }
  return total
}

function mToStr(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.floor(minutes % 60)
  return `${h}h ${m}m`
}

function mToHours(minutes: number): string {
  return (minutes / 60).toFixed(1)
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const CHART_COLORS = ["#4ade80", "#60a5fa", "#f59e0b", "#f472b6", "#a78bfa", "#34d399", "#fb923c", "#818cf8"]

export function StatsView({ entries, projects }: StatsViewProps) {
  const today = new Date()

  const stats = useMemo(() => {
    const allTime = {
      workMin: 0, officeMin: 0, homeMin: 0, lunchMin: 0, breakMin: 0,
      daysWorked: 0, totalSessions: 0,
    }
    const weekStart = startOfWeek(today, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 })
    const monthStart = startOfMonth(today)
    const monthEnd = endOfMonth(today)

    const week = { workMin: 0, officeMin: 0, homeMin: 0, days: 0 }
    const month = { workMin: 0, officeMin: 0, homeMin: 0, days: 0 }

    // Per-project totals
    const projectWork: Record<string, number> = {}
    // Per-day-of-week totals
    const dayOfWeekWork: number[] = [0, 0, 0, 0, 0, 0, 0]
    const dayOfWeekCount: number[] = [0, 0, 0, 0, 0, 0, 0]
    // Daily data for charts (last 30 days)
    const thirtyDaysAgo = subDays(today, 29)
    const last30 = eachDayOfInterval({ start: thirtyDaysAgo, end: today })
    const dailyMap = new Map<string, { work: number; office: number; home: number }>()

    // Last 12 weeks data
    const weeklyData: { label: string; work: number; office: number; home: number }[] = []
    for (let w = 11; w >= 0; w--) {
      const ws = startOfWeek(subWeeks(today, w), { weekStartsOn: 1 })
      weeklyData.push({
        label: format(ws, "MMM d"),
        work: 0,
        office: 0,
        home: 0,
      })
    }

    // Streak tracking
    let currentStreak = 0
    let longestStreak = 0
    let tempStreak = 0

    // Clock in time tracking
    const clockInTimes: number[] = []
    const clockOutTimes: number[] = []

    // Sort entries by date
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))

    // For streak, check consecutive days backward from today
    const streakCheck = new Set<string>()

    for (const e of sorted) {
      const work = entryWorkMinutes(e)
      const office = entryLocationMinutes(e, 'office')
      const home = entryLocationMinutes(e, 'home')
      const lunch = entryLunchMinutes(e)
      const breaks = entryBreakMinutes(e)
      const sessCount = (e.projects ?? []).reduce((acc, p) => acc + (p.workSessions?.filter(s => s.start && s.end).length ?? 0), 0)
      const d = parseISO(e.date)

      if (work > 0 || office > 0 || home > 0) {
        allTime.daysWorked++
        streakCheck.add(e.date)
      }
      allTime.workMin += work
      allTime.officeMin += office
      allTime.homeMin += home
      allTime.lunchMin += lunch
      allTime.breakMin += breaks
      allTime.totalSessions += sessCount

      // Clock times
      if (e.clockIn) {
        const [h, m] = e.clockIn.split(":").map(Number)
        clockInTimes.push(h * 60 + m)
      }
      if (e.clockOut) {
        const [h, m] = e.clockOut.split(":").map(Number)
        clockOutTimes.push(h * 60 + m)
      }

      // Day-of-week (Mon=0)
      const dow = (getDay(d) + 6) % 7
      if (work > 0) {
        dayOfWeekWork[dow] += work
        dayOfWeekCount[dow]++
      }

      // Per project
      for (const p of e.projects ?? []) {
        const mins = sessionMinutes(p.workSessions ?? [])
        if (mins > 0) {
          projectWork[p.projectId] = (projectWork[p.projectId] || 0) + mins
        }
      }

      // Week/month
      if (isWithinInterval(d, { start: weekStart, end: weekEnd })) {
        week.workMin += work
        week.officeMin += office
        week.homeMin += home
        if (work > 0 || office > 0 || home > 0) week.days++
      }
      if (isWithinInterval(d, { start: monthStart, end: monthEnd })) {
        month.workMin += work
        month.officeMin += office
        month.homeMin += home
        if (work > 0 || office > 0 || home > 0) month.days++
      }

      // Daily map for last 30 days
      dailyMap.set(e.date, { work, office, home })

      // Weekly chart data
      for (const wd of weeklyData) {
        const ws = startOfWeek(parseISO(wd.label.length < 8 ? `2026-${wd.label}` : wd.label), { weekStartsOn: 1 })
        const we = endOfWeek(ws, { weekStartsOn: 1 })
        if (isWithinInterval(d, { start: ws, end: we })) {
          wd.work += work / 60
          wd.office += office / 60
          wd.home += home / 60
        }
      }
    }

    // Calculate current streak (working backward from today)
    for (let i = 0; i <= 365; i++) {
      const checkDate = format(subDays(today, i), "yyyy-MM-dd")
      if (streakCheck.has(checkDate)) {
        currentStreak++
      } else if (i > 0) {
        break
      }
    }

    // Calculate longest streak
    const allDates = [...streakCheck].sort()
    for (const dateStr of allDates) {
      const prev = format(subDays(parseISO(dateStr), 1), "yyyy-MM-dd")
      if (streakCheck.has(prev)) {
        tempStreak++
      } else {
        tempStreak = 1
      }
      if (tempStreak > longestStreak) longestStreak = tempStreak
    }

    // Build 30-day chart data
    const dailyChartData = last30.map(d => {
      const key = format(d, "yyyy-MM-dd")
      const data = dailyMap.get(key) || { work: 0, office: 0, home: 0 }
      return {
        date: format(d, "MMM d"),
        day: format(d, "EEE"),
        work: Math.round((data.work / 60) * 10) / 10,
        office: Math.round((data.office / 60) * 10) / 10,
        home: Math.round((data.home / 60) * 10) / 10,
      }
    })

    // Heatmap data: last 16 weeks (112 days)
    const heatmapStart = subDays(today, 111)
    const heatmapDays = eachDayOfInterval({ start: heatmapStart, end: today })
    const heatmapData = heatmapDays.map(d => {
      const key = format(d, "yyyy-MM-dd")
      const data = dailyMap.get(key)
      const workHrs = data ? data.work / 60 : 0
      return {
        date: key,
        label: format(d, "MMM d"),
        dow: (getDay(d) + 6) % 7, // Monday=0
        hours: workHrs,
      }
    })

    // Project pie data
    const projectPieData = Object.entries(projectWork)
      .map(([pid, mins]) => {
        const p = projects.find(pr => pr.id === pid)
        return { name: p?.name ?? "Unknown", value: Math.round((mins / 60) * 10) / 10, color: p?.color ?? "bg-muted" }
      })
      .sort((a, b) => b.value - a.value)

    // Day-of-week averages
    const dayOfWeekAvg = DAY_LABELS.map((label, i) => ({
      day: label,
      avgHours: dayOfWeekCount[i] > 0 ? Math.round((dayOfWeekWork[i] / dayOfWeekCount[i] / 60) * 10) / 10 : 0,
      totalHours: Math.round((dayOfWeekWork[i] / 60) * 10) / 10,
    }))

    // Average clock in/out
    const avgClockIn = clockInTimes.length > 0 ? clockInTimes.reduce((a, b) => a + b, 0) / clockInTimes.length : null
    const avgClockOut = clockOutTimes.length > 0 ? clockOutTimes.reduce((a, b) => a + b, 0) / clockOutTimes.length : null

    // Most productive day
    let bestDayDate = ""
    let bestDayMins = 0
    for (const [dateStr, data] of dailyMap) {
      if (data.work > bestDayMins) {
        bestDayMins = data.work
        bestDayDate = dateStr
      }
    }

    // Average work per day
    const avgWorkPerDay = allTime.daysWorked > 0 ? allTime.workMin / allTime.daysWorked : 0
    const avgOfficePerDay = allTime.daysWorked > 0 ? allTime.officeMin / allTime.daysWorked : 0
    const avgHomePerDay = allTime.daysWorked > 0 ? allTime.homeMin / allTime.daysWorked : 0
    const avgLunchPerDay = allTime.lunchMin > 0 && allTime.daysWorked > 0 ? allTime.lunchMin / allTime.daysWorked : 0

    return {
      allTime, week, month,
      currentStreak, longestStreak,
      dailyChartData, heatmapData, dailyMap,
      projectPieData, dayOfWeekAvg,
      avgClockIn, avgClockOut,
      bestDayDate, bestDayMins,
      avgWorkPerDay, avgOfficePerDay, avgHomePerDay, avgLunchPerDay,
      weeklyData: weeklyData.map(w => ({
        ...w,
        work: Math.round(w.work * 10) / 10,
        office: Math.round(w.office * 10) / 10,
        home: Math.round(w.home * 10) / 10,
      })),
    }
  }, [entries, projects, today])

  const formatMinutesAsTime = (mins: number | null) => {
    if (mins === null) return "--:--"
    const h = Math.floor(mins / 60)
    const m = Math.round(mins % 60)
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
  }

  // --- Selected week state and computed stats ---
  const [selectedWeekStart, setSelectedWeekStart] = useState(() =>
    startOfWeek(today, { weekStartsOn: 1 })
  )

  const isCurrentWeek = isSameWeek(selectedWeekStart, today, { weekStartsOn: 1 })

  const weekStats = useMemo(() => {
    const wsStart = selectedWeekStart
    const wsEnd = endOfWeek(wsStart, { weekStartsOn: 1 })
    const weekDays = eachDayOfInterval({ start: wsStart, end: wsEnd })
    const dailyMap = stats.dailyMap

    const thisWeekDaily = weekDays.map((d) => {
      const key = format(d, "yyyy-MM-dd")
      const data = dailyMap.get(key)
      const mins = data ? data.work : 0
      const isPast = d <= today
      const isDayToday = format(d, "yyyy-MM-dd") === format(today, "yyyy-MM-dd")
      return {
        date: key,
        label: format(d, "EEE"),
        fullLabel: format(d, "EEEE"),
        hours: Math.round((mins / 60) * 100) / 100,
        minutes: mins,
        isPast,
        isToday: isDayToday,
        isFuture: d > today,
      }
    })

    const weekWorkMinTotal = thisWeekDaily.reduce((sum, d) => sum + d.minutes, 0)

    // Detect if this is a 3-day (Mon-Wed) or 5-day (Mon-Fri) week.
    // Default: Mon-Wed. If any time recorded on Thu or Fri, it's Mon-Fri.
    const thuFriHaveWork = thisWeekDaily.some(
      (d) => (d.label === "Thu" || d.label === "Fri") && d.minutes > 0
    )
    const workDayCount = thuFriHaveWork ? 5 : 3
    const workDayLabels = thuFriHaveWork
      ? ["Mon", "Tue", "Wed", "Thu", "Fri"]
      : ["Mon", "Tue", "Wed"]

    const DAILY_QUOTA = 8 * 60
    const WEEKLY_QUOTA = DAILY_QUOTA * workDayCount

    // For need/day: only subtract completed past work-day hours (exclude today)
    const completedWorkdayMins = thisWeekDaily
      .filter((d) => d.isPast && !d.isToday && workDayLabels.includes(d.label))
      .reduce((sum, d) => sum + d.minutes, 0)
    const remainingWorkdays = thisWeekDaily.filter((d) => {
      return workDayLabels.includes(d.label) && (d.isFuture || d.isToday)
    }).length
    const hoursRemaining = Math.max(0, WEEKLY_QUOTA - completedWorkdayMins) / 60
    const hoursPerRemainingDay = remainingWorkdays > 0 ? hoursRemaining / remainingWorkdays : 0

    const daysWorked = thisWeekDaily.filter((d) => d.minutes > 0).length
    const weekAvgPerDay = daysWorked > 0 ? weekWorkMinTotal / daysWorked : 0

    return {
      thisWeekDaily,
      weekWorkMinTotal,
      hoursRemaining,
      hoursPerRemainingDay,
      weekAvgPerDay,
      daysWorked,
      workDayCount,
      weeklyQuota: WEEKLY_QUOTA / 60,
      isInPast: wsEnd < today,
      startLabel: format(wsStart, "MMM d"),
      endLabel: format(wsEnd, "MMM d, yyyy"),
    }
  }, [selectedWeekStart, stats.dailyMap, today])

  // Heatmap: group by week columns
  const heatmapWeeks = useMemo(() => {
    const weeks: { date: string; label: string; dow: number; hours: number }[][] = []
    let currentWeek: typeof weeks[0] = []
    for (const day of stats.heatmapData) {
      if (day.dow === 0 && currentWeek.length > 0) {
        weeks.push(currentWeek)
        currentWeek = []
      }
      currentWeek.push(day)
    }
    if (currentWeek.length > 0) weeks.push(currentWeek)
    return weeks
  }, [stats.heatmapData])

  const getHeatmapColor = (hours: number) => {
    if (hours === 0) return "bg-secondary"
    if (hours < 2) return "bg-accent/20"
    if (hours < 4) return "bg-accent/40"
    if (hours < 6) return "bg-accent/60"
    if (hours < 8) return "bg-accent/80"
    return "bg-accent"
  }

  return (
    <div className="space-y-6">
      {/* Top summary row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15">
              <Briefcase className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">This Week</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{mToStr(stats.week.workMin)}</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {stats.week.days} days
                {(stats.week.officeMin > 0 || stats.week.homeMin > 0) && (
                  <span className="ml-1">
                    (<span className="text-blue-400">{mToStr(stats.week.officeMin)}</span>
                    {stats.week.homeMin > 0 && (
                      <> / <span className="text-violet-400">{mToStr(stats.week.homeMin)}</span></>
                    )})
                  </span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
              <Building2 className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">This Month</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{mToStr(stats.month.workMin)}</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {stats.month.days} days
                {(stats.month.officeMin > 0 || stats.month.homeMin > 0) && (
                  <span className="ml-1">
                    (<span className="text-blue-400">{mToStr(stats.month.officeMin)}</span>
                    {stats.month.homeMin > 0 && (
                      <> / <span className="text-violet-400">{mToStr(stats.month.homeMin)}</span></>
                    )})
                  </span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15">
              <Home className="h-5 w-5 text-violet-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Location Split</p>
              {(stats.allTime.officeMin + stats.allTime.homeMin) > 0 ? (
                <>
                  <div className="mt-1 flex h-2.5 overflow-hidden rounded-full">
                    <div className="bg-blue-400 transition-all" style={{ width: `${Math.round((stats.allTime.officeMin / (stats.allTime.officeMin + stats.allTime.homeMin)) * 100)}%` }} />
                    <div className="bg-violet-400 transition-all" style={{ width: `${Math.round((stats.allTime.homeMin / (stats.allTime.officeMin + stats.allTime.homeMin)) * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                    <span className="text-blue-400">{Math.round((stats.allTime.officeMin / (stats.allTime.officeMin + stats.allTime.homeMin)) * 100)}%</span> office / <span className="text-violet-400">{Math.round((stats.allTime.homeMin / (stats.allTime.officeMin + stats.allTime.homeMin)) * 100)}%</span> home
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm tabular-nums text-muted-foreground">No data yet</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
              <Flame className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Current Streak</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{stats.currentStreak} days</p>
              <p className="text-xs tabular-nums text-muted-foreground">Best: {stats.longestStreak}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pink-500/15">
              <Target className="h-5 w-5 text-pink-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">All Time</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{mToStr(stats.allTime.workMin)}</p>
              <p className="text-xs tabular-nums text-muted-foreground">{stats.allTime.daysWorked} days, {stats.allTime.totalSessions} sessions</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Heatmap + This Week side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Heatmap */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-accent" />
              Activity Heatmap
            </CardTitle>
            <CardDescription>Work hours per day over the last 16 weeks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="flex gap-0.5">
                {/* Day labels */}
                <div className="flex flex-col gap-0.5 pr-1">
                  {DAY_LABELS.map(label => (
                    <div key={label} className="flex h-3.5 w-6 items-center text-[10px] text-muted-foreground">
                      {label.charAt(0)}
                    </div>
                  ))}
                </div>
                {/* Weeks */}
                {heatmapWeeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-0.5">
                    {Array.from({ length: 7 }).map((_, dow) => {
                      const day = week.find(d => d.dow === dow)
                      if (!day) return <div key={dow} className="h-3.5 w-3.5" />
                      return (
                        <div
                          key={dow}
                          className={`h-3.5 w-3.5 rounded-[2px] ${getHeatmapColor(day.hours)}`}
                          title={`${day.label}: ${day.hours.toFixed(1)}h`}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
              {/* Legend */}
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span>Less</span>
                <div className="h-3 w-3 rounded-[2px] bg-secondary" />
                <div className="h-3 w-3 rounded-[2px] bg-accent/20" />
                <div className="h-3 w-3 rounded-[2px] bg-accent/40" />
                <div className="h-3 w-3 rounded-[2px] bg-accent/60" />
                <div className="h-3 w-3 rounded-[2px] bg-accent/80" />
                <div className="h-3 w-3 rounded-[2px] bg-accent" />
                <span>More</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Weekly Stats */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Briefcase className="h-4 w-4 text-accent" />
                {isCurrentWeek ? "This Week" : "Week View"}
              </CardTitle>
              <div className="flex items-center gap-1">
                {!isCurrentWeek && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setSelectedWeekStart(startOfWeek(today, { weekStartsOn: 1 }))}
                  >
                    This Week
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setSelectedWeekStart((prev) => subWeeks(prev, 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={isCurrentWeek}
                  onClick={() => setSelectedWeekStart((prev) => addWeeks(prev, 1))}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <CardDescription className="flex items-center gap-2">
              <span>{weekStats.startLabel} &ndash; {weekStats.endLabel}</span>
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium">
                {weekStats.workDayCount === 5 ? "Mon-Fri" : "Mon-Wed"}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-[11px] text-muted-foreground">Total</p>
                <p className="text-lg font-bold tabular-nums text-accent">
                  {mToStr(weekStats.weekWorkMinTotal)}
                </p>
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  of {weekStats.weeklyQuota}h quota
                </p>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-[11px] text-muted-foreground">Avg / Day</p>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {mToStr(weekStats.weekAvgPerDay)}
                </p>
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {weekStats.daysWorked} day{weekStats.daysWorked !== 1 ? "s" : ""} worked
                </p>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-[11px] text-muted-foreground">
                  {weekStats.isInPast ? "Needed / Day" : "Need / Day"}
                </p>
                <p className={`text-lg font-bold tabular-nums ${
                  weekStats.isInPast
                    ? (weekStats.weekWorkMinTotal >= weekStats.weeklyQuota * 60 ? "text-accent" : "text-destructive")
                    : weekStats.hoursRemaining <= 0 ? "text-accent" : "text-amber-400"
                }`}>
                  {weekStats.isInPast
                    ? (weekStats.weekWorkMinTotal >= weekStats.weeklyQuota * 60 ? "Done!" : `${((weekStats.weeklyQuota * 60 - weekStats.weekWorkMinTotal) / 60).toFixed(1)}h short`)
                    : weekStats.hoursRemaining <= 0 ? "Done!" : `${weekStats.hoursPerRemainingDay.toFixed(1)}h`
                  }
                </p>
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {weekStats.isInPast
                    ? (weekStats.weekWorkMinTotal >= weekStats.weeklyQuota * 60 ? "Quota reached" : "Quota missed")
                    : weekStats.hoursRemaining <= 0 ? "Quota reached" : `${weekStats.hoursRemaining.toFixed(1)}h left`
                  }
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span>Weekly progress</span>
                <span className="tabular-nums">{Math.min(100, Math.round((weekStats.weekWorkMinTotal / (weekStats.weeklyQuota * 60)) * 100))}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${Math.min(100, (weekStats.weekWorkMinTotal / (weekStats.weeklyQuota * 60)) * 100)}%` }}
                />
              </div>
            </div>

            {/* Day-by-day breakdown */}
            <div className="space-y-1.5">
              {weekStats.thisWeekDaily.map((d) => {
                const barPct = Math.min(100, (d.hours / 8) * 100)
                const isWeekend = d.label === "Sat" || d.label === "Sun"
                return (
                  <div key={d.date} className="flex items-center gap-3">
                    <span className={`w-9 text-xs shrink-0 ${d.isToday ? "font-bold text-accent" : d.isFuture ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                      {d.label}
                    </span>
                    <div className="flex-1 h-5 rounded bg-secondary/40 overflow-hidden relative">
                      {d.hours > 0 && (
                        <div
                          className={`h-full rounded transition-all ${d.isToday ? "bg-accent" : "bg-accent/60"}`}
                          style={{ width: `${barPct}%` }}
                        />
                      )}
                      {!isWeekend && (
                        <div className="absolute top-0 bottom-0 w-px bg-muted-foreground/30" style={{ left: "100%" }} />
                      )}
                    </div>
                    <span className={`w-12 text-right text-xs tabular-nums shrink-0 ${
                      d.hours === 0 && d.isPast && !d.isToday && !isWeekend
                        ? "text-muted-foreground/40"
                        : d.isToday
                          ? "font-medium text-accent"
                          : d.isFuture
                            ? "text-muted-foreground/40"
                            : "text-foreground"
                    }`}>
                      {d.hours > 0 ? `${d.hours.toFixed(1)}h` : d.isFuture ? "--" : "0h"}
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Last 30 days area chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-accent" />
              Last 30 Days
            </CardTitle>
            <CardDescription>Daily hours worked, office, and home</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                work: { label: "Hours Worked", color: "#4ade80" },
                office: { label: "In Office", color: "#60a5fa" },
                home: { label: "At Home", color: "#a78bfa" },
              }}
              className="h-[220px]"
            >
              <AreaChart data={stats.dailyChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="workGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="officeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="homeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(0 0% 45%)" }} interval={6} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(0 0% 45%)" }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area type="monotone" dataKey="office" stroke="#60a5fa" fill="url(#officeGradient)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="home" stroke="#a78bfa" fill="url(#homeGradient)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="work" stroke="#4ade80" fill="url(#workGradient)" strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Weekly trends */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-accent" />
              Weekly Trends
            </CardTitle>
            <CardDescription>Last 12 weeks</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                work: { label: "Hours Worked", color: "#4ade80" },
                office: { label: "In Office", color: "#60a5fa" },
                home: { label: "At Home", color: "#a78bfa" },
              }}
              className="h-[220px]"
            >
              <BarChart data={stats.weeklyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(0 0% 45%)" }} interval={2} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(0 0% 45%)" }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="office" fill="#60a5fa" radius={[2, 2, 0, 0]} opacity={0.4} />
                <Bar dataKey="home" fill="#a78bfa" radius={[2, 2, 0, 0]} opacity={0.4} />
                <Bar dataKey="work" fill="#4ade80" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Project breakdown + Day of week */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Project distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="h-4 w-4 text-accent" />
              Project Distribution
            </CardTitle>
            <CardDescription>All-time hours by project</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.projectPieData.length > 0 ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="mx-auto h-[180px] w-[180px] shrink-0">
                  <ChartContainer
                    config={Object.fromEntries(
                      stats.projectPieData.map((p, i) => [
                        p.name,
                        { label: p.name, color: CHART_COLORS[i % CHART_COLORS.length] },
                      ])
                    )}
                    className="h-[180px] w-[180px]"
                  >
                    <PieChart>
                      <Pie
                        data={stats.projectPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                      >
                        {stats.projectPieData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip
                        content={<ChartTooltipContent nameKey="name" />}
                      />
                    </PieChart>
                  </ChartContainer>
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  {stats.projectPieData.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="flex-1 truncate text-sm text-foreground">{p.name}</span>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{p.value}h</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No project data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Day of week pattern */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarRange className="h-4 w-4 text-accent" />
              Day of Week Pattern
            </CardTitle>
            <CardDescription>Average hours worked by day</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                avgHours: { label: "Avg Hours", color: "#4ade80" },
              }}
              className="h-[200px]"
            >
              <BarChart data={stats.dayOfWeekAvg} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(0 0% 45%)" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(0 0% 45%)" }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="avgHours" fill="#4ade80" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Fun stats and averages */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avg Work / Day</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-accent">{mToStr(stats.avgWorkPerDay)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avg Office / Day</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-blue-400">{mToStr(stats.avgOfficePerDay)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avg Home / Day</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-violet-400">{mToStr(stats.avgHomePerDay)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avg Clock In</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{formatMinutesAsTime(stats.avgClockIn)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avg Clock Out</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{formatMinutesAsTime(stats.avgClockOut)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Fun section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-amber-400" />
            Fun Numbers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground">Total Lunch Time</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-amber-400">{mToStr(stats.allTime.lunchMin)}</p>
              <p className="text-xs text-muted-foreground">Avg {mToStr(stats.avgLunchPerDay)} / day</p>
            </div>
            <div className="rounded-lg bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground">Total Break Time</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-orange-400">{mToStr(stats.allTime.breakMin)}</p>
              <p className="text-xs text-muted-foreground">{stats.allTime.daysWorked > 0 ? mToStr(stats.allTime.breakMin / stats.allTime.daysWorked) : "0h 0m"} avg / day</p>
            </div>
            <div className="rounded-lg bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground">Most Productive Day</p>
              {stats.bestDayDate ? (
                <>
                  <p className="mt-1 text-lg font-bold tabular-nums text-pink-400">{mToStr(stats.bestDayMins)}</p>
                  <p className="text-xs text-muted-foreground">{format(parseISO(stats.bestDayDate), "EEEE, MMM d")}</p>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">No data yet</p>
              )}
            </div>
            <div className="rounded-lg bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground">Total Work Sessions</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-accent">{stats.allTime.totalSessions}</p>
              <p className="text-xs text-muted-foreground">{stats.allTime.daysWorked > 0 ? (stats.allTime.totalSessions / stats.allTime.daysWorked).toFixed(1) : 0} avg / day</p>
            </div>
            <div className="rounded-lg bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground">Avg Session Length</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-blue-400">
                {stats.allTime.totalSessions > 0 ? mToStr(stats.allTime.workMin / stats.allTime.totalSessions) : "0h 0m"}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground">Work-to-Presence Ratio</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-green-400">
                {(stats.allTime.officeMin + stats.allTime.homeMin) > 0
                  ? `${Math.round((stats.allTime.workMin / (stats.allTime.officeMin + stats.allTime.homeMin)) * 100)}%`
                  : "--"}
              </p>
              <p className="text-xs text-muted-foreground">Active work vs clocked time</p>
            </div>
            {stats.allTime.homeMin > 0 && (
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">Office / Home Split</p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-lg font-bold tabular-nums text-blue-400">{mToStr(stats.allTime.officeMin)}</p>
                  <span className="text-xs text-muted-foreground">/</span>
                  <p className="text-lg font-bold tabular-nums text-violet-400">{mToStr(stats.allTime.homeMin)}</p>
                </div>
                <div className="mt-1.5 flex h-2 overflow-hidden rounded-full">
                  <div className="bg-blue-400" style={{ width: `${Math.round((stats.allTime.officeMin / (stats.allTime.officeMin + stats.allTime.homeMin)) * 100)}%` }} />
                  <div className="bg-violet-400" style={{ width: `${Math.round((stats.allTime.homeMin / (stats.allTime.officeMin + stats.allTime.homeMin)) * 100)}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {Math.round((stats.allTime.officeMin / (stats.allTime.officeMin + stats.allTime.homeMin)) * 100)}% office / {Math.round((stats.allTime.homeMin / (stats.allTime.officeMin + stats.allTime.homeMin)) * 100)}% home
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
