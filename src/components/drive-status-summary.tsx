"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppState } from "@/app/app-providers";

export function DriveStatusSummary() {
  const { googleStatus, googleStatusLabel, driveStatus, driveStatusLabel } =
    useAppState();

  return (
    <Card className="border-white/10 bg-white/5 text-slate-50">
      <CardHeader>
        <CardTitle className="text-base">Google / Drive 状態</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 text-sm">
        <Badge
          variant={googleStatus === "connected" ? "secondary" : "outline"}
          className={
            googleStatus === "connected"
              ? undefined
              : "border-slate-500 text-slate-200"
          }
        >
          Google: {googleStatusLabel}
        </Badge>
        <Badge
          variant={driveStatus === "ready" ? "secondary" : "outline"}
          className={
            driveStatus === "ready"
              ? undefined
              : "border-slate-500 text-slate-200"
          }
        >
          Drive: {driveStatusLabel}
        </Badge>
      </CardContent>
    </Card>
  );
}