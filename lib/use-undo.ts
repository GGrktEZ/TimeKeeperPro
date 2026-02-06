"use client"

import { useState, useCallback, useRef, useEffect } from "react"

interface UndoEntry {
  label: string
  timestamp: number
  entriesSnapshot: string
  projectsSnapshot: string
}

const MAX_HISTORY = 30

export function useUndo() {
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([])
  const restoreRef = useRef<((entries: string, projects: string) => void) | null>(null)
  // Debounce: avoid pushing a snapshot for every keystroke
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSnapshotRef = useRef<{ entries: string; projects: string } | null>(null)

  const setRestoreCallback = useCallback(
    (cb: (entries: string, projects: string) => void) => {
      restoreRef.current = cb
    },
    []
  )

  // Push a snapshot before a significant action
  const pushSnapshot = useCallback(
    (label: string, entriesJson: string, projectsJson: string) => {
      // Don't push identical consecutive snapshots
      if (
        lastSnapshotRef.current &&
        lastSnapshotRef.current.entries === entriesJson &&
        lastSnapshotRef.current.projects === projectsJson
      ) {
        return
      }

      const entry: UndoEntry = {
        label,
        timestamp: Date.now(),
        entriesSnapshot: entriesJson,
        projectsSnapshot: projectsJson,
      }

      setUndoStack((prev) => {
        const next = [...prev, entry]
        if (next.length > MAX_HISTORY) next.shift()
        return next
      })
      // Clear redo on new action
      setRedoStack([])
      lastSnapshotRef.current = { entries: entriesJson, projects: projectsJson }
    },
    []
  )

  // Debounced snapshot for rapid input changes (typing in notes, etc.)
  const pushDebouncedSnapshot = useCallback(
    (label: string, entriesJson: string, projectsJson: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        pushSnapshot(label, entriesJson, projectsJson)
      }, 1000)
    },
    [pushSnapshot]
  )

  const undo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      const rest = prev.slice(0, -1)

      // Push current state to redo before restoring
      if (restoreRef.current && lastSnapshotRef.current) {
        setRedoStack((rs) => [
          ...rs,
          {
            label: last.label,
            timestamp: Date.now(),
            entriesSnapshot: lastSnapshotRef.current!.entries,
            projectsSnapshot: lastSnapshotRef.current!.projects,
          },
        ])
      }

      // Restore
      if (restoreRef.current) {
        restoreRef.current(last.entriesSnapshot, last.projectsSnapshot)
        lastSnapshotRef.current = {
          entries: last.entriesSnapshot,
          projects: last.projectsSnapshot,
        }
      }

      return rest
    })
  }, [])

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      const rest = prev.slice(0, -1)

      // Push current state to undo before redoing
      if (restoreRef.current && lastSnapshotRef.current) {
        setUndoStack((us) => [
          ...us,
          {
            label: last.label,
            timestamp: Date.now(),
            entriesSnapshot: lastSnapshotRef.current!.entries,
            projectsSnapshot: lastSnapshotRef.current!.projects,
          },
        ])
      }

      // Restore
      if (restoreRef.current) {
        restoreRef.current(last.entriesSnapshot, last.projectsSnapshot)
        lastSnapshotRef.current = {
          entries: last.entriesSnapshot,
          projects: last.projectsSnapshot,
        }
      }

      return rest
    })
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC")
      const mod = isMac ? e.metaKey : e.ctrlKey

      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      if (mod && e.key === "z" && e.shiftKey) {
        e.preventDefault()
        redo()
      }
      // Ctrl+Y for redo on Windows
      if (mod && e.key === "y" && !isMac) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [undo, redo])

  return {
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoLabel: undoStack.length > 0 ? undoStack[undoStack.length - 1].label : null,
    redoLabel: redoStack.length > 0 ? redoStack[redoStack.length - 1].label : null,
    pushSnapshot,
    pushDebouncedSnapshot,
    setRestoreCallback,
    undo,
    redo,
  }
}
