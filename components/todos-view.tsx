"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { Plus, Trash2, CheckSquare, Square, Briefcase, User, Link, X, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { format, parseISO } from "date-fns"
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

function ProjectLinkDialog({
  open,
  onOpenChange,
  projects,
  currentProjectId,
  onSelect,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  projects: Project[]
  currentProjectId?: string
  onSelect: (projectId: string | undefined) => void
}) {
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return [...projects]
      .filter(p => !q || p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
  }, [projects, search])

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSearch("") }}>
      <DialogContent className="max-w-sm max-h-[70vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Link to project</DialogTitle>
        </DialogHeader>
        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            autoFocus
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No projects found.</p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => { onSelect(p.id); onOpenChange(false); setSearch("") }}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3 text-left hover:bg-secondary transition-colors"
              >
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                  {p.description && <p className="text-xs text-muted-foreground truncate">{p.description}</p>}
                </div>
                {currentProjectId === p.id && <span className="text-xs text-accent">linked</span>}
              </button>
            ))
          )}
        </div>
        {currentProjectId && (
          <div className="shrink-0 pt-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground gap-2"
              onClick={() => { onSelect(undefined); onOpenChange(false) }}
            >
              <X className="h-3.5 w-3.5" />
              Remove link
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
  const doneDate = item.doneAt
    ? format(parseISO(item.doneAt), "dd.MM HH:mm")
    : null

  const completionSnapshot = item.completedSessionSnapshot ?? item.sessionSnapshot
  const sessionLabel = completionSnapshot
    ? `${format(parseISO(completionSnapshot.date), "dd.MM")} ${completionSnapshot.start}–${completionSnapshot.end || "?"}`
    : null

  return (
    <div className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-black/10 dark:hover:bg-white/5">
      <button
        onClick={() => onUpdate({
          done: !item.done,
          doneAt: !item.done ? new Date().toISOString() : undefined,
        })}
        className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        {item.done
          ? <CheckSquare className="h-4 w-4 text-accent" />
          : <Square className="h-4 w-4" />
        }
      </button>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <EditableText
          value={item.text}
          onSave={(text) => onUpdate({ text })}
          className={cn(
            "text-sm break-words",
            item.done && "line-through text-muted-foreground"
          )}
          placeholder="Todo text"
        />
        {item.done && (doneDate || sessionLabel) && (
          <div className="flex items-center gap-2 flex-wrap">
            {doneDate && (
              <span className="text-[10px] text-muted-foreground/70">✓ {doneDate}</span>
            )}
            {sessionLabel && (
              <span className="text-[10px] text-accent/70 bg-accent/10 rounded px-1 py-px">{sessionLabel}</span>
            )}
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
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
  accentBarClass,
  cardClass,
}: {
  group: TodoGroup
  projects: Project[]
  onUpdateGroup: (data: Partial<Pick<TodoGroup, 'name' | 'type' | 'projectId'>>) => void
  onDelete: () => void
  onAddItem: (text: string) => void
  onUpdateItem: (itemId: string, data: Partial<TodoItem>) => void
  onDeleteItem: (itemId: string) => void
  accentBarClass: string
  cardClass: string
}) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const doneCount = group.items.filter((i) => i.done).length
  const total = group.items.length
  const linkedProject = projects.find((p) => p.id === group.projectId)

  return (
    <div className={cn("rounded-xl border bg-card p-4 flex flex-col gap-2", cardClass)}>
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
          {group.type === 'work' && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-7 w-7", linkedProject ? "text-accent" : "text-muted-foreground")}
                title="Link to project"
                onClick={() => setLinkDialogOpen(true)}
              >
                <Link className="h-3.5 w-3.5" />
              </Button>
              <ProjectLinkDialog
                open={linkDialogOpen}
                onOpenChange={setLinkDialogOpen}
                projects={projects}
                currentProjectId={group.projectId}
                onSelect={(id) => onUpdateGroup({ projectId: id })}
              />
            </>
          )}
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
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", accentBarClass)}
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
  accentBarClass,
  cardClass,
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
  accentBarClass: string
  cardClass: string
  headerClass: string
}) {
  const totalItems = groups.reduce((s, g) => s + g.items.length, 0)
  const doneItems = groups.reduce((s, g) => s + g.items.filter((i) => i.done).length, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className={cn("flex items-center gap-2 pb-3 border-b-2", headerClass)}>
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
            accentBarClass={accentBarClass}
            cardClass={cardClass}
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
        icon={<Briefcase className="h-4 w-4 text-sky-400" />}
        groups={workGroups}
        projects={projects}
        onUpdateGroup={onUpdateGroup}
        onDeleteGroup={onDeleteGroup}
        onAddGroup={onAddGroup}
        onAddItem={onAddItem}
        onUpdateItem={onUpdateItem}
        onDeleteItem={onDeleteItem}
        type="work"
        accentBarClass="bg-sky-400"
        cardClass="border-sky-500/40 bg-sky-500/5"
        headerClass="border-sky-500/50"
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
        accentBarClass="bg-violet-400"
        cardClass="border-violet-500/40 bg-violet-500/5"
        headerClass="border-violet-500/50"
      />
    </div>
  )
}
