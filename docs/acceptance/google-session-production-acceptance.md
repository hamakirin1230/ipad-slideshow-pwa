# Google Drive session Production acceptance

Date: 2026-08-22

Status:
Production functional acceptance PASS.
Absolute-expiry real-time boundary acceptance pending.

対象:
server-side short-lived Drive session + browser restore + auto Drive workspace validation。

これはVercel Productionと実iPadでのfunctional acceptanceである。Preview evidenceは[`google-session-preview-acceptance.md`](google-session-preview-acceptance.md)として残す。この文書をPreview confirmationの書き換えとはしない。

live pageを60分で強制logoutする機能の確認ではない。authorization code flow / refresh token方式ではない。

temporary deployment URL、access token、cookie値、session ID、Redis key / value、encryption key、Drive ID、raw API errorは記録しない。

## Scope

対象は、明示的なGoogle Drive接続のあと、page reloadでGIS account chooserを出さず Drive sessionを復元し、既存のread-only workspace validationを自動で1回実行する経路である。

- 通常Drive OAuth scopeは`drive.file`
- page loadではGIS `requestAccessToken`を呼ばない
- 手動connectのみ。`prompt: "none"` / silent GIS restoreは使わない
- restore後のtokenは既存`accessTokenRef`だけに戻す
- auto workspace checkは既存read-only validationの再利用であり、`createWorkspace` / save / publish / offline sync / Photos exportを自動実行しない
- explicit disconnectでlocal memory clear + server session delete
- Google Photos OAuthはDrive session create / delete lifecycleの対象外

## Implemented Production acceptance

2026-08-22、Vercel Productionと実iPadで確認した。Production deploymentはREADYだった。temporary deployment URLは記録しない。

| 項目 | 結果 |
| --- | --- |
| 手動Google Drive connect success | PASS |
| Drive session create API success（200） | PASS |
| reload時にGIS chooserを自動表示しない | PASS |
| reload時はsame-origin restoreのみ | PASS |
| restore後tokenは既存`accessTokenRef`だけに戻す | PASS |
| restore後、既存read-only Drive workspace validationを自動で1回実行 | PASS |
| ユーザーが設定を開かなくても「つくる」が利用可能 | PASS |
| Google Photos export後もDrive sessionは維持 | PASS |
| Photos export後reloadでもrestore → auto Drive check → 「つくる」が正常利用可能 | PASS |
| Photos OAuthはDrive session create / delete lifecycleから隔離 | PASS |
| explicit disconnectでlocal memory clear + server delete | PASS |
| Production runtime create / restore / delete が200 | PASS |
| disconnect後reloadで接続状態が復活しない | PASS |
| disconnect後にGIS chooserが自動表示されない | PASS |
| acceptance観測中にserver runtime error / warning / fatalなし | PASS |

## Implementation contracts recorded during acceptance

- server-side short-lived Drive session
- page-load GIS `requestAccessToken`なし
- 手動connectのみ
- restore → `accessTokenRef`のみ
- auto read-only Drive workspace validation
- explicit disconnect
- Photos OAuth / session isolation
- browser cookieはopaque session IDのみ
- access tokenをbrowser storage / cookie / UI / log / docsへ保存しない
- server storeでtokenを暗号化
- session lifetime上限は`min(expires_in, 3600 seconds)`
- restoreでTTL延長しない
- retryなし
- Drive 401 / 403 / `authRequired`はmemory clear + session delete + manual reconnect
- ProductionとPreviewは現在同じFree Upstash resourceを共有する
- `GOOGLE_SESSION_ENCRYPTION_KEY`はenvironment別である
- Redis / token / key / cookie / session ID / Drive ID / temporary deployment URLの値は記録しない

## Not accepted / not verified

- 実時間でsession absolute expiryを跨いだ実機確認
- live pageを60分で強制logoutする機能。これは今回の契約ではない。server session expiry後のpage reload / 次回restoreで`notConnected`となる契約であり、その実時間境界は未確認
- Google Photos video-only 0-photo実機case。このsession acceptanceとは別件で未確認
- authorization code flow / refresh token。今回の推奨ではない
