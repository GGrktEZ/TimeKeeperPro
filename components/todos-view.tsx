"use client"

import { useState, useRef, useEffect } from "react"
import { Plus, Trash2, CheckSquare, Square, Briefcase, User, Link, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { TodoGroup, TodoItem, Project } from "@/lib/types"

interface TodosViewProps {
  groups: TodoGroup[]
  projects: Project[]
  onAddGroup: (name: string, type: 'work' | 'personal') => void
  onUpdateGroup: (groupId: string, data: Partial<Pick<TodoGroup, 'name' | 'type' | 'projectId'>>) => void
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
  item,
  onUpdate,
  onDelete,
}: {
  item: TodoItem
  onUpdate: (data: Partial<TodoItem>) => void
  onDelete: () => void
}) {
  return (
    <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-black/10 dark:hover:bg-white/5">
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
        className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground w-full rounded-md hover:bg-black/10 dark:hover:bg-white/5 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add item
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
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
  projects,
  onUpdateGroup,
  onDelete,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  accentClass,
  borderClass,
}: {
  group: TodoGroup
  projects: Project[]
  onUpdateGroup: (data: Partial<Pick<TodoGroup, 'name' | 'type' | 'projectId'>>) => void
  onDelete: () => void
  onAddItem: (text: string) => void
  onUpdateItem: (itemId: string, data: Partial<TodoItem>) => void
  onDeleteItem: (itemId: string) => void
  accentClass: string
  borderClass: string
}) {
  const doneCount = group.items.filter((i) => i.done).length
  const total = group.items.length
  const linkedProject = projects.find((p) => p.id === group.projectId)

  return (
    <div className={cn("rounded-xl border bg-card p-4 flex flex-col gap-2", borderClass)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <EditableText
              value={group.name}
              onSave={(name) => onUpdateGroup({ name })}
              className="font-semibold text-foreground"
              placeholder="Group name"
            />
            {total > 0 && (
              <span className="text-xs text-muted-foreground shrink-0">
                {doneCount}/{total}
              </span>
            )}
          </div>
          {/* Project link badge */}
          {linkedProject && (
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: linkedProject.color }} />
              <span className="text-xs text-muted-foreground truncate">{linkedProject.name}</span>
              <button
                onClick={() => onUpdateGroup({ projectId: undefined })}
                className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Link to project (work only) */}
          {group.type === 'work' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-7 w-7", linkedProject ? "text-accent" : "text-muted-foreground")}
                  title="Link to project"
                >
                  <Link className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {projects.length === 0 ? (
                  <DropdownMenuItem disabled>No projects</DropdownMenuItem>
                ) : (
                  <>
                    {projects.map((p) => (
                      <DropdownMenuItem
                        key={p.id}
                        onClick={() => onUpdateGroup({ projectId: p.id })}
                        className="gap-2"
                      >
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                        <span className="truncate">{p.name}</span>
                        {group.projectId === p.id && <span className="ml-auto text-accent">✓</span>}
                      </DropdownMenuItem>
                    ))}
                    {group.projectId && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onUpdateGroup({ projectId: undefined })}>
                          <X className="h-3.5 w-3.5 mr-2" />
                          Remove link
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {/* Type toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            title={group.type === 'work' ? 'Switch to personal' : 'Switch to work'}
            onClick={() => onUpdateGroup({ type: group.type === 'work' ? 'personal' : 'work', projectId: undefined })}
          >
            {group.type === 'work'
              ? <Briefcase className="h-3.5 w-3.5" />
              : <User className="h-3.5 w-3.5" />
            }
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="h-1 rounded-full bg-secondary overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", accentClass)}
            style={{ width: `${(doneCount / total) * 100}%` }}
          />
        </div>
      )}

      {/* Items */}
      <div className="flex flex-col gap-0.5 mt-1">
        {group.items.map((item) => (
          <TodoItemRow
            key={item.id}
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

function AddGroupRow({
  onAdd,
  type,
}: {
  onAdd: (name: string, type: 'work' | 'personal') => void
  type: 'work' | 'personal'
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    const trimmed = name.trim()
    if (trimmed) { onAdd(trimmed, type); setName("") }
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

function Section({
  title,
  icon,
  groups,
  projects,
  onUpdateGroup,
  onDeleteGroup,
  onAddGroup,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  type,
  accentClass,
  borderClass,
  headerClass,
}: {
  title: string
  icon: React.ReactNode
  groups: TodoGroup[]
  projects: Project[]
  onUpdateGroup: (id: string, data: Partial<Pick<TodoGroup, 'name' | 'type' | 'projectId'>>) => void
  onDeleteGroup: (id: string) => void
  onAddGroup: (name: string, type: 'work' | 'personal') => void
  onAddItem: (groupId: string, text: string) => void
  onUpdateItem: (groupId: string, itemId: string, data: Partial<TodoItem>) => void
  onDeleteItem: (groupId: string, itemId: string) => void
  type: 'work' | 'personal'
  accentClass: string
  borderClass: string
  headerClass: string
}) {
  const totalItems = groups.reduce((s, g) => s + g.items.length, 0)
  const doneItems = groups.reduce((s, g) => s + g.items.filter((i) => i.done).length, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className={cn("flex items-center gap-2 pb-2 border-b", headerClass)}>
        {icon}
        <h3 className="font-semibold text-foreground">{title}</h3>
        {totalItems > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {doneItems}/{totalItems} done
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            projects={projects}
            onUpdateGroup={(data) => onUpdateGroup(group.id, data)}
            onDelete={() => onDeleteGroup(group.id)}
            onAddItem={(text) => onAddItem(group.id, text)}
            onUpdateItem={(itemId, data) => onUpdateItem(group.id, itemId, data)}
            onDeleteItem={(itemId) => onDeleteItem(group.id, itemId)}
            accentClass={accentClass}
            borderClass={borderClass}
          />
        ))}
        <AddGroupRow onAdd={onAddGroup} type={type} />
      </div>
    </div>
  )
}

export function TodosView({
  groups,
  projects,
  onAddGroup,
  onUpdateGroup,
  onDeleteGroup,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
}: TodosViewProps) {
  const workGroups = groups.filter((g) => g.type === 'work')
  const personalGroups = groups.filter((g) => g.type === 'personal')

  return (
    <div className="flex flex-col gap-10">
      <Section
        title="Work"
        icon={<Briefcase className="h-4 w-4 text-accent" />}
        groups={workGroups}
        projects={projects}
        onUpdateGroup={onUpdateGroup}
        onDeleteGroup={onDeleteGroup}
        onAddGroup={onAddGroup}
        onAddItem={onAddItem}
        onUpdateItem={onUpdateItem}
        onDeleteItem={onDeleteItem}
        type="work"
        accentClass="bg-accent"
        borderClass="border-border"
        headerClass="border-accent/20"
      />
      <Section
        title="Personal"
        icon={<User className="h-4 w-4 text-violet-400" />}
        groups={personalGroups}
        projects={[]}
        onUpdateGroup={onUpdateGroup}
        onDeleteGroup={onDeleteGroup}
        onAddGroup={onAddGroup}
        onAddItem={onAddItem}
        onUpdateItem={onUpdateItem}
        onDeleteItem={onDeleteItem}
        type="personal"
        accentClass="bg-violet-400"
        borderClass="border-violet-500/30"
        headerClass="border-violet-500/20"
      />
    </div>
  )
}
