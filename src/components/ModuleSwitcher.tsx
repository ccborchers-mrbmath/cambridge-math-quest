import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MODULES, ModuleCode, countByModule, getModuleInfo } from "@/lib/modules";

interface ModuleSwitcherProps {
  module: ModuleCode;
  onChange: (code: ModuleCode) => void;
}

export const ModuleSwitcher = ({ module, onChange }: ModuleSwitcherProps) => {
  const info = getModuleInfo(module);
  const counts = countByModule();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <span className="text-muted-foreground text-xs">Module</span>
          <span className="font-semibold">{info.shortLabel}</span>
          <ChevronDown className="h-4 w-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-card z-50">
        <DropdownMenuLabel>Switch module</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {MODULES.map((m) => {
          const ready = counts[m.code] > 0;
          return (
            <DropdownMenuItem
              key={m.code}
              onClick={() => onChange(m.code)}
              className="flex items-center justify-between"
            >
              <span className="flex flex-col">
                <span className="font-medium">{m.shortLabel} — {m.name}</span>
                <span className="text-xs text-muted-foreground">
                  {ready ? `${counts[m.code]} questions` : "Coming soon"}
                </span>
              </span>
              {m.code === module && (
                <span className="text-xs text-primary font-semibold">●</span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};