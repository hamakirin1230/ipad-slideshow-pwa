# Google connection session design handoff

Date: 2026-08-21
Branch: `feature/google-session-backend`
Status: Phase 1 hosting migration PASS. 60-minute Google session not implemented.

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
- store: Upstash Redis via Vercel Native integration。まだprovisionしない
- access tokenはbrowser storageへ置かない
- Photos export / Pickerはsession対象外
- restoreごとのGoogle tokeninfoは呼ばない
- restore responseのtokenはXSS隔離ではない。persistence回避が目的

## 4. Gate 0

Gate 0 = FAIL。

`spike/google-session-vercel-function`でWeb fetch handlerとclassic Node handlerをPreview検証した。static export維持のままlocal / Preview buildは成功し、既存static routesは生成された。Vercelはroot `/api/session-probe`をFunctionとして認識し、routingは404ではなかった。しかしGET invocationはどちらもFUNCTION_INVOCATION_FAILED。

これは「Vercelでroot `/api`が絶対不可能」ではなく、当時の現行構成の最小方式がgateを通らなかったという限定FAILである。spikeはmainへmergeしない。

## 5. Phase 1 hosting

Phase 1 hosting migration = PASS。

`output: "export"`撤去 + App Router Route Handlerが、このrepositoryのPreview acceptance済みhosting authorityである。

- `GET /api/session-probe/` = 200
- fixed JSON `google-session-app-router-probe`
- `Cache-Control: no-store`
- FUNCTION_INVOCATION_FAILEDなし
- `/` `/settings/` `/admin/` `/player/` `/system/` OK
- existing installed PWA OK
- offline Playerの明らかな回帰なし

60分session本体は未実装。Redis / cookie / AES-GCM / create-restore-delete API / AppProviders wiringは未実装。Photos OAuthは変更していない。

## 6. 次

Phase 2: server-only crypto / session primitives。Redisはまだprovisionしない。Google token / cookie / Redis / API wiringはPhase 2最初のcommitに入れない。
