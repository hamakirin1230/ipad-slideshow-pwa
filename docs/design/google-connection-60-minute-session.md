# Google connection 60-minute session

Date: 2026-08-21
Status: Phase 1 hosting migration PASS. 60-minute Google session not implemented.
Branch: `feature/google-session-backend`

この文書は、明示的な「Googleへ接続」のあと、page refreshしても最大約60分はGoogle account chooserを出さず Drive 接続を復元するためのarchitectureである。Phase 1 hosting migrationはPreview acceptance済みである。この文書を「60分接続維持は実装済み」とは読まない。session restore、cookie、Redis、token encryptionは未実装である。

要件は「必ず60分」ではない。Google access tokenの`expires_in`が60分未満なら、その短い方をauthorityにする。silent延長は禁止する。restoreするたびにTTLを延長しない。「60分保証」とは書かない。

`output: "export"`の撤去 + Next.js App Router Route Handlerは、Gate 0 FAIL後のhosting方針としてPreview acceptance済みである。これが今後のserver session実装のhosting authorityである。Vercel root `/api` Functionは、このrepositoryの現行構成（当時のstatic export維持、package/module変更なし、`vercel.json`なし、dependency追加なし、routing workaroundなし）ではinvocationに失敗した。一般に「Vercelでroot `/api`が不可能」という意味ではない。

## 現行契約（このrepositoryで確認した事実）

確認対象: `next.config.ts`、`package.json`、`src/app/app-providers.tsx`、`src/lib/google-auth.ts`、`public/sw.js`、`src/app/root-deployment-contract.test.ts`、`docs/environment-security.md`、`docs/current-context.md`、`docs/acceptance/google-photos-export-acceptance.md`。

- Next.js 16.2.6。`output: "export"`は撤去済み。`trailingSlash: true`。`images.unoptimized: true`。`vercel.json`はない。秘密情報なしのApp Router probe `src/app/api/session-probe/route.ts`がある。Google session APIはまだない
- hostingはVercel Productionのみ。GitHub Pages deployは廃止済み。CIは`pnpm test` / `lint` / `build`
- Drive OAuthはbrowser GIS token client。scopeは`https://www.googleapis.com/auth/drive.file`。手動「Googleへ接続」だけが`prompt: "select_account"`で`requestAccessToken`する
- GIS ready / page loadでは`requestAccessToken`しない。`prompt: ""` / `prompt: "none"`のpage-load silent restoreはPreviewで失敗し、撤去済み。再試行しない
- Drive access tokenは`AppProviders`内部の`accessTokenRef`だけ。React state / Context / storage / Cookie / URL / UI / consoleへ出さない
- Photos Pickerは操作開始時、同一Drive token clientへ`drive.file` + `photospicker.mediaitems.readonly`を要求する。Picker tokenは`currentAssetImportAccessTokenRef`へ入り、Drive sessionの対象ではない
- Photos exportは専用`photosExportTokenClientRef`。scopeは`photoslibrary.appendonly`のみ。`include_granted_scopes: false`。操作開始時だけ。Drive sessionへ入れない
- `docs/environment-security.md`の現行契約: アプリ固有のbrowser-build環境変数は`NEXT_PUBLIC_GOOGLE_CLIENT_ID`のみ。Client SecretとAPI keyは使わない。access tokenをlocalStorage / IndexedDB / Cookie / docs / logsへ保存しない
- Production acceptance（2026-08-21）: refresh後は未接続へ戻り、明示再接続が必要。自動account chooserは出ない。60分接続維持は未解決
- Service Worker `public/sw.js`はsame-origin GETのnavigateと`/_next/static` / icons / manifestだけをcacheする。POSTはinterceptしない。Drive video stream用にSWメモリへaccess tokenを最大45分保持する経路があるが、これは再生用でありGoogle接続restoreの代用にしない

## 比較したarchitecture

### A. browser storage — REJECT

