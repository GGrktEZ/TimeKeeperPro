"use client"

//temp comment delete me
import { Undo2, Redo2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface UndoBarProps {
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null
  onUndo: () => void
  onRedo: () => void
}

export function UndoBar({
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
}: UndoBarProps) {
  if (!canUndo && !canRedo) return null

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 shadow-lg">
      <Button
        variant="ghost"
        size="sm"
        onClick={onUndo}
        disabled={!canUndo}
        className="h-8 gap-1.5 text-xs"
        title={undoLabel ? `Undo: ${undoLabel}` : "Nothing to undo"}
      >
        <Undo2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Undo</span>
      </Button>

      {undoLabel && canUndo && (
        <span className="max-w-[120px] truncate text-xs text-muted-foreground">
          {undoLabel}
        </span>
      )}

      <div className="mx-1 h-4 w-px bg-border" />

      <Button
        variant="ghost"
        size="sm"
        onClick={onRedo}
        disabled={!canRedo}
        className="h-8 gap-1.5 text-xs"
        title={redoLabel ? `Redo: ${redoLabel}` : "Nothing to redo"}
      >
        <Redo2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Redo</span>
      </Button>
    </div>
  )
}
