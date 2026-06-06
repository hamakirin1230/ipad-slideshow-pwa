# Goal 04-4-5 完了ハンドオフ: /player durationSeconds 自動送り

作成日: 2026-06-06

## ステータス

Goal 04-4-5 は完了。

`/player` で、現在表示中のスライドの `durationSeconds` に基づき、画像表示完了後に次のスライドへ自動送りする機能を追加した。

GitHub Actions deploy 完了済み。

## 完了したこと

- `/player` に `durationSeconds` ベースの自動送りを追加
- 自動送りは `/player` で常時有効
- 再生 / 一時停止UIは追加しない
- ON/OFF切り替えUIは追加しない
- ループ再生は追加しない
- 進行バー、残り秒数、debug表示は追加しない
- 視覚アニメーションは追加しない
- `durationSeconds` は 1〜60 の整数のみ有効
- `durationSeconds` が未設定、不正値、小数、範囲外の場合は 5秒扱い
- 画像の `<img onLoad>` 完了後にタイマーを開始
- 画像読み込み中は自動送りしない
- 画像取得失敗時は自動送りしない
- 最後のスライドでは自動送りしない
- 手動ボタンで移動した後は、移動先画像の表示完了後にタイマーを数え直す
- スワイプで移動した後も、移動先画像の表示完了後にタイマーを数え直す
- `setTimeout` + cleanup で古いタイマーを破棄
- caption表示仕様は維持
- スワイプ操作仕様は維持
- 前後ボタンとスライド番号表示は維持

## 変更ファイル

- `src/app/player/page.tsx`

## 実装内容

### 1. durationSeconds の正規化

`durationSeconds` を安全に扱うため、以下の定数と正規化関数を追加した。

- `DEFAULT_SLIDE_DURATION_SECONDS = 5`
- `MIN_SLIDE_DURATION_SECONDS = 1`
- `MAX_SLIDE_DURATION_SECONDS = 60`
- `normalizeDurationSeconds(value: unknown): number`

有効値:

- `number` 型
- 整数
- 1以上
- 60以下

無効値として 5秒扱いにするもの:

- `undefined`
- `null`
- 文字列
- `NaN`
- `0`
- 負数
- 小数
- 60秒超過
- その他の不正値

第4-4-5では、小数秒は扱わない。

### 2. 前後移動関数の安定化

既存の前後移動関数を `useCallback` で安定化した。

対象:

- `goToPreviousSlide()`
- `goToNextSlide()`

目的:

- 自動送り用 `useEffect` から安全に `goToNextSlide()` を呼ぶため
- React Hooks の依存関係をごまかさないため
- 不要なタイマー再作成を抑えるため

挙動:

- `slideCount === 0` の場合は何もしない
- 前へ移動するときは `0` 未満にならない
- 次へ移動するときは `slideCount - 1` を超えない

既存の前後ボタンとスワイプ操作は、引き続きこの共通関数を使う。

### 3. 画像表示完了の判定

自動送りタイマーは、Drive Blob取得成功時点ではなく、`<img onLoad>` 完了後に開始する。

理由:

- `objectUrl` ができた時点では、ブラウザ上で画像表示が完了しているとは限らないため
- `durationSeconds` は「画像が実際に見えている時間」として扱うため

実装では、boolean の `isCurrentImageLoaded` を直接 state として持たず、読み込み完了済みの `objectUrl` を state として保持する形にした。

追加した state:

- `loadedImageObjectUrl`

派生値:

- `isCurrentImageLoaded`

考え方:

- `loadedImageObjectUrl === objectUrl` なら、現在の画像は load 済み
- `objectUrl` が変われば一致しなくなるため、自動的に未ロード扱いになる
- `useEffect` 内で同期的に `setState(false)` する必要がない

この形にした理由:

- React Hooks lint の `react-hooks/set-state-in-effect` エラーを避けるため
- 画像切り替え時の未ロード状態を自然に表現するため

### 4. `<img>` の変更

`<img>` に以下を追加した。

- `key={objectUrl}`
- `onLoad={() => setLoadedImageObjectUrl(objectUrl)}`

目的:

- `objectUrl` が変わったときに別画像として扱いやすくする
- 新しい画像の読み込み完了後にだけ自動送りを許可する

### 5. 自動送り用 useEffect

自動送りは `useEffect` + `setTimeout` で実装した。

`setInterval` は使用していない。

理由:

- 今回の仕様は「現在のスライドを指定秒数見せたら1回だけ次へ進む」ため
- 1スライドごとに1つの `setTimeout` を作る方が挙動を追いやすいため
- cleanup によって古いタイマーを確実に破棄しやすいため

タイマー作成条件:

- `status === "ready"`
- `objectUrl` が存在する
- `isCurrentImageLoaded === true`
- `slideCount > 0`
- `safeCurrentSlideIndex < slideCount - 1`

タイマーを作らない状態:

- 画像読み込み中
- 画像準備中
- 画像取得失敗時
- `objectUrl` がない状態
- 画像の `<img onLoad>` が未完了の状態
- スライドが0件の状態
- 最後のスライド

タイマー発火時:

- `goToNextSlide()` を呼ぶ

cleanup:

- `clearTimeout(timeoutId)` を必ず実行する

これにより、手動ボタンやスワイプで移動した場合も、古いタイマーが残りにくい。

## 自動送り仕様

### 基本仕様

- `/player` では自動送りが常時有効
- 画像の表示完了後に `durationSeconds` 秒待つ
- 指定秒数後に次のスライドへ進む
- 最後のスライドでは停止する
- 最後から1枚目には戻らない