access tokenを`localStorage` / `sessionStorage` / IndexedDB / Cache Storage / Cookie / URL へ保存する。

- 現行security契約に直接違反する
- XSSでtokenを読める
- page-load GIS silent restoreの失敗をstorageへ逃がすだけであり、失敗原因の解決ではない

採用しない。SWメモリへtokenを置いてrefresh persistenceする案もAの変種として採用しない。

### B. Google authorization code flow + refresh token backend

OAuth web-server flow、Client Secret、`access_type=offline`、refresh token、backend token store。

メリット:

- Google公式の長寿命再発行
- 60分を超える接続維持も将来拡張しやすい

デメリット:

- 今回の要件は「明示login後、token寿命または60分の短い方」だけである
- Client Secretが必要になり、現行「Client Secretは作らない」契約を破る
- Authorized redirect URI、consent画面、Google Cloud OAuth client種別の見直しが必要
- Photos export / Pickerとのscope分離をweb-server flowでも再設計する必要がある
- refresh tokenはaccess tokenより価値が高く、server storeと漏洩時の影響が大きい
- operational costが高い（Secret rotation、redirect origin、offline grantの取り扱い）

評価: 今回の最大60分要件にはoverkill。将来、数時間〜数日の接続維持が必要になったときの別branch候補として残す。このdesignでは採用しない。

### C. 現行GIS manual token flow + server-side short-lived session — RECOMMENDED

手動「Googleへ接続」は現行GIS token clientのまま。成功したDrive access tokenだけをserver sessionへ預け、browserにはopaque session cookieだけを残す。page loadではGISへtoken requestせず、same-origin session endpointだけを見る。

- Client Secret: 不要
- refresh token: 不要
- Google scope: `drive.file`のまま
- Photos export / Picker: 変更しない
- page-load silent GIS: 使わない

要件を満たせる。採用する。hostingはGate 0 FAILのあと、`output: "export"`撤去 + App Router Route HandlerをPhase 1でPreview acceptanceした。60分session本体はまだ未実装である。

## Recommended architecture

手動GIS connect成功 → HTTPS POSTでDrive access tokenをserverへ渡す → serverがtokenを検証し、TTL付きsessionをstoreへ書く → `Set-Cookie`はcryptographically randomなopaque session IDだけ。Redis lookup keyは`SHA-256(sessionId)`であり、raw session IDはstoreしない。

page load → GIS client初期化（token requestなし） → same-origin session restore POST → 有効ならresponseのaccess tokenを`accessTokenRef`へだけ格納 → connected。

invalid / expired / backend unavailable → account chooserを自動表示しない → `notConnected` → 手動「Googleへ接続」。automatic retry loop禁止。automatic GIS auth禁止。

## Security boundary

現行契約からの追加:

- access tokenのbrowser persistent storageは引き続き禁止
- cookieへaccess token / refresh tokenを置かない
- cookieは256-bit cryptographically random opaque session IDだけ
- Redis lookup keyはraw session IDではなく`SHA-256(sessionId)`
- server-side session storeにAES-256-GCM暗号化済みDrive access token、IV / auth tag、`expiresAt`、Drive token response由来の最小scope metadataだけを置く
- encryption keyはVercel server-only環境変数。256-bit。`NEXT_PUBLIC_`を絶対に付けない。plaintext fallback禁止
- token / session ID / request bodyをlogs、Vercel logs、diagnostics、error message、docs、URL、analyticsへ出さない
- session APIは`Cache-Control: no-store`
- cross-origin CORSを許可しない。same-origin only
- cookieだけをCSRF防御の根拠にしない
- Client Secretとrefresh tokenは追加しない
- Google tokeninfoをpage restoreごとに呼ばない。access tokenをtokeninfo URLのquery parameterへ載せない

現行契約で維持:

- Drive scopeは`drive.file`
- Photos exportは`photoslibrary.appendonly`専用client、`include_granted_scopes: false`、操作開始時だけ
- Player offline playbackはGoogle接続restore失敗で壊さない

