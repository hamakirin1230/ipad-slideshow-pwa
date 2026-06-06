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
import { OFFLINE_DB_NAME } from "@/lib/offline-schema";
import {
  closeOfflineDb,
  openOfflineDb,
} from "@/lib/offline-db";

type OfflineDbCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | {
      status: "success";
      dbName: string;
      dbVersion: number;
      objectStoreCount: number;
      checkedAt: string;
    }
  | {
      status: "error";
      errorName: string;
      message: string;
      checkedAt: string;
    };

function getErrorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }

  return "UnknownError";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "IndexedDBの確認中に不明なエラーが発生しました。";
}

export function OfflineDbCheckPanel() {
  const [checkState, setCheckState] = useState<OfflineDbCheckState>({
    status: "idle",
  });

  const handleCheckOfflineDb = async () => {
    setCheckState({ status: "checking" });

    try {
      const db = await openOfflineDb();

      setCheckState({
        status: "success",
        dbName: db.name,
        dbVersion: db.version,
        objectStoreCount: db.objectStoreNames.length,
        checkedAt: new Date().toISOString(),
      });
    } catch (error) {
      setCheckState({
        status: "error",
        errorName: getErrorName(error),
        message: getErrorMessage(error),
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
          IndexedDBを開けるか確認します。ここでは同期や保存はまだ行いません。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          type="button"
          variant="secondary"
          onClick={handleCheckOfflineDb}
          disabled={checkState.status === "checking"}
        >
          {checkState.status === "checking"
            ? "IndexedDBを確認しています"
            : "IndexedDBを確認"}
        </Button>

        {checkState.status === "idle" && (
          <p className="text-sm text-slate-300">
            ボタンを押すと、ブラウザ内のオフライン再生用IndexedDBを開けるか確認します。
          </p>
        )}

        {checkState.status === "success" && (
          <div className="space-y-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-50">
            <p className="font-semibold">IndexedDBを開けました。</p>
            <p>DB名: {checkState.dbName}</p>
            <p>DB version: {checkState.dbVersion}</p>
            <p>object store数: {checkState.objectStoreCount}</p>
            <p>確認日時: {checkState.checkedAt}</p>
          </div>
        )}

        {checkState.status === "error" && (
          <div className="space-y-2 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-50">
            <p className="font-semibold">IndexedDBを開けませんでした。</p>
            <p>error name: {checkState.errorName}</p>
            <p>{checkState.message}</p>
            <p>確認日時: {checkState.checkedAt}</p>
          </div>
        )}

        <p className="text-xs text-slate-400">
          予定DB名: {OFFLINE_DB_NAME}
        </p>
      </CardContent>
    </Card>
  );
}
