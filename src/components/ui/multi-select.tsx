import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

interface MultiSelectProps {
  options: { label: string; value: string }[];
  selected: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Selecionar...",
  emptyText = "Nenhum resultado encontrado.",
  className,
  onSelectAll,
  onClearSelection,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const handleUnselect = (value: string) => {
    onChange(selected.filter((s) => s !== value));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between h-auto min-h-10 px-3 py-2",
            className
          )}
        >
          <div className="flex flex-wrap gap-1">
            {selected.length === 0 && (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            {selected.length > 0 && selected.length <= 1 && (
              selected.map((value) => (
                <Badge
                  key={value}
                  variant="secondary"
                  className="mr-1 mb-1"
                >
                  {options.find((o) => o.value === value)?.label || value}
                  <button
                    className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleUnselect(value);
                      }
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={() => handleUnselect(value)}
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                </Badge>
              ))
            )}
            {selected.length > 1 && (
              <Badge variant="secondary" className="mr-1 mb-1">
                {selected.length} selecionados
              </Badge>
            )}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar..." />
          <CommandList className="max-h-[300px] overflow-y-auto">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              <div className="flex items-center justify-between p-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 text-xs px-2"
                  onClick={() => {
                    if (onSelectAll) onSelectAll();
                    else onChange(options.map(o => o.value));
                  }}
                >
                  Selecionar todos
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 text-xs px-2"
                  onClick={() => {
                    if (onClearSelection) onClearSelection();
                    else onChange([]);
                  }}
                >
                  Limpar seleção
                </Button>
              </div>
              <Separator className="my-1" />
            </CommandGroup>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      if (isSelected) {
                        onChange(selected.filter((s) => s !== option.value));
                      } else {
                        onChange([...selected, option.value]);
                      }
                    }}
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible"
                      )}
                    >
                      <Check className={cn("h-4 w-4")} />
                    </div>
                    <span>{option.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
