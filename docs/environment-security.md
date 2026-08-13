# Runtime environment / security contract

Date: 2026-08-12
Status: Current authoritative guidance

この文書は、repositoryから再現できるruntime environment契約と、2026-08-12時点で観測したVercel security headerの境界を記録します。実Client ID、Production / Previewのorigin一覧、temporary Preview URLは記録しません。

## Hostingとtoolchain

- 正式なhosting / deployment先はVercel Productionのみ
- package managerは`pnpm@10.34.4`
- browser buildに必要なアプリ固有の環境変数は`NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- server runtimeには`BLOB_READ_WRITE_TOKEN`と`PUBLIC_SHARE_SECRET`が必要

## Browser-build environment

`NEXT_PUBLIC_GOOGLE_CLIENT_ID`には、Google OAuthのWeb application client IDを設定します。`NEXT_PUBLIC_`変数はbrowser bundleに含まれるため、この値はserver secretではありません。ただし、repositoryの`.env.example`には実運用値を置かず、変数名と空のplaceholderだけを置きます。

このアプリはClient SecretとAPI keyを使用しません。access tokenも環境変数へ置きません。access tokenはlocalStorage / IndexedDB / Cookie / docs / logsへ保存しません。

## Server-only environment

`BLOB_READ_WRITE_TOKEN`はVercel Blobへのimmutable public artifact作成、activation追加、resolver処理だけに使用します。`PUBLIC_SHARE_SECRET`はapp project ID、revision ID、asset identityから公開用のopaque IDをHMAC導出するために使用します。どちらも`NEXT_PUBLIC_`を付けず、browser bundleへ含めません。

Google access tokenは管理画面からpublication server routeへの`Authorization` headerと、Google Drive APIへの`Authorization` headerでのみ一時利用します。query string、Cookie、React state、Context value、localStorage、IndexedDB、server logへ保存しません。server routeはraw Google API errorをclientへ返しません。

local developmentでは実値を`.env.local`などのignore対象ファイルへ置き、Gitへcommitしません。VercelではProject Environment Variablesに設定し、Production / Previewそれぞれで使用するoriginをGoogle OAuthのAuthorized JavaScript originsと一致させます。acceptance用に追加したtemporary Preview originはacceptance終了後に削除します。実Client IDや登録済みorigin一覧はdocsへ記録しません。

## Security header観測記録

2026-08-12に、Vercel Production rootと、`finalization/product-ready`の最新READY Preview rootを確認しました。temporary Preview URL自体はCurrent docsへ保存しません。

アプリ本体のroot応答で確認できた事実:

- HTTPSで`200`を返す
- Vercel配信層の`Strict-Transport-Security`がある
- repositoryにcustom security headerを定義する`vercel.json`や同等の設定はない
- `Content-Security-Policy`、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`は観測されなかった

PreviewにはVercel Deployment Protectionがあり、未認証のrootはVercelの認証入口へredirectする。その入口ではVercel側の`X-Frame-Options`などが返るが、これはアプリ本体へrepositoryから設定したheaderではない。認証を通したPreview本体のroot応答は上記の観測結果だった。

この記録はroot応答とrepository設定の監査であり、Vercel Dashboard固有のsecurity設定、Deployment Protectionの全設定、Firewall等は未監査です。必要に応じてDashboardで別途確認します。

## 今回変更しないsecurity境界

今回、security headerは追加しません。特にCSP（`Content-Security-Policy`）、`Cross-Origin-Opener-Policy`、`Cross-Origin-Embedder-Policy`、`Permissions-Policy`を推測で導入しません。

header変更後のPreviewで、次との互換性をまだacceptanceしていないためです。

- Google Identity Servicesの外部script: `https://accounts.google.com/gsi/client`
- Google Drive API
- Google Photos Picker
- Blob URL
- Service Worker
- Next.js standard deploymentが生成するscript

CSP、Cross-Origin-Opener-Policy、Cross-Origin-Embedder-PolicyはOAuth popup、外部script、worker等へ影響し得ます。security hardeningを行う場合は別commitとし、変更後のPreviewでOAuth / Drive / Photos / PWA / Service WorkerをacceptanceしてからProductionへ反映します。
