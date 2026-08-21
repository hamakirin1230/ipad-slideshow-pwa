# Google connection 60-minute session

Date: 2026-08-21
Status: Implementation-front architecture. Not implemented.
Branch: `design/google-connection-session`

この文書は、明示的な「Googleへ接続」のあと、page refreshしても最大約60分はGoogle account chooserを出さず Drive 接続を復元するための実装前architectureである。runtime、package、Vercel configはまだ変更しない。この文書を「60分接続維持は実装済み」とは読まない。

要件は「必ず60分」ではない。Google access tokenの`expires_in`が60分未満なら、その短い方をauthorityにする。silent延長は禁止する。refreshするたびにTTLを60分へ戻さない。

## 現行契約（このrepositoryで確認した事実）

確認対象: `next.config.ts`、`package.json`、`src/app/app-providers.tsx`、`src/lib/google-auth.ts`、`public/sw.js`、`src/app/root-deployment-contract.test.ts`、`docs/environment-security.md`、`docs/current-context.md`、`docs/acceptance/google-photos-export-acceptance.md`。

- Next.js 16.2.6。`output: "export"` かつ `trailingSlash: true`。`images.unoptimized: true`。`vercel.json`はない。`app/api`もroot `api/`もない
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

要件を満たせる。採用する。

## Recommended architecture

手動GIS connect成功 → HTTPS POSTでDrive access tokenをserverへ渡す → serverがtokenを検証し、TTL付きsessionをstoreへ書く → `Set-Cookie`はcryptographically randomなopaque session IDだけ。

page load → GIS client初期化（token requestなし） → same-origin session restore POST → 有効ならresponseのaccess tokenを`accessTokenRef`へだけ格納 → Drive `drive.file` grantをserver検証済みとしてconnected。

invalid / expired / backend unavailable → account chooserを自動表示しない → `notConnected` → 手動「Googleへ接続」。automatic retry loop禁止。

## Security boundary

現行契約からの追加:

- access tokenのbrowser persistent storageは引き続き禁止
- cookieへaccess token / refresh tokenを置かない
- cookieは最低256-bit（128-bit以上の要件を満たす）のcryptographically random opaque session IDだけ
- server-side session storeに暗号化済みDrive access tokenと、grant検証に必要な最小情報、`expiresAt`だけを置く
- encryption keyはVercel server-only環境変数。`NEXT_PUBLIC_`を絶対に付けない
- token / session IDをlogs、Vercel logs、diagnostics、error message、docs、URL、analyticsへ出さない
- session restore APIは`Cache-Control: no-store`
- CORSで他originから使わせない。same-origin only
- Client Secretとrefresh tokenは追加しない

現行契約で維持:

- Drive scopeは`drive.file`
- Photos exportは`photoslibrary.appendonly`専用client、`include_granted_scopes: false`、操作開始時だけ
- Player offline playbackはGoogle接続restore失敗で壊さない

## output: "export" 方針

session APIはrequestを読み、cookieを読み書きし、POSTを扱う。Next.js 16のstatic exportは次をunsupportedとする。

- Route Handlers that rely on Request
- Cookies API
- request-dependent dynamic logic

したがって`app/api/**`のRoute Handlerを`output: "export"`のまま追加すると、local / CIの`next build`が失敗する。これは推測ではなくNext.js static exportの現行ドキュメントである。

root `/api/*.ts`のVercel Functionをstatic exportと共存させる案は、このrepositoryのNext.js 16 + Vercel Next.js builder契約として実証されていない。Vercel / Next.js公式は`output: "export"`でAPI routesを無効化する。推測で共存可能と決めない。

推奨:

1. 実装phaseで`output: "export"`を撤去する
2. 既存App Router pageは動的server APIを使わないため、Vercel上は従来どおり静的に配信できる
3. `trailingSlash: true`はPWA path互換のため維持する。Route Handlerはtrailing slash redirectでPOST bodyを落さないことをPreviewで確認する。必要ならAPI pathだけredirect対象外にする
4. `images.unoptimized: true`、root pathのmanifest / `/sw.js`、GitHub Pages廃止は維持する
5. `src/app/root-deployment-contract.test.ts`は実装commitで`output: "export"`前提を更新する

`output: "export"`撤去の影響範囲:

- PWA `start_url: /`、`scope: /`、`/sw.js`は変更しない
- existing installed PWAは同じoriginのまま動く想定だが、Previewで実機確認する
- Service Workerは`/api/`をcache / interceptしないよう明示除外する。現行SWはPOSTを既に通すが、GET誤用と将来変更に備える
- GitHub Pagesへ戻す能力は既に捨てている。static host単体ではsession APIは動かない。それは受け入れ済みである
- CIの`pnpm build`は`output: "export"`なしの`next build`へ変わる。serverless functionが含まれる

