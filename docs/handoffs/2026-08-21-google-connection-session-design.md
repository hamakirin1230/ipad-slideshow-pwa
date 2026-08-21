# Google connection session design handoff

Date: 2026-08-21
Branch: `docs/google-session-gate0-result`
Status: architecture + Gate 0 FAIL recorded. Session not implemented.

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

## 4. Gate 0

Gate 0 = FAIL。

`spike/google-session-vercel-function`でWeb fetch handlerとclassic Node handlerをPreview検証した。static export維持のままlocal / Preview buildは成功し、既存static routesは生成された。Vercelはroot `/api/session-probe`をFunctionとして認識し、routingは404ではなかった。しかしGET invocationはどちらもFUNCTION_INVOCATION_FAILED。classic Node handlerではCommonJS loaderがES moduleの`export default`を読めなかった。

これは「Vercelでroot `/api`が絶対不可能」ではなく、現行repository構成の最小方式がgateを通らなかったという限定FAILである。third handler / `vercel.json` / module workaroundは試さない。spikeはmainへmergeしない。

## 5. hosting

次は`output: "export"`撤去 + App Router Route Handler。

次branch候補: `feature/google-session-backend`。最初のcommitはhosting migrationと秘密情報なしの`src/app/api/session-probe/route.ts`。Google token / Redis / cookie / encryptionはまだ入れない。60分sessionは未実装。

## 6. まだやらないこと

- このdocs branchでのruntime実装
- spikeのmain merge
- Redis provision
- Vercel env追加
- Google Cloud変更
- push / main merge
