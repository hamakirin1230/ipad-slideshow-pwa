# Goal 04-4-4 完了ハンドオフ: /player iPadスワイプ操作

作成日: 2026-06-06

## ステータス

Goal 04-4-4 は完了。

`/player` で、画像と caption を含むスライド表示エリアに左右スワイプ操作を追加した。

iPad実機で、左右スワイプによるスライド移動ができることを確認済み。

## 完了したこと

- `/player` に左右スワイプ操作を追加
- 左スワイプで次のスライドへ移動
- 右スワイプで前のスライドへ移動
- 先頭スライドでは右スワイプしても移動しない
- 末尾スライドでは左スワイプしても移動しない
- 既存の前後ボタンと同じ index 更新関数を使用
- スワイプ対象は画像と caption を含むスライド表示エリアのみに限定
- 前後ボタンとスライド番号表示は維持
- caption 表示仕様は維持
- 画像読み込み中でもスワイプ移動可能
- 画像取得失敗時でもスワイプ移動可能
- 視覚アニメーションは追加しない
- 自動送り、ループ再生、再生 / 一時停止は追加しない

## 変更ファイル

- `src/app/player/page.tsx`

## 実装内容

### 1. 前後移動ロジックの共通化

既存の前後ボタン内に直接書いていた `setCurrentSlideIndex(...)` を、以下の関数に分離した。

- `goToPreviousSlide()`
- `goToNextSlide()`

これにより、前後ボタンとスワイプ操作が同じ移動ロジックを使うようになった。

挙動:

- `slideCount === 0` の場合は何もしない
- 前へ移動するときは `0` 未満にならない
- 次へ移動するときは `slideCount - 1` を超えない

### 2. スワイプ開始位置の保持

スワイプ開始位置は React state ではなく `useRef` で保持するようにした。

保持する値:

- `clientX`
- `clientY`
- `pointerId`

`useRef` を使う理由:

- スワイプ開始位置は画面に表示する値ではない
- state に入れると不要な再描画が発生する
- pointer down から pointer up まで一時的に保持できれば十分

### 3. Pointer Events によるスワイプ判定

スライド表示エリアに以下の handler を追加した。

- `onPointerDown`
- `onPointerUp`
- `onPointerCancel`

`window` や `document` にはイベント登録していない。

### 4. `onPointerDown` の挙動

`onPointerDown` では、以下を行う。

- `event.isPrimary` が `false` の場合は無視
- mouse の場合、左ボタン以外は無視
- `clientX` / `clientY` / `pointerId` を `useRef` に保存
- `setPointerCapture(event.pointerId)` を可能なら呼ぶ
- `preventDefault()` は使わない

`setPointerCapture()` を使う理由:

- 指がスライド表示エリアから少し外れても、`onPointerUp` を取りやすくするため
- 開始位置だけが残って誤判定するリスクを下げるため

### 5. `onPointerUp` の挙動

`onPointerUp` では、以下を行う。

- 保存済みの `pointerId` と一致しない場合は無視
- 横移動量 `dx` と縦移動量 `dy` を計算
- 判定後は `swipeStartRef` を `null` に戻す
- 横移動の絶対値が `50px` 未満ならスワイプ不成立
- 横移動の絶対値が縦移動の絶対値以下ならスワイプ不成立
- `dx < 0` の場合は左スワイプとして `goToNextSlide()` を呼ぶ
- `dx > 0` の場合は右スワイプとして `goToPreviousSlide()` を呼ぶ
- `preventDefault()` は使わない

### 6. `onPointerCancel` の挙動

`onPointerCancel` では、スワイプ開始位置を破棄する。

- `swipeStartRef.current = null`

キャンセル時にはスライド移動しない。

### 7. スワイプ対象エリア

スワイプ対象は、画像と caption を含む wrapper に限定した。

対象に含むもの:

- 画像表示エリア
- caption 表示

対象に含めないもの:

