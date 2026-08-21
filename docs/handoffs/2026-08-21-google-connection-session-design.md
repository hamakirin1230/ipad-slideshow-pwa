# Google connection session design handoff

Date: 2026-08-21
Branch: `design/google-connection-session`
Status: architecture only. Not implemented.

## 1. 目的

明示的な「Googleへ接続」のあと、page refreshしても最大約60分はaccount chooserを出さずDrive接続を復元したい。page-load GIS silent authは失敗済みなので再試行しない。

## 2. 文書

正式なarchitectureは次を読む。

[`../design/google-connection-60-minute-session.md`](../design/google-connection-60-minute-session.md)

## 3. 推奨

現行GIS token client（手動、`drive.file`、`prompt: "select_account"`）を維持し、成功したDrive access tokenだけをserver-side short-lived sessionへ預ける。

- Client Secret: 不要
- refresh token: 不要
- Google scope: `drive.file`のまま
- cookie: opaque session IDだけ。HttpOnly / Secure / SameSite=Strict / Max-Age ≤ 3600
- access tokenはbrowser storageへ置かない
- Photos export / Pickerはsession対象外

## 4. hosting

現在は`output: "export"`。request-dependent cookies / POST Route Handlerは使えない。実装時に`output: "export"`を撤去する。既存pageの静的配信と`trailingSlash: true`は維持する。root `/api`とstatic exportの共存は未実証なので採らない。

## 5. まだやらないこと

- runtime実装
- Redis provision
- Vercel env追加
- Google Cloud変更
- main merge / push

## 6. 次の実装開始条件

ユーザーがVercel Marketplace Redisとserver-only暗号化keyを用意できること。iPad PWA cookieをPreview必須acceptanceにすること。60分接続維持を「実装済み」とdocsへ書かないこと。
