import { useMemo, useState } from "react";
import { Check, Filter, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const MISSING = "__missing__";

export interface ColumnFilterOption {
  value: string;
  label: string;
}

interface ColumnFilterProps {
  label: string;
  options: ColumnFilterOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

export function ColumnFilter({ label, options, selected, onChange }: ColumnFilterProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  const active = selected.size > 0;

  return (
    <div className="inline-flex items-center gap-1">
      <span>{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted",
              active && "text-primary",
            )}
            aria-label={`Filter ${label}`}
          >
            <Filter className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="p-2 border-b flex items-center gap-2">
            <Input
              autoFocus
              placeholder={`Search ${label.toLowerCase()}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8"
            />
            {active && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => onChange(new Set())}
                title="Clear"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="max-h-72 overflow-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
            )}
            {filtered.map((o) => {
              const checked = selected.has(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded border",
                      checked ? "bg-primary border-primary text-primary-foreground" : "border-input",
                    )}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className={cn("truncate", o.value === MISSING && "italic text-muted-foreground")}>
                    {o.label}
                  </span>
                </button>
              );
            })}
          </div>
          {active && (
            <div className="p-2 border-t text-xs text-muted-foreground">
              {selected.size} selected
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}