- 前へボタン
- 次へボタン
- スライド番号表示
- ページ全体

これにより、ボタン操作やページ全体の操作との干渉を抑えている。

### 8. `touch-action`

スワイプ対象 wrapper に以下を指定した。

- `touchAction: "pan-y"`

目的:

- 縦方向の操作はブラウザの自然なスクロールとして残す
- 横方向のスワイプ判定をこちらで扱いやすくする
- `preventDefault()` に頼らない実装にする

## スワイプ判定仕様

スワイプ成立条件:

- primary pointer である
- mouse の場合は左ボタンである
- 横移動量の絶対値が `50px` 以上
- 横移動量の絶対値が縦移動量の絶対値より大きい

方向:

- 左スワイプ: 次へ
- 右スワイプ: 前へ

端の挙動:

- 先頭では前へ移動しない
- 末尾では次へ移動しない
- スライド1枚の場合は移動しない

## 意図的に含めなかったこと

Goal 04-4-4 では、以下は実装対象外とした。

- 視覚アニメーション
- スライド横流れアニメーション
- フェード切り替え
- 自動送り
- `durationSeconds` 対応
- ループ再生
- 再生 / 一時停止
- 全画面スライドショー
- スワイプ感度のUI設定
- スワイプ方向のUI設定
- caption 表示仕様の変更
- caption 編集UI
- `/admin` の変更
- Drive取得処理の変更
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
- `window` / `document` にスワイプ用イベントを登録しない
- `preventDefault()` を使わない

## 検証

コミット前に以下を実行し、成功を確認済み。

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

実機確認:

- iPadでスワイプ操作ができることを確認済み
- 左スワイプで次へ進むことを確認済み
- 右スワイプで前へ戻ることを確認済み

デプロイ:

- GitHub Desktop で commit
- GitHub Desktop で push
- GitHub Actions deploy 完了

## 手動確認ポイント

確認済みまたは確認対象の挙動:

- `/player` で左スワイプすると次のスライドへ進む
- `/player` で右スワイプすると前のスライドへ戻る
- 先頭で右スワイプしても移動しない
- 末尾で左スワイプしても移動しない
- 前後ボタンは従来どおり動く
- スライド番号表示は従来どおり更新される
- caption 表示は第4-4-3の仕様を維持している
- 画像読み込み中でも、端でなければスワイプ移動できる
- 画像取得失敗時でも、端でなければスワイプ移動できる
- 縦方向の操作がスワイプ扱いされにくい
- スワイプ対象は画像と caption を含むスライド表示エリアに限定されている
- 前後ボタン付近の操作がスワイプ判定に巻き込まれにくい

## 今後の注意点

スワイプ操作は実装済みだが、以下は後続で検討する。

- スワイプ成立時の視覚アニメーション
- 全画面スライドショー時のスワイプ体験
- PWAホーム画面起動時のジェスチャー干渉
- 画面端スワイプとブラウザ戻る操作の干渉
- スワイプ感度の調整
- 自動送り中に手動スワイプした場合の挙動
- オフライン再生時のスワイプ挙動

## 次の候補

次の候補:

1. 第4-4-5 `durationSeconds` 自動送り設計
2. 第4-4-5 再生 / 一時停止設計
3. 第4-5 オフライン同期 / IndexedDB 設計

推奨:

次に `durationSeconds` 自動送りへ進む場合は、実装前に必ず設計をグリルする。

理由は、自動送り、ループ再生、再生 / 一時停止は、最終的な再生エンジンに近い責務を持つため。  
本番運用ではオフラインiPad再生が原則なので、Drive Blob 直接再生前提で再生制御を作り込みすぎると、IndexedDB を使ったオフライン再生へ移行するときに後戻りが発生しやすい。

スワイプ操作は入力方式の追加なので比較的後戻りが少ない。  
一方、自動送りは画像取得状態、失敗時の扱い、オフライン状態、再生タイマー、手動操作との関係に強く依存する。
