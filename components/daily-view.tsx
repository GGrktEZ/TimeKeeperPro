"use client"

import { format, parseISO } from "date-fns"
import { DateSelector } from "./date-selector"
import { TimeEntry } from "./time-entry"
import { DayProjects } from "./day-projects"
import type { Project, DayEntry, DayProjectEntry, TodoGroup, TodoItem } from "@/lib/types"

interface DailyViewProps {
  selectedDate: string
  onDateChange: (date: string) => void
  entry: DayEntry | undefined
  entries: DayEntry[]
  projects: Project[]
  todoGroups: TodoGroup[]
  onUpdateEntry: (data: Partial<DayEntry>) => void
  onAddProject: (projectId: string, taskId?: string) => void
  onUpdateProject: (projectEntryId: string, data: Partial<DayProjectEntry>) => void
  onRemoveProject: (projectEntryId: string) => void
  onReorderProjects: (fromIndex: number, toIndex: number) => void
  onUpdateTodoItem: (groupId: string, itemId: string, data: Partial<TodoItem>) => void
}

export function DailyView({
  selectedDate,
  onDateChange,
  entry,
  entries,
  projects,
  todoGroups,
  onUpdateEntry,
  onAddProject,
  onUpdateProject,
  onRemoveProject,
  onReorderProjects,
  onUpdateTodoItem,
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
        <DateSelector selectedDate={selectedDate} onDateChange={onDateChange} />
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
          todoGroups={todoGroups}
          onAddProject={onAddProject}
          onUpdateProject={onUpdateProject}
          onRemoveProject={onRemoveProject}
          onReorderProjects={onReorderProjects}
          onUpdateTodoItem={onUpdateTodoItem}
        />
      </div>
    </div>
  )
}