security limitation: restoreが成功するとaccess tokenはHTTPS response bodyでbrowser JSへ戻る。この方式はXSSからtokenを隔離しない。目的はtokenのbrowser persistenceを避けることである。runtime中のbrowser memory exposureは現行GISと同じ。

## Gate 0: hosting spike result

Gate 0 = **FAIL**。

対象branchは`spike/google-session-vercel-function`。failed experimental evidenceとして残す。mainへmergeしない。probe implementationもmainへ入れない。削除はまだしない。

試したhandler:

- Web fetch object handler（`export default { fetch }`）
- classic Node handler（`IncomingMessage` / `ServerResponse`）

third handler、`package.json` type変更、`vercel.json`追加、module workaroundは試さない。

### 実証した事実

- `next.config.ts`の`output: "export"`と`trailingSlash: true`を維持したまま、local `next build`は成功した
- Vercel Preview buildも成功し、deploymentはREADYだった
- 既存static routes（`/`、`/settings/`、`/admin/`、`/player/`、`/system/`）はstatic generationされた
- Vercelはroot `/api/session-probe`をNode.js Functionとして認識した
- routingは成立しており、404ではなかった
- しかしGET invocationはどちらも失敗した。statusは500 Internal Server Error、Vercel分類はFUNCTION_INVOCATION_FAILED
- classic Node handlerでは、generated functionをCommonJS loaderが読み、ES moduleの`export default`でmodule loadに失敗した

raw Vercel request ID、temporary Preview URL、完全なruntime logは記録しない。

### 判定の範囲

このFAILは「Vercelでroot `/api` Functionが絶対に不可能」という一般論ではない。今回のrepositoryの現行構成に対して、承認済み最小方式（static export維持、package/module contract変更なし、`vercel.json`なし、dependency追加なし、routing workaroundなし）がacceptance gateを通らなかった、という限定である。

### 次のhosting方針

Gate 0 FAILにより次を採用し、Phase 1でPreview acceptanceした。これが今後のserver session実装のhosting authorityである。

- `output: "export"`を撤去する
- Next.js App Router Route Handlerを使う
- `trailingSlash: true`はPWA path互換のため維持する
- `images.unoptimized: true`、root `start_url` / `scope`、manifest、`/sw.js`は維持する
- SWは`/api/`をcache / interceptしない
- `root-deployment-contract` testは`output: "export"`必須を外した

## Phase 1: hosting migration result

Phase 1 hosting migration = **PASS**。

確認済み（Preview / user acceptance。全部OK）:

- `output: "export"`を撤去
- `trailingSlash: true`維持
- `images.unoptimized: true`維持
- App Router Route Handler `src/app/api/session-probe/route.ts`
- Vercel Preview deployment READY
- `GET /api/session-probe/` = 200
- `Content-Type: application/json`
- `Cache-Control: no-store`
- body semantic `{ "ok": true, "kind": "google-session-app-router-probe" }`
- Vercel runtime logでも200
- FUNCTION_INVOCATION_FAILEDなし
- Home `/`、Settings `/settings/`、Admin `/admin/`、Player `/player/`、System `/system/`
- existing installed PWA
- offline Playerの明らかな回帰なし

temporary Preview URL、deployment ID、完全なSHAは記録しない。

60分Google connection session本体は未実装のままである。未実装:

- Redis / Upstash
- cookie session
- AES-GCM token encryption
- server session persistence
- create / restore / delete session API
- AppProviders restore wiring
- Drive token session create
- disconnect session delete

Photos OAuthは変更していない。

session API候補（本物は後続commit）:

```text
src/app/api/google-session/create/route.ts
src/app/api/google-session/restore/route.ts
src/app/api/google-session/delete/route.ts
```

canonical pathは`trailingSlash: true`に合わせ、slash付きを使う。

## Session store

serverless functionのprocess memoryだけにtokenを置く案は禁止する。instance間で共有されない。

第一候補: **Upstash Redis via Vercel Native integration**。

