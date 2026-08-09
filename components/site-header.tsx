"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Radar } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSavedStore } from "@/store/use-saved-store";

export function SiteHeader() {
  const pathname = usePathname();
  const hydrated = useSavedStore((s) => s.hydrated);
  const savedCount = useSavedStore((s) => s.opportunities.length);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <Radar className="size-4" />
          </span>
          <span className="text-base tracking-tight">
            Jearch
            <span className="ml-2 hidden text-xs font-normal text-muted-foreground sm:inline">
              direct-contact job finder
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <Button
            asChild
            variant={pathname === "/" ? "secondary" : "ghost"}
            size="sm"
            className={cn(pathname === "/" && "font-semibold")}
          >
            <Link href="/">Search</Link>
          </Button>

          <Button asChild variant={pathname === "/saved" ? "secondary" : "ghost"} size="sm">
            <Link href="/saved">
              <Bookmark />
              Saved
              {hydrated && savedCount > 0 && (
                <Badge variant="default" className="ml-1 px-1.5 py-0 text-[10px]">
                  {savedCount}
                </Badge>
              )}
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
