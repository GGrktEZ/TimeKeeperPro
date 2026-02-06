"use client"

import { ChevronLeft, ChevronRight, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { format, addDays, subDays, isToday, parseISO } from "date-fns"

interface DateSelectorProps {
  selectedDate: string
  onDateChange: (date: string) => void
}

export function DateSelector({ selectedDate, onDateChange }: DateSelectorProps) {
  const date = parseISO(selectedDate)
  
  const handlePrevDay = () => {
    onDateChange(format(subDays(date, 1), "yyyy-MM-dd"))
  }
  
  const handleNextDay = () => {
    onDateChange(format(addDays(date, 1), "yyyy-MM-dd"))
  }
  
  const handleToday = () => {
    onDateChange(format(new Date(), "yyyy-MM-dd"))
  }

  const isTodaySelected = isToday(date)

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToday}
        className={isTodaySelected ? "pointer-events-none invisible" : ""}
      >
        Today
      </Button>

      <Button variant="outline" size="icon" onClick={handlePrevDay}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      
      <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {format(date, "EEEE")}
          </p>
          <p className="text-xs text-muted-foreground">
            {format(date, "MMMM d, yyyy")}
          </p>
        </div>
      </div>
      
      <Button variant="outline" size="icon" onClick={handleNextDay}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