理由:

- serverless向け
- TTL sessionに適する
- Vercel integrationでserver-only env設定が可能
- process memoryに依存しない

このdesign branchではprovisionしない。

manual setup gate:

- Vercel projectへUpstash Redis integrationを追加する
- 最初はPreview environmentだけに設定する
- ProductionへはPreview acceptance後
- server-only envのみ
- `NEXT_PUBLIC_`禁止

その他durable KVは要件を満たし得るが、今回は選ばない。

## Session identifier hardening

cookie値: 256-bit cryptographically random opaque session IDのみ。

Redis lookup keyにはraw session IDを直接使わない。serverで`SHA-256(sessionId)`を計算し、次のようなkeyでlookupする。

```text
google-session:<sha256(sessionId)>
```

Redis内容が露出しても、保存済みkeyだけからactive cookie値を直接再利用できないようにする。raw session IDはRedisへ保存しない。session IDをlogしない。

## Cookie

- 値: opaque session IDのみ。256-bit cryptographically random
- Production / Previewの第一候補は`__Host-` prefix（`Secure`必須、`Path=/`、`Domain`指定なし）
- `HttpOnly`
- `Secure`
- `SameSite=Strict`
- `Path=/`
- `Domain`指定なし
- `Max-Age`はabsolute expiryまでの秒。最大3600。Redis TTLと同じexpiryをauthorityにする

iPad PWAでStrict / `__Host-`が問題になる場合だけ、Preview evidenceに基づきLaxを再検討する。推測でLaxへ落とさない。

local `next dev`のHTTPでは`__Host-`を付けられない。localだけ別cookie名にする。Preview実機を正式確認とする。

cookie名の実値はGate 0後の実装で選ぶ。

## Session create endpoint security

manual GIS connect成功後のsession create API:

- POSTのみ
- `Content-Type: application/json`のみ
- request body sizeを小さく制限する
- `Origin`をexpected same-originと照合する。一致しない / 欠落したcross-site POSTは拒否
- `Sec-Fetch-Site`が存在する場合は`same-origin`のみ許可
- cross-origin CORSを許可しない
- `Cache-Control: no-store`
- token / session ID / bodyをlogしない

cross-site form POST等によるsession injection / account swappingを防ぐ。cookieの`SameSite`だけをCSRF防御の根拠にしない。

restore / deleteも同様にPOST、same-origin、no-store、loggingなし。GET restoreは作らない（SW cacheとprefetchを避ける）。

session IDはserverが生成する。client bodyのsession IDは採用しない。createのたびに新しいsession IDを発行する。

## Token storage

Redisへ保存してよいもの:

- AES-256-GCM encrypted Drive access token
- IV / auth tag等のdecryptに必要な値
- `expiresAt`
- Drive token responseから得た最小scope metadata（`drive.file`があることだけ）

保存しないもの:

- raw session ID
- refresh token
- user account email
- Drive ID / folder ID / file ID
- Photos ID / album ID / upload token
- raw OAuth response全体
- Photos Picker token
- Photos export token
- `photoslibrary.appendonly` grant
- `photospicker.mediaitems.readonly` grant

encryption key:

- server-only Vercel environment variable
- 256-bit
- `NEXT_PUBLIC_`禁止
- Production / Previewで別値
- plaintext fallback禁止
- decrypt失敗時はsession invalid。tokenを返さない。chooserは出さない

key未設定ならcreate / restoreを拒否し、Google接続は現行どおりmemory-onlyへ落ちる。

## Token validation

Google tokeninfoをpage restoreごとに呼ぶ設計にはしない。tokeninfo URLへaccess tokenをquery parameterとして送る実装は採らない。

既存GIS Drive token client（`scope: drive.file`、`include_granted_scopes: false`）のcallbackで得たtokenだけをsession createへ渡すコード境界をcontract testする。Picker / export callbackからcreateを呼ぶ禁止。

session createでは最低限次を検証する。