Gate: `output: "export"`を残したままroot Vercel Functionでcookieを扱うprototypeは、このdesignでは採らない。どうしても残したい場合は、実装前に専用Preview spikeでSet-CookieとiPad PWA cookieが動くevidenceを取ってから再判断する。evidenceなしでは採用しない。

## Session store

serverless functionのprocess memoryだけにtokenを置く案は禁止する。instance間で共有されない。

候補:

| store | 評価 |
| --- | --- |
| function memory | REJECT。TTLもinstance間も保証できない |
| Vercel Marketplace Redis（Upstash互換） | 推奨。serverless向けREST、TTL、Vercel env連携 |
| 自前Upstash Redis | 同等。Marketplace未使用なら手動URL設定 |
| その他durable KV | 要件は満たし得るが、新規比較コストが大きい。今回は選ばない |

推奨store: Vercel MarketplaceのRedis（Upstash）。このdesign commitでは外部serviceをprovisionしない。実装前のmanual setup gateとする。

session dataは最大60分でTTL削除する。Redis TTLとcookie Max-AgeとGoogle token expiryの最短を使う。

保存してよいもの:

- 暗号化済みDrive access token
- `expiresAt`（Unix ms）
- `drive.file` grant検証済みフラグ、または検証済みscope文字列`https://www.googleapis.com/auth/drive.file`だけ

保存しないもの:

- refresh token
- user account email
- Drive ID / folder ID / file ID
- Photos ID / album ID / upload token
- raw OAuth response全体
- Photos Picker token
- Photos export token
- `photoslibrary.appendonly` grant

key例（docsへ実IDを書かない）: `gds:<opaqueSessionId>`。session ID自体をlogしない。

## Token encryption

session storeへplaintext tokenを置かない。

- AES-256-GCM
- keyは32-byte。Vercel server-only env。名前に`NEXT_PUBLIC_`を付けない
- 値は`iv + ciphertext + authTag`をserver外へ出さない形式でstoreする
- keyはProduction / Previewで分ける
- v1ではkey rotationは手動再発行（既存sessionは無効化）。rotation自動化は対象外

key未設定ならsession APIは起動してもcreate/restoreを拒否し、Google接続は現行どおりmemory-onlyへ落ちる。自動でplaintextへfallbackしない。

## Cookie

- 値: opaque session IDのみ。256-bit cryptographically random
- `HttpOnly`
- `Secure`（Preview / ProductionのHTTPS）
- `SameSite=Strict`を第一候補。same-origin POSTだけがcookieを送れば足りる。Laxは他siteからのtop-level GETでcookieが付き得る
- `Path=/`
- `Max-Age`はsession TTL秒。最大3600
- Production / Previewでは`__Host-` prefixを推奨（`Secure`必須、`Path=/`、`Domain`属性なし）
- local `next dev`のHTTPでは`__Host-`を付けられない。localだけ別cookie名にする。実装時に分岐する。Preview実機を正式確認とする

cookie名の実値はdocsへ固定しすぎない。実装時に選ぶ。

## CSRF / session fixation / replay

- same-origin only。`Origin`がこのappのProductionまたは当該Preview originと一致しないrequestは拒否。`Origin`欠落のcross-site POSTも拒否
- CORS headerを他originへ出さない
- restore / create / deleteはすべてPOST + `credentials: "include"`。GET restoreは作らない（SW cacheとprefetchを避ける）
- アプリ由来であることを示す非機密header（例: 固定名のcustom header）を必須にする。値にtokenを入れない
- session IDはserverが生成する。client bodyのsession IDは採用しない
- createのたびに新しいsession IDを発行する。古いsessionは上書きせずTTL切れまたは明示delete
- restoreはTTLを延長しない。replay可能時間はtoken expiryまで
- User-Agent bindingはiPadの揺れでfalse denyし得るのでv1ではしない

## TTL

```text
sessionExpiresAt = now + min(googleExpiresInSec, 3600) * 1000
```

- Google token expiryを超えてsessionを有効にしない
- 60分を超えて有効にしない
- restore成功でもexpiresAtを更新しない
- silent延長禁止

`expires_in`は現行`app-providers.tsx`では未使用。GISの典型値は約3600秒だが、実装はtokeninfoまたはtoken responseの実値を使う。欠落時は短く見る（例: 50分）かcreateを拒否する。誇張した60分固定にしない。

## Server token verification

session create時、client申告のscopeを信じない。serverがGoogleのtokeninfo（tokenをqueryへ載せない方法）またはDriveの最小readで次を確認する。

