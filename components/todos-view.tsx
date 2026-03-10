"use client"

import { useState, useRef, useEffect } from "react"
import { Plus, Trash2, CheckSquare, Square, GripVertical, Pencil, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { TodoGroup, TodoItem } from "@/lib/types"

interface TodosViewProps {
  groups: TodoGroup[]
  onAddGroup: (name: string) => void
  onUpdateGroupName: (groupId: string, name: string) => void
  onDeleteGroup: (groupId: string) => void
  onAddItem: (groupId: string, text: string) => void
  onUpdateItem: (groupId: string, itemId: string, data: Partial<TodoItem>) => void
  onDeleteItem: (groupId: string, itemId: string) => void
}

function EditableText({
  value,
  onSave,
  className,
  placeholder,
}: {
  value: string
  onSave: (v: string) => void
  className?: string
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onSave(trimmed)
    else setDraft(value)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 flex-1">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") { setDraft(value); setEditing(false) }
          }}
          className="h-7 py-0 text-sm"
          placeholder={placeholder}
        />
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={commit}>
          <Check className="h-3.5 w-3.5 text-green-600" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setDraft(value); setEditing(false) }}>
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
    )
  }

  return (
    <span
      className={cn("cursor-pointer hover:underline decoration-dotted", className)}
      onClick={() => { setDraft(value); setEditing(true) }}
    >
      {value}
    </span>
  )
}

function TodoItemRow({
  groupId,
  item,
  onUpdate,
  onDelete,
}: {
  groupId: string
  item: TodoItem
  onUpdate: (data: Partial<TodoItem>) => void
  onDelete: () => void
}) {
  return (
    <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/50">
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 cursor-grab" />
      <button
        onClick={() => onUpdate({ done: !item.done })}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      >
        {item.done
          ? <CheckSquare className="h-4 w-4 text-accent" />
          : <Square className="h-4 w-4" />
        }
      </button>
      <div className="flex-1 min-w-0">
        <EditableText
          value={item.text}
          onSave={(text) => onUpdate({ text })}
          className={cn(
            "text-sm break-words",
            item.done && "line-through text-muted-foreground"
          )}
          placeholder="Todo text"
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
      </Button>
    </div>
  )
}

function AddItemRow({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("")
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    const trimmed = text.trim()
    if (trimmed) { onAdd(trimmed); setText("") }
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0) }}
        className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground w-full rounded-md hover:bg-secondary/50 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add item
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <div className="w-3.5" />
      <div className="w-4" />
      <Input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") { setText(""); setOpen(false) }
        }}
        onBlur={commit}
        placeholder="New todo item…"
        className="h-7 py-0 text-sm flex-1"
      />
    </div>
  )
}

function GroupCard({
  group,
  onUpdateName,
  onDelete,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
}: {
  group: TodoGroup
  onUpdateName: (name: string) => void
  onDelete: () => void
  onAddItem: (text: string) => void
  onUpdateItem: (itemId: string, data: Partial<TodoItem>) => void
  onDeleteItem: (itemId: string) => void
}) {
  const doneCount = group.items.filter((i) => i.done).length
  const total = group.items.length

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <EditableText
            value={group.name}
            onSave={onUpdateName}
            className="font-semibold text-foreground"
            placeholder="Group name"
          />
          {total > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">
              {doneCount}/{total}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {total > 0 && (
        <div className="h-1 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: total ? `${(doneCount / total) * 100}%` : "0%" }}
          />
        </div>
      )}

      <div className="flex flex-col gap-0.5 mt-1">
        {group.items.map((item) => (
          <TodoItemRow
            key={item.id}
            groupId={group.id}
            item={item}
            onUpdate={(data) => onUpdateItem(item.id, data)}
            onDelete={() => onDeleteItem(item.id)}
          />
        ))}
        <AddItemRow onAdd={onAddItem} />
      </div>
    </div>
  )
}

function AddGroupRow({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    const trimmed = name.trim()
    if (trimmed) { onAdd(trimmed); setName("") }
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0) }}
        className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 w-full transition-colors"
      >
        <Plus className="h-4 w-4" />
        New group
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-2">
      <Input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") { setName(""); setOpen(false) }
        }}
        onBlur={commit}
        placeholder="Group name…"
        className="h-8 text-sm"
      />
      <Button size="sm" onClick={commit}>Add</Button>
    </div>
  )
}

export function TodosView({
  groups,
  onAddGroup,
  onUpdateGroupName,
  onDeleteGroup,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
}: TodosViewProps) {
  const totalItems = groups.reduce((s, g) => s + g.items.length, 0)
  const doneItems = groups.reduce((s, g) => s + g.items.filter((i) => i.done).length, 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Todos</h2>
          {totalItems > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {doneItems} of {totalItems} items done
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            onUpdateName={(name) => onUpdateGroupName(group.id, name)}
            onDelete={() => onDeleteGroup(group.id)}
            onAddItem={(text) => onAddItem(group.id, text)}
            onUpdateItem={(itemId, data) => onUpdateItem(group.id, itemId, data)}
            onDeleteItem={(itemId) => onDeleteItem(group.id, itemId)}
          />
        ))}
        <AddGroupRow onAdd={onAddGroup} />
      </div>
    </div>
  )
}