### durationSeconds

有効値:

- 1〜60 の整数

既定値:

- 5秒

5秒扱いになる値:

- 未設定
- 不正値
- 0
- 負数
- 小数
- 60超過
- `NaN`
- 数値以外

### 画像状態との関係

画像読み込み中:

- 自動送りしない

画像取得失敗時:

- 自動送りしない
- 手動ボタンやスワイプでの移動は維持

画像表示成功時:

- `<img onLoad>` 完了後にタイマー開始

### 手動操作との関係

前後ボタンで移動した場合:

- 既存タイマーは cleanup される
- 移動先画像の `<img onLoad>` 後に新しくタイマー開始

スワイプで移動した場合:

- 既存タイマーは cleanup される
- 移動先画像の `<img onLoad>` 後に新しくタイマー開始

## 意図的に含めなかったこと

Goal 04-4-5 では、以下は実装対象外とした。

- 再生 / 一時停止UI
- 自動送りON/OFF切り替えUI
- ループ再生
- 最後のスライドから1枚目へ戻る処理
- 進行バー
- 残り秒数表示
- timer active などのdebug表示
- 視覚アニメーション
- スライド横流れアニメーション
- フェード切り替え
- タブ非表示時の特別対応
- PWAバックグラウンド時の特別対応
- 画面ロック時の特別対応
- `visibilitychange` 対応
- `document.visibilityState` 対応
- caption表示仕様の変更
- caption編集UI
- スワイプ仕様の変更
- `/admin` の変更
- Drive取得処理の変更
- `usePlayerCurrentSlideImage()` の変更
- Provider の変更
- オフライン同期
- IndexedDB保存
- 本番再生エンジン設計

## 維持した安全境界

以下の安全境界は維持している。

- Drive file を公開共有しない
- Drive fileId を公開URL化しない
- access token を UI props に出さない
- access token を UI に表示しない
- Authorization header を UI に表示しない
- full `assetFileId` を UI に表示しない
- object URL を UI に表示しない
- Drive API URL を UI に表示しない
- Blob 本体を React state に保存しない
- object URL の cleanup は既存 hook 側の責務として維持
- 画像取得失敗だけで Drive 状態をリセットしない
- 画像取得失敗だけで project 状態をリセットしない
- `/player` で `fetchDriveProjectAssetBlob()` を直接 import しない
- `/player` で access token を props や hook 引数に渡さない
- `window` / `document` に自動送り用イベントを登録しない
- 自動送り状態や内部タイマー状態を UI に表示しない

## 検証

最初の実装では、以下の lint エラーが発生した。

- `react-hooks/set-state-in-effect`

原因:

- `useEffect` 内で `setIsCurrentImageLoaded(false)` を同期的に呼んでいたため

修正:

- boolean の `isCurrentImageLoaded` state を廃止
- `loadedImageObjectUrl` state を追加
- `isCurrentImageLoaded` を `loadedImageObjectUrl === objectUrl` の派生値に変更

修正後、コミット前に以下を実行し、成功を確認済み。

~~~zsh
git diff -- src/app/player/page.tsx
git diff --check
npm run lint
npm run build
~~~

確認結果:

- `git diff --check` 成功
- `npm run lint` 成功
- `npm run build` 成功
- Next.js build 成功
- `/player` の static generation 成功
- lint error なし
- TypeScript error なし

デプロイ:

- GitHub Desktop で commit
- GitHub Desktop で push
- GitHub Actions deploy 完了

## 手動確認ポイント

確認対象の挙動:

- `/player` で画像表示完了後、`durationSeconds` 秒後に次へ進む
- 画像読み込み中は自動送りされない
- 画像取得失敗時は自動送りされない
- 最後のスライドでは自動送りされない
- 手動ボタンで移動した後、移動先画像の表示完了後にタイマーが数え直される
- スワイプで移動した後、移動先画像の表示完了後にタイマーが数え直される
- 前後ボタンは従来どおり動く
- スワイプは従来どおり動く
- caption表示は第4-4-3の仕様を維持している
- 自動送り用の余計なUIやdebug表示が出ていない
- 最後のスライドから1枚目へループしない

## 今後の注意点

第4-4-5では、自動送りの最小成立だけを実装した。

今後検討が必要なもの:

- 再生 / 一時停止
- ループ再生
- 自動送りON/OFF
- 進行バー
- 残り秒数表示
- 自動送り中に手動操作した場合のUX
- タブ非表示時の停止 / 再開
- PWAバックグラウンド時の停止 / 再開
- 画面ロック時の扱い
- オフライン再生時のタイマー設計
- IndexedDB上の画像Blobを使う場合の画像表示完了判定
- 本番展示向けの再生エンジン設計

## 次の候補

次の候補:

1. 第4-4-6 再生 / 一時停止設計
2. 第4-4-6 ループ再生設計
3. 第4-5 オフライン同期 / IndexedDB 設計

推奨:

次に再生 / 一時停止やループ再生へ進む前に、オフライン再生との境界を強く意識して設計をグリルする。

理由は、再生 / 一時停止、ループ、進行バーは、最終的な本番再生エンジンに近い責務を持つため。  
本番運用ではオフラインiPad再生が原則なので、Drive Blob 直接再生前提で再生制御を作り込みすぎると、IndexedDB を使ったオフライン再生へ移行するときに後戻りが発生しやすい。

第4-4-5は、あくまで Drive Blob 直接再生上で `durationSeconds` を使えるようにする最小実装として完了した。
