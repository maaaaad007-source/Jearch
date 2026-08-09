"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

/** Click-to-copy with a 1.5s confirmation, falling back to a hidden textarea. */
export function CopyButton({ value, label = "Copy", className }: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // navigator.clipboard is unavailable over plain HTTP and in some
      // embedded browsers; the legacy path still works there.
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
  }, [value]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={copy}
      title={copied ? "Copied" : label}
      aria-label={copied ? "Copied to clipboard" : label}
      className={cn("size-7 text-muted-foreground hover:text-foreground", className)}
    >
      {copied ? <Check className="text-[var(--success)]" /> : <Copy />}
    </Button>
  );
}
