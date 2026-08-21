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
- cookie: 256-bit opaque session IDだけ。`__Host-` / HttpOnly / Secure / SameSite=Strict / Path=/ / Domainなし / Max-Age ≤ 3600
- Redis lookup key: `SHA-256(sessionId)`。raw session IDは保存しない
- store: Upstash Redis via Vercel Native integration。このbranchではprovisionしない
- access tokenはbrowser storageへ置かない
- Photos export / Pickerはsession対象外
- restoreごとのGoogle tokeninfoは呼ばない
- restore responseのtokenはXSS隔離ではない。persistence回避が目的

## 4. hosting

`output: "export"`撤去は確定しない。

Next.js App Routerのrequest-dependent Route Handler / Cookies APIはstatic exportでは使えない。これは確定。

Vercel root `/api/*.ts` Functionとの共存は未実証。次implementation phaseの最初に`main`から`spike/google-session-vercel-function`を作り、secretなしの`api/session-probe.ts`相当だけでPreview確認する。

- PASS: static export維持を第一候補に昇格
- FAIL: そのとき`output: "export"`撤去 + App Router Route Handler

PWA / static shellへの影響が小さい方を優先する。

## 5. まだやらないこと

- runtime実装
- `api/`追加
- Redis provision
- Vercel env追加
- Google Cloud変更
- main merge / push

## 6. 次の実装開始条件

Gate 0 hosting spikeを先に行うこと。Upstash RedisはPreviewだけ先に足せること。iPad PWA cookieをPreview必須acceptanceにすること。60分接続維持を「実装済み」とdocsへ書かないこと。
