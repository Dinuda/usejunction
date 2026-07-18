"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/signals/work-export";

export function WorkCsvExportButton({
  filename,
  csv,
  label = "Export CSV",
  disabled,
}: {
  filename: string;
  csv: string;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="rounded-none"
      disabled={disabled || !csv}
      onClick={() => downloadCsv(filename, csv)}
    >
      <Download className="size-3.5" />
      {label}
    </Button>
  );
}
