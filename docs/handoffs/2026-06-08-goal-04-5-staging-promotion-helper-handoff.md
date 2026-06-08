# Goal 04-5 staging promotion helper handoff

Date: 2026-06-08

## 目的

この handoff は、Goal 04-5 で追加した staging promotion helper の内容を記録するためのものです。

今回の helper は、validation 済みの staging records を confirmed stores へ昇格します。

ここでいう昇格とは、staging store にある仮保存データを、offline playback が参照する確定storeへコピーすることです。

## 追加した実装ファイル

```txt
src/lib/offline-staging-promotion.ts
