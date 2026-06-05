# 2026-06-06 第4-4-2 /player 手動スライド送り完了 引き継ぎメモ

このファイルは、iPad用スライドショーPWA制作プロジェクト `ipad-slideshow-pwa` の次チャット引き継ぎ用メモです。

## 1. リポジトリ

hamakirin1230/ipad-slideshow-pwa

## 2. 現在のフェーズ

第4ゴール / 第4-4 `/player` Drive画像表示

完了スライス:

- 第4-4-1 `/player` Drive画像1枚表示
- 第4-4-2 `/player` 手動スライド送り

第4-4-2では、`/player` で Drive由来の本編スライドを、丸い `＜` / `＞` ボタンで手動切り替えできるようにした。

このスライスでは、自動送り、`durationSeconds`、caption表示、全画面スライドショー、iPadスワイプ操作、オフライン再生、IndexedDB同期、先読みは実装していない。

## 3. 直近の完了状況

### 3.1 第4-4-1 `/player` Drive画像1枚表示

完了済み:

- `/player` の mock data 依存を削除
- Drive由来の `projectDetails.slides[0]` を表示対象に変更
- `fetchProjectSlidePreviewBlob()` を流用
- `/player` 専用 hook `usePlayerCurrentSlideImage()` を追加
- Drive API media取得で画像Blobを取得
- Blobから object URL を作成
- 通常の `<img>` で表示
- `object-fit: contain` 相当で画像全体を表示
- `AbortController.abort()` cleanup
- `URL.revokeObjectURL()` cleanup
- access token / Authorization header / full assetFileId / object URL / Drive API URL をUIに出さない方針を維持

第4-4-1 completion handoff:

- `docs/handoffs/2026-06-06-goal-04-4-1-completion-handoff.md`

### 3.2 第4-4-2 `/player` 手動スライド送り

更新ファイル:

- `src/app/player/page.tsx`

主な変更内容:

- `currentSlideIndex` を `/player` ページ本体の local state として追加
- `slideCount = projectDetails?.slides.length ?? 0` を追加
- `safeCurrentSlideIndex` を追加
- `currentSlide = projectDetails?.slides[safeCurrentSlideIndex] ?? null` に変更
- `projectDetails.slides[0]` 固定表示を解除
- `usePlayerCurrentSlideImage()` は変更せず、そのまま再利用
- `＜ 1 / N ＞` の手動送りUIを追加
- `＜` / `＞` は丸いボタンとして表示
- `aria-label="前のスライドへ"` / `aria-label="次のスライドへ"` を追加
- 先頭では `＜` を disabled
- 末尾では `＞` を disabled
- スライド1枚の場合は両方 disabled
- 画像読み込み中でも、端でなければ前後移動可能
- 画像取得失敗時でも、端でなければ前後移動可能

第4-4-2で変更しなかったもの:

- `src/app/player/use-player-current-slide-image.ts`
- `src/app/app-providers.tsx`
- `src/lib/google-drive.ts`
- `/admin` 関連
- docs
- mock data

## 4. 第4-4-2で決めた設計方針

### 4.1 スコープ

第4-4-2は、手動の前へ / 次へだけに絞った。

含めたもの:

- `currentSlideIndex`
- `＜` / `＞` による手動送り
- `1 / N` の位置表示
- 先頭/末尾での disabled
- index範囲補正
- 既存hookへの現在スライド渡し替え

含めなかったもの:

- 自動送り
- `durationSeconds` の読み取り・表示・使用
- 再生 / 一時停止
- ループ再生
- caption表示
- 全画面表示
- iPad Safari / PWA最適化
- 左右スワイプ操作
- 次スライド先読み
- 複数 object URL 保持
- IndexedDB保存
- オフライン再生
- 永続キャッシュ

### 4.2 index管理

`currentSlideIndex` は `/player/page.tsx` の local state にした。

採用方針:

- 初期値は `0`
- `AppProviders` には入れない
- URL queryには出さない
- localStorage / IndexedDBには保存しない
- リロード後は先頭スライドから開始

理由:

- 現時点では `/player` 画面内だけの一時的なUI状態だから
- Drive/projectの真の状態と、プレイヤー操作状態を混ぜないため

### 4.3 index補正

`slides.length` が変わった場合、`currentSlideIndex` は範囲内へ補正する。

方針:

- `slideCount === 0` の場合は `0` に戻す
- `slideCount > 0` の場合は `0` から `slideCount - 1` の範囲に収める
- 範囲内なら維持
- 範囲外になった時だけ補正

実装上の注意:

- render中に `setCurrentSlideIndex()` しない
- `useEffect` で補正
- React lintを避けるため、effect本文で同期的にsetStateしない
- `queueMicrotask()` を使い、`setCurrentSlideIndex((current) => ...)` で補正

### 4.4 操作UI

操作UIは画像表示領域の下に配置。

表示:

```text
＜     1 / N     ＞
```

方針:

- `＜` は前のスライドへ
- `＞` は次のスライドへ
- 中央表示は `safeCurrentSlideIndex + 1 / slideCount` のみ
- `slideIdPart` は出さない
- `assetIdPart` は出さない
- `assetFileId` は出さない
- asset名は出さない
- MIMEは出さない
- captionは出さない
- `durationSeconds` は出さない

アクセシビリティ:

- `＜` ボタンには `aria-label="前のスライドへ"`
- `＞` ボタンには `aria-label="次のスライドへ"`
- disabled時も `aria-label` は維持
- `aria-label` に内部IDやasset名は含めない

### 4.5 ボタンの有効/無効

方針:

- `currentSlideIndex === 0` の時、`＜` は disabled
- `currentSlideIndex === slideCount - 1` の時、`＞` は disabled
- `slideCount === 1` の時、両方 disabled
- ループはしない
- 最後から先頭へ戻らない
- 先頭から末尾へ戻らない

理由:

- 第4-4-2はindex変更と画像再取得の安全性確認が目的
- ループは自動送りや本番再生体験の設計と合わせて後続で決めるべきだから

### 4.6 読み込み中・失敗時の操作

方針:

- 画像読み込み中でも、端でなければ `＜` / `＞` は押せる
- 画像取得失敗時でも、端でなければ `＜` / `＞` は押せる
- 画像取得失敗だけで `projectStatus` / `projectDetails` / Drive状態を変更しない
- 失敗スライドで詰ませない

理由:

- Drive取得が遅い時でも、ユーザーが次のスライドへ移動できるようにするため
- 1枚の画像取得失敗でプレイヤー全体を止めないため

### 4.7 画像切替時の表示

方針:

- index変更直後は古い画像を残さない
- 新しいスライドの画像取得中は `スライド画像を読み込んでいます。` を表示
- 新しい画像Blob取得に成功したら画像表示
- 取得失敗時は `スライド画像を表示できません。`
- 前のスライド画像を「つなぎ」として残さない

理由:

- `2 / N` と表示されているのに1枚目の画像が残るような、表示対象と画像のズレを避けるため
- 見た目の滑らかさより、状態の正確さを優先する段階だから

## 5. 確認結果

第4-4-2実装後、ローカルで以下を実行し成功済み。

```zsh
git diff -- src/app/player/page.tsx
git diff --check
npm run lint
npm run build
```

build結果:

```text
Next.js 16.2.6 (Turbopack)
Compiled successfully
Finished TypeScript
Generated static pages
```

Route (app):

- `/`
- `/_not-found`
- `/admin`
- `/auth-test`
- `/player`
- `/settings`

手動確認:

- `/player` で表示確認済み
- スライド送りUIがきちんと表示された
- GitHub Desktopで Commit → Push 済み
- GitHub Actions deploy 完了済み

実施済みコミットの趣旨:

- Add player manual slide navigation

正確なコミット履歴は、次チャットでGitHub上の最新履歴を確認すること。

## 6. 現在も守る安全境界

今後も必ず守ること:

- Drive fileを公開共有しない
- Drive fileIdを公開URL化しない
- access tokenをContext valueやUI propsに直接出さない
- access tokenをUIやdiagnosticsに出さない
- Authorization headerをUIやdiagnosticsに出さない
- full `assetFileId` をUIやdiagnosticsに出さない
- object URLをUIやdiagnosticsに出さない
- Drive API URLをUIやdiagnosticsに出さない
- Blob本体をReact stateに保存しない
- object URLを作ったら不要時に `URL.revokeObjectURL()` する
- 画像取得失敗だけで `projectStatus` / `projectDetails` を変更しない
- 画像取得失敗だけでDrive状態やproject状態をリセットしない
- `/player` 側で access token を props / state / hook引数に渡さない
- `/player` 側で `fetchDriveProjectAssetBlob()` を直接 import しない