- tokenが有効
- audienceがこのappのOAuth client ID
- scopeに`drive.file`がある
- `photoslibrary.appendonly`だけのtoken、Picker専用tokenは拒否
- `expires_in`を読む

restore時も、storeから復号したtokenがまだ有効かを確認してからbrowserへ返す。無効ならsession削除、401、chooserなしで`notConnected`。

verification APIのrequest/responseをappのlogへ出さない。

## Browser restore sequence

1. GIS scriptを読み、Drive / Photos export token clientを`initTokenClient`する。`requestAccessToken`はしない
2. Google account chooser / popup / consentを自動開始しない
3. same-origin `POST /api/google/session/restore`（名前は実装時に確定）だけを呼ぶ
4. validならresponse JSONのDrive access tokenを`accessTokenRef`へだけ格納。React state / Context / consoleへ出さない
5. serverが`drive.file`を確認済みなら`googleStatus = connected`
6. invalid / expired / 4xx / 5xx / network fail → tokenを残さない、chooserを出さない、`notConnected`、手動接続を表示。自動retry loopなし
7. restore中でもPlayerはconfirmed IndexedDBを使う。Google restore待ちでplaybackを止めない

restore responseを`console.log`しない。devtools NetworkはHTTPS上の運用リスクとして残るが、appはtokenを複製しない。

## Manual login contract

ユーザーが「Googleへ接続」を押したときだけ、現行Drive GIS flow（`prompt: "select_account"`、`drive.file`、`include_granted_scopes: false`）。

成功:

1. `accessTokenRef`へ格納（現行どおりこのtabで即connected）
2. `POST /api/google/session`でserver session create
3. opaque HttpOnly cookieを発行

### session create失敗時

| 案 | UX | security | consistency |
| --- | --- | --- | --- |
| a. このtabはconnected。refresh persistenceだけunavailable | Google許可後にRedis障害でも作業を続けられる | tokenはmemoryのみ。現行と同等 | refresh後は今日と同じ未接続 |
| b. 全体failure。memory tokenも捨てる | 成功したGoogle許可を失敗に見せる。chooser再実行 | persistence失敗を接続失敗と同一視 | refresh前後は揃う |

推奨: **a**。非機密の`sessionPersist: "unavailable"`だけをUI stateにして、「この画面では接続済み。再読み込み後は再接続が必要です。」と出す。tokenはstateへ入れない。chooserは出さない。

bはRedis障害のたびに明示OAuthをやり直し、iPad運用を壊す。aは60分維持を成功と偽らない限り安全契約を緩めない。

create成功後にcookieがSetできない（ITP、PWA制限）場合もaと同じ扱いにする。Previewで区別して記録する。

## Disconnect / Drive auth failure

`disconnectGoogle`の必須契約:

- browser memoryのDrive tokenを消す（現行）
- Photos export token clear（現行。session対象ではないが既存cleanupは維持）
- `POST /api/google/session/delete`でserver session削除
- session cookieをMax-Age=0でexpire

Drive API `authRequired` / token invalid時:

- memory token clear
- server sessionを無効化（delete）
- cookie expire
- `notConnected`へ戻し、chooserは自動で出さない

reset Google auth flowも同じsession無効化を行う。

delete API失敗時もbrowser側は切断する。server TTLに任せる。自動retry loopはしない。数回以内のbest-effort一回は可。失敗をtokenやsession IDつきで出さない。

## Photos OAuth非回帰

Drive 60分sessionへ入れない:

- Photos Picker token
- Photos export token
- `photoslibrary.appendonly` grant
- `photospicker.mediaitems.readonly` grant

Google Photos exportは引き続き操作開始時だけ専用token client。session restore対象外。refresh後のPhotos exportは、Driveがrestoreされていてもexport操作開始時に既存consent方針で認可する。

session createはDrive manual connect成功時だけ呼ぶ。Picker / export callbackから呼ぶ禁止。

## Required infrastructure / manual setup

このdesign commitではprovisionしない。実装開始前のユーザー作業。

### Vercel manual setup

- Marketplace Redis（Upstash）をProduction / Previewへ追加
- REST URLとtokenをserver-only envへ
- session暗号化keyをserver-only envへ（Production / Previewで別値）
- `NEXT_PUBLIC_`を付けない
- Preview Deployment Protectionとsession cookie / fetchの相性をDashboardで確認する（未監査）

### Google Cloud manual setup

- 追加不要が第一結論
- 既存Web application client IDとAuthorized JavaScript originsのまま
- Client Secretを作らない
- 新しいredirect URIを足さない
- 新しいOAuth scopeを足さない
- tokeninfo / Drive最小検証は既存tokenで行う

Client Secretが必要になるのは案Bだけである。案Cでは不要。

## Implementation commit分割案

