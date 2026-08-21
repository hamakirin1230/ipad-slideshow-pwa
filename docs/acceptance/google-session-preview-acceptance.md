# Google Drive session Preview acceptance

Date: 2026-08-22

Status:
Preview functional acceptance PASS.
Production acceptance pending.
Absolute-expiry real-time boundary acceptance pending.

対象:
server-side short-lived Drive session + browser restore + auto Drive workspace validation。

これはPreview上の実iPad functional acceptanceである。Production acceptedではない。live pageを60分で強制logoutする機能の確認でもない。

Evidence branch: `feature/google-session-phase3-http`

temporary Preview hostname / URL、access token、cookie値、session ID、Redis key / value、encryption key、Drive ID、raw API errorは記録しない。

## Scope

対象は、明示的なGoogle Drive接続のあと、page reloadでGIS account chooserを出さず Drive sessionを復元し、既存のread-only workspace validationを自動で1回実行する経路である。

- 通常Drive OAuth scopeは`drive.file`
- page loadではGIS `requestAccessToken`を呼ばない
- `prompt: "none"` / silent GIS restoreは使わない
- browser cookieはopaque session IDのみ
- access tokenはbrowser storage / cookie / UI / log / docsへ保存しない
- restore後のtokenは既存`accessTokenRef`だけに戻す
- auto workspace checkは既存read-only validationの再利用であり、`createWorkspace` / save / publish / offline sync / Photos exportを自動実行しない
- Google Photos OAuthはDrive session create / delete lifecycleの対象外

## Implemented Preview acceptance

2026-08-22、Vercel Previewと実iPadで確認した。Preview deploymentはREADYだった。temporary Preview URLは記録しない。

| 項目 | 結果 |
| --- | --- |
| 手動Google Drive connect success | PASS |
| Drive session create API success | PASS |
| reload時にGIS chooserを自動表示しない | PASS |
| reload時はsame-origin restoreのみ | PASS |
| restore後tokenは既存`accessTokenRef`だけに戻す | PASS |
| restore後、既存read-only Drive workspace validationを自動で1回実行 | PASS |
| ユーザーが毎回「保存場所を確認」を押さなくても「つくる」が利用可能 | PASS |
| 実Driveのworkspace / project一覧を再取得できた | PASS |
| explicit disconnectでlocal memory clear + server delete | PASS |
| disconnect後reloadで接続状態が復活しない | PASS |
| disconnect後にGIS chooserが自動表示されない | PASS |
| Google Photos export後もDrive sessionは維持 | PASS |
| Photos export後reloadでもrestore → auto Drive check → 「つくる」が正常利用可能 | PASS |
| Photos OAuthはDrive session create / delete lifecycleから隔離 | PASS |
| Vercel Preview runtimeでcreate / restore / deleteが200 | PASS |
| acceptance観測中にserver runtime error / warning / fatalなし | PASS |

## Implementation contracts recorded during acceptance

- normal Drive OAuth scopeは`drive.file`
- page-load GIS `requestAccessToken`なし
- `prompt: "none"` / silent GIS restoreなし
- browser cookieはopaque session IDのみ
- access tokenをbrowser storage / cookie / UI / log / docsへ保存しない
- server storeでtokenを暗号化
- session lifetime上限は`min(expires_in, 3600 seconds)`
- restoreでTTL延長しない
- retryなし
- Drive 401 / 403 / `authRequired`はmemory clear + session delete + manual reconnect
- Photos export用OAuthは別token clientでsession対象外
- auto workspace checkはread-only
- `createWorkspace` / save / publish / offline sync / Photos exportを自動実行しない

## Not accepted / not verified

- Production provisioning
- Production deployment
- Production実iPad acceptance
- 実時間でsession absolute expiryを跨いだ実機確認
- live pageを60分で強制logoutする機能。これは今回の契約ではない。server session expiry後のpage reload / 次回restoreで`notConnected`となる契約であり、その実時間境界は未確認
- Google Photos video-only 0-photo実機case。このsession acceptanceとは別件で未確認
- authorization code flow / refresh token。今回の推奨ではない

このPreview functional acceptanceをProduction confirmationへ昇格させない。
