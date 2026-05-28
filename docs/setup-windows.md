# Windows 11 セットアップ手順

## 前提

この手順は、Windows 11 PCで第1-1を再現するためのメモです。

作業フォルダ:

`C:\Users\<Windowsユーザー名>\src\ipad-slideshow-pwa`

今回の実作業環境:

`C:\Users\syokota\src\ipad-slideshow-pwa`

## 使用するツール

- Node.js LTS
- npm
- Visual Studio Code
- GitHub Desktop
- Chrome または Edge

## バージョン確認

PowerShellで確認する。

`node -v`

`npm -v`

`code --version`

## GitHubリポジトリ

- Owner: `hamakirin1230`
- Repository: `ipad-slideshow-pwa`
- Visibility: Public

公開予定URL:

`https://hamakirin1230.github.io/ipad-slideshow-pwa/`

## clone先

`C:\Users\syokota\src\ipad-slideshow-pwa`

GitHub Desktopでcloneする。

## ローカル起動

VS Codeでプロジェクトを開き、内蔵ターミナルで実行する。

`npm run dev`

確認URL:

`http://localhost:3000/ipad-slideshow-pwa/`

## ビルド確認

`npm run build`

## 注意点

- GitHub Desktopでcloneする前に、GitHub上で空のpublic repositoryを作る
- GitHub上でREADMEや.gitignoreやlicenseは作らない
- Next.jsアプリはリポジトリ直下に作る
- GitHub Pages Project site前提のため、`basePath` は `/ipad-slideshow-pwa`
- Service Workerは第1-1では入れない
- npm自体の更新案内が出ても、第1-1中は更新しない