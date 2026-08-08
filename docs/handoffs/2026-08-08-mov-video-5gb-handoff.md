# MOV動画・5GB上限対応 handoff

Date: 2026-08-08
Branch: `feat/mov-video-5gb`
Base: `4a159746dd1c690e44a7796334d0d2c33347c4d2`

## 到達点

- `video/mp4`と`video/quicktime`を正式なDrive動画playback MIMEとして扱う
- ローカル動画importは1ファイル`5 * 1024 * 1024 * 1024` bytes以下を許可する
- 0 byteと5GB超はDrive upload開始前にrejectする。ちょうど5GBは許可する
- MIMEが空または`application/octet-stream`の場合、`.mp4` / `.mov`からMIMEを補完する
- 既知MIMEと`.mp4` / `.mov`が矛盾する場合はrejectし、変換・rename・自動修復しない
- ローカル動画uploadは従来どおりresumable方式と8MiB chunkを使う
- MP4/MOVとも50MB以下はactual MIMEでoffline Blob保存を試みる
- 50MB超〜5GB以下はBlobを取得せず、metadataだけを`remoteOnly`としてconfirmed storeへ保持する
- 5GB超またはsize不明はBlobを取得せず、sanitized unsupported stateで再生対象外にする
- playerはMP4/MOVのactual MIMEをoffline Blob、remote session、`canPlayType`まで保持する
- codec/containerはtranscodeせず、WebKitのnative playbackへ渡す
- media errorではcodec名を推測せず、安全な一般案内と手動retry / previous / nextを維持する
- 旧QuickTime slideの`unsupportedVideoMimeType`はplayback/offline projectionでのみobsolete markerとして扱い、Drive manifestやpublication canonical contentは自動rewriteしない

## 共通policy

正本は`src/lib/drive-video-policy.ts`。

```text
DRIVE_VIDEO_OFFLINE_MAX_BYTES = 50 * 1024 * 1024
DRIVE_VIDEO_MAX_BYTES = 5 * 1024 * 1024 * 1024
supported MIME = video/mp4, video/quicktime
local upload type = resumable
```

容量分類:

| 条件 | offline Blob | confirmed metadata | playback |
| --- | --- | --- | --- |
| 0 < size <= 50MB | 取得・MIME/size検証 | 保存 | offline-first |
| 50MB < size <= 5GB | 取得しない | `remoteOnly` | online Drive streaming |
| size > 5GB | 取得しない | unsupported reason付き | 対象外 |
| size不明 | 取得しない | safe-side unsupported reason付き | 対象外 |

## Service Worker変更境界

`public/sw.js`は既存Drive remote video streaming処理だけを変更した。

- session MIMEに`video/mp4` / `video/quicktime`を許可
- session file size上限を2GBから5GBへ変更
- file size検証は`Number.isSafeInteger`を使用
- response fallback `Content-Type`は`session.mimeType`を使用
- diagnosticsは`video/mp4` / `video/quicktime` / `missing` / `other`を分類
- 32MiB stream chunk、Range semantics、session TTL、Drive fetch、Authorization保持方式は変更なし
- `APP_CACHE_NAME`、`APP_SHELL_URLS`、install / activate、app shell cache、fetch routing構造は変更なし
- byte offsetへbitwise operatorを導入していない

## 維持した境界

- Google Photos Picker動画上限は50MBのまま
- Photos Pickerのdownload MIME policyは`video/mp4`のまま
- IndexedDB schema/versionとobject storeは変更なし
- manifest / index schema/versionは変更なし
- publication provenance、publish authority、rollback authorityは変更なし
- OAuth scope、access token保持境界、public sharing、server proxyは変更なし
- offline sync progress count semanticsとauto retry policyは変更なし
- unused asset physical deleteはJPEG / PNG / WebPだけ。MP4/MOVは対象外
- Drive fileのrename、migration、自動削除、自動修復は追加していない

## Large-number / memory safety

- resumable uploadのoffset / final `Content-Range`を5GB近傍で検証
- Service Workerの2GB超Range start/endと5GB近傍`Content-Range`を検証
- uploadは`Blob.slice()`による8MiB chunk処理を維持
- resumable upload関数内でfull-file `arrayBuffer()` / `text()` / `new Blob()`を使わないことをsource regression testで確認
- remote stream response bodyは全体bufferせず、既存のstream responseを維持

## Security boundary

- UI/diagnosticsへaccess token、Authorization/Bearer、Drive URL、full Drive file ID、raw response bodyを渡さない
- Service Worker status payloadとplayer fallbackのserialization testで禁止情報非露出を確認
- access tokenはAppProviders内部memoryからService Worker session登録へだけ渡し、永続化しない

## 検証結果

```text
npx -y pnpm@10 exec vitest run <13 focused files>
Test Files 13 passed
Tests 376 passed

npx -y pnpm@10 exec vitest run
Test Files 46 passed
Tests 889 passed

npx -y pnpm@10 lint
success

npx -y pnpm@10 build
success

git diff --check
success
```

## 未実施acceptance

- 実iPad / iPad WebKitでのMOV codec互換性確認は未実施
- 実Google Drive上の3GB級MOV resumable upload / remoteOnly streaming確認は未実施
- 実Google Drive上のちょうど5GBファイル確認は未実施

MOV container対応はnative playbackへ渡すところまでであり、全codecの再生成功を保証しない。実機でcodec非対応の場合は、安全なfallback表示を基に別形式へ変換して再登録する。
