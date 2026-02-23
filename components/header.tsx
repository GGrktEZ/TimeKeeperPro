"use client"

import { Clock, FolderKanban, BarChart3, Database } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { View } from "@/lib/types"

interface HeaderProps {
  currentView: View
  onViewChange: (view: View) => void
}

export function Header({
  currentView,
  onViewChange,
}: HeaderProps) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent">
              <Clock className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">TimeTrack Pro</h1>
              <p className="text-xs text-muted-foreground">Timekeeping & Documentation</p>
            </div>
          </div>

          <nav className="flex items-center rounded-lg bg-secondary p-1">
            <Button
              variant={currentView === "daily" ? "default" : "ghost"}
              size="sm"
              onClick={() => onViewChange("daily")}
              className="gap-2"
            >
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Daily Log</span>
            </Button>
            <Button
              variant={currentView === "projects" ? "default" : "ghost"}
              size="sm"
              onClick={() => onViewChange("projects")}
              className="gap-2"
            >
              <FolderKanban className="h-4 w-4" />
              <span className="hidden sm:inline">Projects</span>
            </Button>
            <Button
              variant={currentView === "stats" ? "default" : "ghost"}
              size="sm"
              onClick={() => onViewChange("stats")}
              className="gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Stats</span>
            </Button>

            <div className="mx-1 h-5 w-px bg-border" />

            <Button
              variant={currentView === "data" ? "default" : "ghost"}
              size="sm"
              onClick={() => onViewChange("data")}
              className="gap-2"
            >
              <Database className="h-4 w-4" />
              <span className="hidden sm:inline">Data</span>
            </Button>
          </nav>
        </div>
      </div>
    </header>
  )
}
