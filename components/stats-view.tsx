"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell,
  AreaChart, Area,
} from "recharts"
import {
  Briefcase, Building2, CalendarDays, TrendingUp,
  Flame, Target, BarChart3, Zap, CalendarRange, Home,
} from "lucide-react"
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, isWithinInterval,
  format, subDays, eachDayOfInterval, getDay, subWeeks,
} from "date-fns"
import type { DayEntry, Project } from "@/lib/types"

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
  let total = 0
  for (const a of entry.attendance ?? []) {
    if (a.start && a.end) {
      const [iH, iM] = a.start.split(":").map(Number)
      const [oH, oM] = a.end.split(":").map(Number)
      const d = (oH * 60 + oM) - (iH * 60 + iM)
      if (d > 0) total += d
    }
  }
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

function entryHomeMinutes(entry: DayEntry): number {
  let total = 0
  for (const a of entry.attendance ?? []) {
    if (a.start && a.end && a.location === "home") {
      const [iH, iM] = a.start.split(":").map(Number)
      const [oH, oM] = a.end.split(":").map(Number)
      const d = (oH * 60 + oM) - (iH * 60 + iM)
      if (d > 0) total += d
    }
  }
  return total
}

function entryInOfficeMinutes(entry: DayEntry): number {
  let total = 0
  for (const a of entry.attendance ?? []) {
    if (a.start && a.end && a.location === "office") {
      const [iH, iM] = a.start.split(":").map(Number)
      const [oH, oM] = a.end.split(":").map(Number)
      const d = (oH * 60 + oM) - (iH * 60 + iM)
      if (d > 0) total += d
    }
  }
  return total
}