## 7. 今後の重要前提

このチャット終盤で、今後の機能について以下を前提として確認した。

### 7.1 本番再生はオフラインiPad再生が原則

最終的な本番運用では、`/player` が毎回Driveから画像を読むのではなく、iPad側ストレージへ同期したデータを使って再生する方針。

つまり、将来的には以下をiPad側に保存・同期する必要がある。

- 再生順データ
- 画像Blob
- caption
- `durationSeconds`
- asset metadata
- manifest相当データ
- 同期済みバージョン情報
- 最終同期日時
- 同期失敗・未同期状態
- 削除反映
- 破損検知
- 再同期処理

保存先候補:

- IndexedDBが本命
- 画像Blobを扱うため、localStorageは不適切

注意:

- オフライン同期は別ゴール級の大きな設計
- Drive Blob取得型プレイヤーとは責務が変わる
- 小パッチで混ぜないこと

### 7.2 iPadでは左右スワイプでもスライド移動できるようにする

将来的に `/player` では、iPadの左右スワイプでスライド移動できるようにする。

想定方針:

- 左スワイプ: 次へ
- 右スワイプ: 前へ
- 先頭/末尾では移動しない
- ボタン操作と同じ `currentSlideIndex` 更新関数を使う
- 画像読み込み中でもスワイプ可能にするかは、既存のボタン方針と揃える
- 縦スクロールやブラウザ戻るジェスチャーとの干渉に注意
- iPad Safari / ホーム画面PWAで実機確認が必要

注意:

- 第4-4-2ではまだ未実装
- スワイプは入力方式追加なので、ボタンでindex遷移が安定した後に載せるべき
- 全画面化やPWA表示最適化と干渉する可能性がある

## 8. 現在も未実装のこと

第4-4-2完了時点でも、以下はまだ未実装。

- `durationSeconds` に基づく自動送り
- 再生 / 一時停止
- ループ再生
- caption表示
- 全画面スライドショー
- iPad Safari / PWA表示最適化
- iPad左右スワイプ操作
- スライド編集UI
- `durationSeconds` 編集
- caption編集
- スライド順変更
- 複数素材一括追加
- 画像プレビューの永続キャッシュ
- IndexedDB保存
- iPadストレージへの同期
- オフライン本番再生
- ETag / revisionId による強い同時編集制御
- 競合merge UI
- rollback

## 9. 次に進む候補

### 候補A: 第4-4-2 completion handoff追加

このファイルを docs に追加し、Commit → Push → GitHub Actions deploy まで行う。

推奨コミット名:

```text
Add goal 04-4-2 completion handoff
```

### 候補B: 第4-4-3 caption表示設計

次に軽く進めるなら、caption表示が候補。

論点:

- captionを画像下に出すか、画像に重ねるか
- captionなしの時に何も出さないか
- 文字サイズ
- 背景帯
- iPad表示での可読性
- 全画面時にどう扱うか
- オフライン再生時のcaption同期

### 候補C: 第4-4-3 `durationSeconds` 自動送り設計

手動送りが完了したので、自動送りを載せる土台はできた。

ただし、次の論点を先にグリルするべき。

- timerは画像表示成功後に開始するか
- 画像読み込み中にtimerを進めるか
- 画像取得失敗時に止めるか、次へ進むか
- 最後で止めるか、ループするか
- 手動操作時にtimerをリセットするか
- 接続切れ時にtimerを停止するか
- `durationSeconds` の最小値・最大値・不正値をどう扱うか

### 候補D: 第4-4-4 iPadスワイプ操作設計

手動ボタンによるindex遷移が安定した後、同じindex更新処理にスワイプ入力を追加する。

ただし、iPad Safari / PWA実機確認が必要なので、焦って入れない方がよい。

### 候補E: 第4-5 オフライン同期 / IndexedDB設計

本番運用上は重要度が高い。

ただし、これは別ゴール級の大きな設計なので、captionや自動送りなどの基本再生体験をどこまで先に固めるかを決めてから入るべき。

主な論点:

- 何を同期対象にするか
- IndexedDBのスキーマ
- Blob保存形式
- manifest保存形式
- 同期開始UI
- 同期完了状態
- 差分更新
- 削除反映
- 容量不足
- iPadストレージ制限
- オフライン時の起動判定
- Drive側更新との整合性
- ETag / revisionId を使うか
- 破損時の再同期
- rollback
