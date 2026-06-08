# Goal 04-5 staging validation integration helper handoff

Date: 2026-06-08

## 目的

この handoff は、Goal 04-5 で追加した staging validation integration helper の内容を記録するためのものです。

今回の helper は、既存の staging read helper と staging validation rules を接続します。

ただし、次の処理はまだ行いません。

```txt
- cleanup
- staging -> 確定store昇格
- offlineSyncState 更新
- ready 化
- failed / corrupt 分類
- Drive API 呼び出し
- UI 接続
