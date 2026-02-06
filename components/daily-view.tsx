"use client"

import { format, parseISO } from "date-fns"
import { Timer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DateSelector } from "./date-selector"
import { TimeEntry } from "./time-entry"
import { DayProjects } from "./day-projects"
import type { Project, DayEntry, DayProjectEntry } from "@/lib/types"

interface DailyViewProps {
  selectedDate: string
  onDateChange: (date: string) => void
  entry: DayEntry | undefined
  entries: DayEntry[]
  projects: Project[]
  onUpdateEntry: (data: Partial<DayEntry>) => void
  onAddProject: (projectId: string) => void
  onUpdateProject: (projectEntryId: string, data: Partial<DayProjectEntry>) => void
  onRemoveProject: (projectEntryId: string) => void
  onReorderProjects: (fromIndex: number, toIndex: number) => void
  onRoundToFive: () => void
}

export function DailyView({
  selectedDate,
  onDateChange,
  entry,
  entries,
  projects,
  onUpdateEntry,
  onAddProject,
  onUpdateProject,
  onRemoveProject,
  onReorderProjects,
  onRoundToFive,
}: DailyViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Daily Time Log</h2>
          <p className="text-sm text-muted-foreground">
            Track your hours and project work for {format(parseISO(selectedDate), "MMMM d, yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DateSelector selectedDate={selectedDate} onDateChange={onDateChange} />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onRoundToFive}
                  className="h-9 w-9 shrink-0 bg-transparent"
                  disabled={!entry}
                >
                  <Timer className="h-4 w-4" />
                  <span className="sr-only">Round all times to nearest 5 minutes</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Round all times to nearest 5 min</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TimeEntry
          entry={entry}
          selectedDate={selectedDate}
          onUpdate={onUpdateEntry}
          dayProjects={entry?.projects ?? []}
          onUpdateProject={onUpdateProject}
        />
        <DayProjects
          projects={projects}
          dayProjects={entry?.projects ?? []}
          onAddProject={onAddProject}
          onUpdateProject={onUpdateProject}
          onRemoveProject={onRemoveProject}
          onReorderProjects={onReorderProjects}
        />
      </div>
    </div>
  )
}