- `expires_in`が正の有限値
- TTL上限3600秒
- scope metadataに`drive.file`がある
- Photos scopeをsession metadataとして受け入れない

欠落または不正ならcreateを拒否する。当該tabのmemory tokenは残してよい（後述のcreate failure UX）。

restoreではstore TTL / absolute expiryとdecrypt成功を見る。restoreのたびにGoogle tokeninfoは呼ばない。

restore後の実Drive APIが401 / 403等のauth failureになった場合:

- memory token clear
- server session delete
- cookie expire
- `notConnected`

automatic GIS authは禁止する。account chooserを自動表示しない。

## TTL

```text
ttlSeconds = min(googleTokenExpiresIn, 3600)
sessionExpiresAt = createdAt + ttlSeconds * 1000
```

- Redis TTLとcookie `Max-Age`は同じabsolute expiryをauthorityにする
- restoreでは延長しない
- refreshするたびにTTLを延長しない
- Google token expiryを超えてsessionを有効にしない
- 「60分保証」と書かない

`expires_in`は現行`app-providers.tsx`では未使用。create時にtoken responseの実値を使う。欠落時はcreateを拒否する。

## API候補

App Router Route Handler。Gate 0 FAIL後のpath方針。

```text
POST /api/google-session/create
POST /api/google-session/restore
POST /api/google-session/delete
```

実装ファイル候補:

```text
src/app/api/google-session/create/route.ts
src/app/api/google-session/restore/route.ts
src/app/api/google-session/delete/route.ts
```

本物のsession APIはPhase 1 hosting acceptanceのあと、crypto primitiveの次に作る。

restore:

- valid sessionならDrive access tokenをHTTPS response bodyで返す
- `Cache-Control: no-store`
- browserは`accessTokenRef`へだけ格納する
- React state / Context / storage / logsへ置かない
- invalid / expired / decrypt失敗 / backend unavailableはchooserなしで`notConnected`

restore responseをJSが受け取るため、XSSからaccess tokenを隔離する方式ではない。目的はtokenのbrowser persistenceを避けることである。runtime中のbrowser memory exposureは現行GISと同じ。

## Browser restore sequence

1. GIS scriptを読み、Drive / Photos export token clientを`initTokenClient`する。`requestAccessToken`はしない
2. Google account chooser / popup / consentを自動開始しない
3. same-origin restore POSTだけを呼ぶ
4. validならresponse JSONのDrive access tokenを`accessTokenRef`へだけ格納する
5. `googleStatus = connected`
6. invalid / expired / 4xx / 5xx / network fail → tokenを残さない、chooserを出さない、`notConnected`、手動接続を表示。自動retry loopなし
7. restore中でもPlayerはconfirmed IndexedDBを使う。Google restore待ちでplaybackを止めない

## Manual login contract

ユーザーが「Googleへ接続」を押したときだけ、現行Drive GIS flow（`prompt: "select_account"`、`drive.file`、`include_granted_scopes: false`）。

成功:

1. `accessTokenRef`へ格納（現行どおりこのtabで即connected）
2. session create POST
3. opaque HttpOnly cookieを発行

### session create failure UX

manual Google connect自体が成功し、`accessTokenRef`にtokenがあるが、server session createだけ失敗した場合:

- current pageでは`connected`を維持する
- Drive操作もcurrent memory tokenで継続可能
- session persistence unavailableとしてsanitizedな非blocking状態を保持してよい
- automatic retryは禁止
- refresh後は通常どおり`notConnected`になる
- Google接続そのものをfailure扱いにはしない
- chooserは自動で出さない

cookieがSetできない（ITP、PWA制限）場合も同じ扱う。Previewで区別して記録する。

## Disconnect / Drive auth failure

明示disconnect時:

1. memory Drive token clear
2. server session delete
3. cookie expire

server deleteが失敗してもbrowser memoryは必ずclearする。cookie expiry responseも試みる。session TTLによりserver側の最大残存時間は制限される。automatic retry loopはしない。best-effortのdeleteは1回まで。