runtimeはこのdesign commitに含めない。実装するときは概ね次の順。

1. `output: "export"`撤去とdeployment contract test更新。pageは静的のまま。`trailingSlash`維持。SWが`/api/`を触らない。Previewで既存route / PWA shellが生きていること
2. session ID生成、AES-GCM、TTL計算、Redis adapterのpure moduleとunit test。HTTP未接続
3. `POST` create / restore / delete Route Handler。Origin検査、no-store、cookie属性、tokeninfo検証。tokenをlogしないtest
4. `AppProviders`配線。manual connect成功後create。page loadでrestore。disconnect/auth failureでdelete。GIS silentなし。Photos経路非回帰test
5. Preview acceptance（下記）。iPad PWA cookieを必須にする
6. 実装後docs: `environment-security.md`、`current-context.md`、acceptance。未実装のまま「60分必ず維持」と書かない

各commitはrevert可能な大きさにする。1のhosting変更だけ先にPreviewへ出し、問題ならそこで止める。

## Preview acceptance plan

実装後、Productionへ出す前にPreview / 実iPadで行う。確認していない項目をpassedへしない。token、email、Drive ID、Preview URLは記録しない。

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
11. session create失敗（backend停止）→ 当該tabはconnected、refresh後は未接続、chooser自動なし
12. Drive auth failure → server session無効、refresh後restoreしない

iPad PWAのcookie（standalone、ITP、既存install）は机上合格にしない。実機必須。

PWA新規install、WebP/PNG/動画Photos export、publication abnormal writeは本acceptanceの対象外。既存の未確認リストを消化しない。

## Rollback strategy

- 実装前のmainは今日の契約のまま。このdesign branchをmergeしなければruntime影響はない
- 実装中はPreviewだけ。Production aliasへ出さない
- hosting変更（`output: "export"`撤去）で既存PWAが壊れたら、そのcommitをrevertしてstatic exportへ戻す。session APIは同時に無効化する
- session API導入後の障害は、Route Handlerを失敗させてclientを現行`notConnected`へ落とす。chooser自動起動へは戻さない
- Redis / 暗号化key障害時はconnect自体を止めず、persistence unavailable（推奨案a）
- Vercel rollbackはserver sessionを消さない。TTLで消える。必要ならRedis flushはユーザーがDashboardで行う。docsへ接続情報を書かない
- Git / Vercel rollbackはDrive dataとIndexedDBを戻さない（既存`docs/release-rollback.md`）

## 明示的にやらないこと

- page-load GIS `prompt: ""` / `"none"`の再試行
- access tokenのbrowser storage
- Client Secret / refresh token / authorization code flow（今回）
- Photos export / Pickerをsessionへ入れる
- 「必ず60分」
- このcommitでのRedis provision、env追加、runtime変更

## 未決でPreviewへ持ち越す項目

- iPad standalone PWAで`SameSite=Strict` + `__Host-`が実際に残るか。ダメならLaxへ落とす判断をPreview evidenceで行う。机上ではStrict
- restore時tokeninfoを毎回呼ぶか、Redis TTLだけにするか。第一候補は毎回検証。latencyが実機で sorければcreate時のみへ縮小する
- cookie名とAPI pathの最終文字列
- Marketplace Redisの具体plan（無料枠 / リージョン）。ユーザーがVercel Dashboardで選ぶ
- `output: "export"`撤去後のVercel function region。既定のままでよい想定

## 結論

Recommended architecture: 案C。現行GIS token flow + server-side short-lived session。

Rejected alternatives: 案A（browser storage）、案B（authorization code + refresh token。今回の60分にはoverkill）、process memory store、page-load GIS silent auth、SWメモリpersistence。

Security boundary changes: server-only encrypted token storeとHttpOnly opaque cookieを追加する。browser persistent tokenは禁止のまま。Client Secretなし。refresh tokenなし。scopeは`drive.file`のまま。

Required infrastructure: Vercel Marketplace Redis（Upstash）とserver-only暗号化key。このcommitでは作らない。

Required Vercel manual setup: Redis integration、server-only env、Preview/Production分離。

Required Google Cloud manual setup: なし（既存Web client / JS originsのまま）。

Client Secret: 不要。

refresh token: 不要。

output: "export": 残したままrequest-dependent session APIは使えない。実装時に撤去する。pageの静的配信と`trailingSlash`は維持する。root `/api`共存は未実証なので採らない。

Implementation commits: hosting → crypto/store → Route Handler → AppProviders配線 → Preview acceptance → docs。

Preview acceptance gates: 上記1–12。iPad PWA cookieは必須。

Rollback: Preview限定、export撤去は独立revert、API失敗時は現行未接続へ安全側に倒す。
