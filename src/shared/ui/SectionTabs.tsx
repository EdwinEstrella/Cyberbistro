import * as React from "react";
import { TabsList, TabsTrigger } from "./tabs";
import { cn } from "./utils";

export function SectionTabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsList>) {
  return (
    <TabsList
      className={cn(
        "bg-[#1a1a1a] border border-[rgba(72,72,71,0.18)] rounded-[10px] p-1 h-auto flex gap-1.5 shrink-0",
        className
      )}
      {...props}
    />
  );
}

export function SectionTabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsTrigger>) {
  return (
    <TabsTrigger
      className={cn(
        "px-4 py-2 rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[0.5px] text-[#adaaaa] data-[state=active]:bg-[rgba(255,144,109,0.12)] data-[state=active]:border-[#ff906d] data-[state=active]:text-[#ff906d] data-[state=active]:shadow-[0_0_12px_rgba(255,144,109,0.1)] border border-transparent transition-all cursor-pointer",
        className
      )}
      {...props}
    />
  );
}