Drive API auth failure時も同じcleanupへ落とす。`notConnected`。automatic GIS authは禁止。

reset Google auth flowも同じsession無効化を行う。Photos export tokenの既存cleanupは維持する。session対象ではない。

## Photos OAuth非回帰

Google Photosは完全にsession対象外。

- Photos Picker token: 保存しない
- Photos export token: 保存しない
- `photoslibrary.appendonly`: sessionへ入れない
- exportは引き続きユーザー操作開始時の専用token client

refresh後のPhotos exportは、Driveがrestoreされていてもexport操作開始時に既存consent方針で認可する。session createはDrive manual connect成功時だけ呼ぶ。

## Required infrastructure / manual setup

このdesign commitではprovisionしない。

### Vercel manual setup

- Upstash Redis via Vercel Native integration。最初はPreviewだけ
- session暗号化keyをserver-only envへ（PreviewとProductionで別値）
- `NEXT_PUBLIC_`を付けない
- Production RedisはPreview acceptance後
- Preview Deployment Protectionとsession cookie / fetchの相性はDashboard確認（未監査）

### Google Cloud manual setup

- 追加不要
- 既存Web application client IDとAuthorized JavaScript originsのまま
- Client Secretを作らない
- 新しいredirect URIを足さない
- 新しいOAuth scopeを足さない

Client Secretが必要になるのは案Bだけである。案Cでは不要。

## Implementation commit分割案

Phase 1は完了。次は`feature/google-session-backend`上でPhase 2へ進む。

1. Phase 1 hosting migration。完了。`chore: enable next server functions`。`output: "export"`撤去、秘密情報なしApp Router probe、Preview PASS
2. Phase 2 server-only crypto / session primitives。まだRedisをprovisionしない。環境依存なしunit testから始める。cryptographically secure session ID、SHA-256 lookup key、AES-256-GCM encrypt/decrypt、absolute expiry normalization、3600秒上限、scope metadata normalization。Google token / cookie / Redis / API route wiringはこの最初のcommitに入れない
3. create / restore / delete Route Handler。Origin / `Sec-Fetch-Site` / Content-Type / body size / no-store。tokenをlogしないtest。Drive GIS callbackだけがcreateへ渡るcontract test
4. `AppProviders`配線。manual connect成功後create。page loadでrestore。disconnect / Drive auth failureでdelete。GIS silentなし。create失敗はconnected維持。Photos経路非回帰test
5. session Preview acceptance。iPad PWA cookieを必須にする
6. 実装後docs: `environment-security.md`、`current-context.md`、acceptance。「60分保証」と書かない

各commitはrevert可能な大きさにする。hosting変更で既存PWAが壊れたらそのcommitをrevertする。

## Preview acceptance plan

Gate 0はFAIL済み。Phase 1 hosting migrationはPASS。token persistenceのacceptanceはsession API実装後。確認していない項目をpassedへしない。token、email、Drive ID、Preview URLは記録しない。

1. 明示「Googleへ接続」成功。chooserはこの操作のときだけ
2. 約5分後refresh → chooserなし → connected restore
3. 約30分後refresh → chooserなし → connected restore
4. 約55分後refresh → token/sessionがまだ有効ならrestore。切れていれば5と同じ
5. TTL / Google token expiry後refresh → chooserなし → `notConnected` → 手動再接続できる
6. disconnect後refresh → restoreしない
7. 別browser / private tab → sessionを共有しない
8. Photos export → 操作開始時の専用consentのまま。restoreだけではexport tokenが付かない
9. existing installed PWA → session cookieとsame-origin APIが動くか。動かない場合は未解決としてProductionへ出さない
10. offline（飛行機モード等）→ session確認失敗でもPlayer confirmed playbackを壊さない。chooserを自動表示しない
11. session create失敗（backend停止）→ 当該tabはconnected、Drive操作継続、refresh後は未接続、chooser自動なし
12. Drive auth failure → memory clear、server session無効、cookie expire、refresh後restoreしない