function entryLunchMinutes(entry: DayEntry): number {
  if (!entry.lunchStart || !entry.lunchEnd) return 0
  const [sH, sM] = entry.lunchStart.split(":").map(Number)
  const [eH, eM] = entry.lunchEnd.split(":").map(Number)
  const d = (eH * 60 + eM) - (sH * 60 + sM)
  return d > 0 ? d : 0
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
      workMin: 0, officeMin: 0, lunchMin: 0, breakMin: 0,
      daysWorked: 0, totalSessions: 0,
      homeMin: 0, inOfficeMin: 0, homeOfficeDays: 0, inOfficeDays: 0, mixedDays: 0,
    }
    const weekStart = startOfWeek(today, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 })
    const monthStart = startOfMonth(today)
    const monthEnd = endOfMonth(today)

    const week = { workMin: 0, officeMin: 0, days: 0 }
    const month = { workMin: 0, officeMin: 0, days: 0 }

    // Per-project totals
    const projectWork: Record<string, number> = {}
    // Per-day-of-week totals
    const dayOfWeekWork: number[] = [0, 0, 0, 0, 0, 0, 0]
    const dayOfWeekCount: number[] = [0, 0, 0, 0, 0, 0, 0]
    // Daily data for charts (last 30 days)
    const thirtyDaysAgo = subDays(today, 29)
    const last30 = eachDayOfInterval({ start: thirtyDaysAgo, end: today })
    const dailyMap = new Map<string, { work: number; office: number; home: number; inOffice: number }>()

    // Last 12 weeks data
    const weeklyData: { label: string; work: number; office: number; home: number; inOffice: number }[] = []
    for (let w = 11; w >= 0; w--) {
      const ws = startOfWeek(subWeeks(today, w), { weekStartsOn: 1 })
      weeklyData.push({
        label: format(ws, "MMM d"),
        work: 0,
        office: 0,
        home: 0,
        inOffice: 0,
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
      const office = entryOfficeMinutes(e)
      const lunch = entryLunchMinutes(e)
      const breaks = entryBreakMinutes(e)
      const sessCount = (e.projects ?? []).reduce((acc, p) => acc + (p.workSessions?.filter(s => s.start && s.end).length ?? 0), 0)
      const d = parseISO(e.date)

      const homeMins = entryHomeMinutes(e)
      const inOfficeMins = entryInOfficeMinutes(e)

      if (work > 0 || office > 0) {
        allTime.daysWorked++
        streakCheck.add(e.date)
        const hasHome = homeMins > 0
        const hasOffice = inOfficeMins > 0
        if (hasHome && hasOffice) allTime.mixedDays++
        else if (hasHome) allTime.homeOfficeDays++
        else if (hasOffice) allTime.inOfficeDays++
      }
      allTime.workMin += work
      allTime.officeMin += office
      allTime.lunchMin += lunch
      allTime.breakMin += breaks
      allTime.totalSessions += sessCount
      allTime.homeMin += homeMins
      allTime.inOfficeMin += inOfficeMins

      // Clock times from attendance periods
      const attendancePeriods = e.attendance ?? []
      if (attendancePeriods.length > 0) {
        // Earliest start
        const starts = attendancePeriods.filter(a => a.start).map(a => {
          const [h, m] = a.start.split(":").map(Number)
          return h * 60 + m
        })
        if (starts.length > 0) clockInTimes.push(Math.min(...starts))

        // Latest end
        const ends = attendancePeriods.filter(a => a.end).map(a => {
          const [h, m] = a.end.split(":").map(Number)
          return h * 60 + m
        })
        if (ends.length > 0) clockOutTimes.push(Math.max(...ends))
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
        if (work > 0 || office > 0) week.days++
      }
      if (isWithinInterval(d, { start: monthStart, end: monthEnd })) {
        month.workMin += work
        month.officeMin += office
        if (work > 0 || office > 0) month.days++
      }

      // Daily map for last 30 days
      dailyMap.set(e.date, { work, office, home: homeMins, inOffice: inOfficeMins })

      // Weekly chart data
      for (const wd of weeklyData) {
        const ws = startOfWeek(parseISO(wd.label.length < 8 ? `2026-${wd.label}` : wd.label), { weekStartsOn: 1 })
        const we = endOfWeek(ws, { weekStartsOn: 1 })
        if (isWithinInterval(d, { start: ws, end: we })) {
          wd.work += work / 60
          wd.office += office / 60
          wd.home += homeMins / 60
          wd.inOffice += inOfficeMins / 60
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
      const data = dailyMap.get(key) || { work: 0, office: 0, home: 0, inOffice: 0 }
      return {
        date: format(d, "MMM d"),
        day: format(d, "EEE"),
        work: Math.round((data.work / 60) * 10) / 10,
        office: Math.round((data.office / 60) * 10) / 10,
        home: Math.round((data.home / 60) * 10) / 10,
        inOffice: Math.round((data.inOffice / 60) * 10) / 10,
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
    const avgLunchPerDay = allTime.lunchMin > 0 && allTime.daysWorked > 0 ? allTime.lunchMin / allTime.daysWorked : 0

    return {
      allTime, week, month,
      currentStreak, longestStreak,
      dailyChartData, heatmapData,
      projectPieData, dayOfWeekAvg,
      avgClockIn, avgClockOut,
      bestDayDate, bestDayMins,
      avgWorkPerDay, avgOfficePerDay, avgLunchPerDay,
      weeklyData: weeklyData.map(w => ({
        ...w,
        work: Math.round(w.work * 10) / 10,
        office: Math.round(w.office * 10) / 10,
        home: Math.round(w.home * 10) / 10,
        inOffice: Math.round(w.inOffice * 10) / 10,
      })),
    }
  }, [entries, projects, today])

  const formatMinutesAsTime = (mins: number | null) => {
    if (mins === null) return "--:--"
    const h = Math.floor(mins / 60)
    const m = Math.round(mins % 60)
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
  }

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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15">
              <Briefcase className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">This Week</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{mToStr(stats.week.workMin)}</p>
              <p className="text-xs tabular-nums text-muted-foreground">{stats.week.days} days</p>
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
              <p className="text-xs tabular-nums text-muted-foreground">{stats.month.days} days</p>
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

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Last 30 days area chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-accent" />
              Last 30 Days
            </CardTitle>
            <CardDescription>Daily hours worked vs in office</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                work: { label: "Hours Worked", color: "#4ade80" },
                home: { label: "Home", color: "#22d3ee" },
                inOffice: { label: "Office", color: "#60a5fa" },
              }}
              className="h-[220px]"
            >
              <AreaChart data={stats.dailyChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="workGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="homeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="inOfficeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(0 0% 45%)" }} interval={6} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(0 0% 45%)" }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area type="monotone" dataKey="inOffice" stroke="#60a5fa" fill="url(#inOfficeGradient)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="home" stroke="#22d3ee" fill="url(#homeGradient)" strokeWidth={1.5} />
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
            <CardDescription>Last 12 weeks -- attendance by location</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                home: { label: "Home", color: "#22d3ee" },
                inOffice: { label: "Office", color: "#60a5fa" },
                work: { label: "Hours Worked", color: "#4ade80" },
              }}
              className="h-[220px]"
            >
              <BarChart data={stats.weeklyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(0 0% 45%)" }} interval={2} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(0 0% 45%)" }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="inOffice" stackId="location" fill="#60a5fa" radius={[0, 0, 0, 0]} opacity={0.5} />
                <Bar dataKey="home" stackId="location" fill="#22d3ee" radius={[2, 2, 0, 0]} opacity={0.5} />
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
      {/* Location Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Home className="h-4 w-4 text-cyan-400" />
            Location Breakdown
          </CardTitle>
          <CardDescription>Home office vs in-office time distribution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Visual bar */}
            <div className="sm:col-span-3">
              {stats.allTime.homeMin + stats.allTime.inOfficeMin > 0 ? (
                <div className="space-y-2">
                  <div className="flex h-4 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-cyan-500 transition-all"
                      style={{ width: `${Math.round((stats.allTime.homeMin / (stats.allTime.homeMin + stats.allTime.inOfficeMin)) * 100)}%` }}
                    />
                    <div
                      className="bg-blue-500 transition-all"
                      style={{ width: `${Math.round((stats.allTime.inOfficeMin / (stats.allTime.homeMin + stats.allTime.inOfficeMin)) * 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-500" />
                      Home {Math.round((stats.allTime.homeMin / (stats.allTime.homeMin + stats.allTime.inOfficeMin)) * 100)}%
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
                      Office {Math.round((stats.allTime.inOfficeMin / (stats.allTime.homeMin + stats.allTime.inOfficeMin)) * 100)}%
                    </span>
                  </div>
                </div>
              ) : (
                <p className="py-2 text-center text-sm text-muted-foreground">No location data yet</p>
              )}
            </div>

            {/* Home stats */}
            <div className="rounded-lg bg-cyan-500/10 p-3">
              <div className="flex items-center gap-2">
                <Home className="h-4 w-4 text-cyan-400" />
                <p className="text-sm font-medium text-cyan-400">Home</p>
              </div>
              <p className="mt-2 text-xl font-bold tabular-nums text-foreground">{mToStr(stats.allTime.homeMin)}</p>
              <p className="text-xs text-muted-foreground">
                {stats.allTime.homeOfficeDays} full days, {stats.allTime.mixedDays > 0 ? `${stats.allTime.mixedDays} mixed` : "0 mixed"}
              </p>
            </div>

            {/* Office stats */}
            <div className="rounded-lg bg-blue-500/10 p-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-400" />
                <p className="text-sm font-medium text-blue-400">Office</p>
              </div>
              <p className="mt-2 text-xl font-bold tabular-nums text-foreground">{mToStr(stats.allTime.inOfficeMin)}</p>
              <p className="text-xs text-muted-foreground">
                {stats.allTime.inOfficeDays} full days, {stats.allTime.mixedDays > 0 ? `${stats.allTime.mixedDays} mixed` : "0 mixed"}
              </p>
            </div>

            {/* Per-day averages */}
            <div className="rounded-lg bg-secondary/30 p-3">
              <p className="text-sm font-medium text-muted-foreground">Per Day</p>
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Avg home</span>
                  <span className="text-sm font-bold tabular-nums text-cyan-400">
                    {stats.allTime.homeOfficeDays + stats.allTime.mixedDays > 0
                      ? mToStr(stats.allTime.homeMin / (stats.allTime.homeOfficeDays + stats.allTime.mixedDays))
                      : "--"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Avg office</span>
                  <span className="text-sm font-bold tabular-nums text-blue-400">
                    {stats.allTime.inOfficeDays + stats.allTime.mixedDays > 0
                      ? mToStr(stats.allTime.inOfficeMin / (stats.allTime.inOfficeDays + stats.allTime.mixedDays))
                      : "--"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Averages row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avg Work / Day</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-accent">{mToStr(stats.avgWorkPerDay)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avg Attendance / Day</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-blue-400">{mToStr(stats.avgOfficePerDay)}</p>
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
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Home className="h-3 w-3" />
                Mixed Days
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-purple-400">{stats.allTime.mixedDays}</p>
              <p className="text-xs text-muted-foreground">
                {stats.allTime.daysWorked > 0
                  ? `${Math.round((stats.allTime.mixedDays / stats.allTime.daysWorked) * 100)}% of work days split`
                  : "No data yet"}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground">Work-to-Office Ratio</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-green-400">
                {stats.allTime.officeMin > 0
                  ? `${Math.round((stats.allTime.workMin / stats.allTime.officeMin) * 100)}%`
                  : "--"}
              </p>
              <p className="text-xs text-muted-foreground">Time spent actively working</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
