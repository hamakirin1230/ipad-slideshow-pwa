"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  closeOfflineDb,
  openOfflineDb,
} from "@/lib/offline-db";
import { getUserFacingOperationFailureMessage } from "@/lib/user-facing-diagnostics";

type OfflineDbCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | {
      status: "success";
      checkedAt: string;
    }
  | {
      status: "error";
      message: string;
      checkedAt: string;
    };

export function OfflineDbCheckPanel() {
  const [checkState, setCheckState] = useState<OfflineDbCheckState>({
    status: "idle",
  });

  const handleCheckOfflineDb = async () => {
    setCheckState({ status: "checking" });

    try {
      await openOfflineDb();

      setCheckState({
        status: "success",
        checkedAt: new Date().toISOString(),
      });
    } catch (error) {
      setCheckState({
        status: "error",
        message: getUserFacingOperationFailureMessage("offlineDbCheck", error),
        checkedAt: new Date().toISOString(),
      });
    } finally {
      await closeOfflineDb();
    }
  };

  return (
    <Card className="border-white/10 bg-white/5 text-slate-50">
      <CardHeader>
        <CardTitle>オフライン再生準備</CardTitle>
        <CardDescription className="text-slate-300">
          この端末でオフライン再生用の保存領域を利用できるか確認します。ここでは同期や保存は行いません。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          type="button"
          variant="secondary"
          className="min-h-11"
          onClick={handleCheckOfflineDb}
          disabled={checkState.status === "checking"}
        >
          {checkState.status === "checking"
            ? "保存領域を確認しています"
            : "保存領域を確認"}
        </Button>

        {checkState.status === "idle" && (
          <p className="text-sm text-slate-300">
            ボタンを押すと、この端末でオフライン再生用の保存領域を利用できるか確認します。
          </p>
        )}

        {checkState.status === "success" && (
          <div className="space-y-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-50">
            <p className="font-semibold">オフライン再生用の保存領域を利用できます。</p>
            <p>確認日時: {checkState.checkedAt}</p>
          </div>
        )}

        {checkState.status === "error" && (
          <div className="space-y-2 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-50">
            <p className="font-semibold">オフライン再生用の保存領域を確認できませんでした。</p>
            <p>{checkState.message}</p>
            <p>確認日時: {checkState.checkedAt}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