iPad PWAのcookie（standalone、ITP、既存install）は机上合格にしない。実機必須。Strict / `__Host-`が問題になるevidenceがあるときだけLaxを再検討する。

PWA新規install、WebP/PNG/動画Photos export、publication abnormal writeは本acceptanceの対象外。

## Rollback strategy

- Phase 1 hostingはPreview accepted。session未実装のままrevertする場合は`output: "export"`撤去commitを戻す
- Gate 0 spikeはfailed experimental evidence。mainへmergeしない
- session API導入後の障害は、APIを失敗させてclientを現行`notConnected`へ落とす。chooser自動起動へは戻さない
- Redis / 暗号化key障害時はconnect自体を止めず、persistence unavailable
- Vercel rollbackはserver sessionを消さない。TTLで消える。必要ならRedis flushはユーザーがDashboardで行う。docsへ接続情報を書かない
- Git / Vercel rollbackはDrive dataとIndexedDBを戻さない（既存`docs/release-rollback.md`）

## 明示的にやらないこと

- page-load GIS `prompt: ""` / `"none"`の再試行
- access tokenのbrowser storage
- Client Secret / refresh token / authorization code flow（今回）
- Photos export / Pickerをsessionへ入れる
- Google tokeninfoをrestoreごとに呼ぶこと
- tokeninfoへaccess tokenをquery parameterとして送ること
- 「60分保証」
- このcommitでのRedis provision、env追加
- Gate 0 spikeをmainへmergeすること
- 同じspikeでthird handler / `package.json` type変更 / `vercel.json` / module workaroundを試すこと
- Phase 2最初のcommitへGoogle token / cookie / Redis / API wiringを入れること

## 未決でPreviewへ持ち越す項目

- `trailingSlash: true`と将来のsession POST `/api/google-session/*/` の相性。Phase 1 probeのGET slash付きpathはPASS。必要ならAPI pathだけredirect対象外にする
- iPad standalone PWAで`SameSite=Strict` + `__Host-`が実際に残るか。ダメならLaxへ落とす判断はPreview evidenceだけで行う
- cookie名の最終文字列
- Upstash Redisの具体plan / リージョン。ユーザーがVercel Dashboardで選ぶ

## 結論

Recommended architecture: 案C。現行GIS token flow + server-side short-lived session。

Rejected alternatives: 案A（browser storage）、案B（authorization code + refresh token。今回の60分にはoverkill）、process memory store、page-load GIS silent auth、SWメモリpersistence、restoreごとのGoogle tokeninfo、tokeninfo query parameter。

Security boundary changes: server-only AES-256-GCM token store、hashed Redis lookup key、HttpOnly opaque cookie。browser persistent tokenは禁止のまま。Client Secretなし。refresh tokenなし。scopeは`drive.file`のまま。restore responseのmemory exposureは現行GISと同じlimitation。

Required infrastructure: Upstash Redis via Vercel Native integrationとserver-only 256-bit暗号化key。このcommitでは作らない。最初はPreviewだけ。

Required Vercel manual setup: Upstash integration（Preview）、server-only env。Productionはacceptance後。

Required Google Cloud manual setup: なし（既存Web client / JS originsのまま）。

Client Secret: 不要。

refresh token: 不要。

output: "export": Gate 0 FAILのあと撤去。Phase 1 hosting migration = PASS。App Router Route Handlerがhosting authority。60分session自体はまだ未実装。

Implementation commits: Phase 1完了 → Phase 2 server-only crypto primitives（Redis未provision） → session Route Handler → AppProviders配線 → session Preview acceptance → docs。

Preview acceptance gates: hosting probeはPASS。session本体の1–12は未実施。iPad PWA cookieは必須。

Rollback: spikeはmainへ入れない。export撤去は独立revert可能。API失敗時は現行未接続へ安全側に倒す。
