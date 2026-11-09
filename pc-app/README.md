# Tactical Archive PC（Windows デスクトップ版）

ブルーアーカイブ戦術対抗戦の対戦履歴を、**PC版ブルーアーカイブのスクリーンショット**から記録・検索する Windows 用アプリです（非公式）。

Web版（`docs/`）の処理をコピーして、デスクトップ向けの機能を足しています。Android版・Web版・PC版はそれぞれ別のアプリです。

## できること

- 初回にアスペクト比（16:9 / 4:3）を選ぶだけで使えます。トリミング位置は組み込み済みなので初回調整は不要です（設定から再調整・初期値に戻すこともできます）。
- 選んだ比率のスクリーンショットだけを読み込み、基準サイズ（16:9 = 1920×1080、4:3 = 1600×1200）にリサイズして読み取ります。
- **スクリーンショットフォルダの巡回**：設定でフォルダを登録し、「フォルダを巡回」（または `Ctrl+Shift+P`）を押すと、まだ読み込んでいない画像を古い順に取り込みます。
  - 処理したファイル（パス＋更新日時）は記録し、次回は飛ばします。登録済みの戦績はファイル名でも除外します。
  - 高速モードを ON にすると、確認が必要な画像だけ確認画面で止まります。
  - 終わると「取り込み N件・スキップ（対戦履歴以外）M件・アスペクト比違い K件」を表示します。
- **対戦履歴ではない画像の自動スキップ**：戦闘履歴（リザルト）画面でなければ、確認画面を出さずに飛ばします（設定で OFF にできます）。
- 攻撃/防衛タブ、検索、生徒図鑑、プリセットアイコン、バックアップ/リストア（Web版・Android版と同じ JSON 形式）、CSV出力、対戦相手名の修正辞書など、Web版の機能はそのまま使えます。
- 文字認識（Tesseract.js と日本語データ）とアイコンフォントを同梱しているので、オフラインでも動きます。

## 使い方

1. `TacticalArchivePC-<version>-portable.exe` を起動します（インストール不要）。
2. 画面の比率（16:9 / 4:3）を選んで「はじめる」。
3. 「設定 → スクリーンショットフォルダ（巡回）→ フォルダを選択」で、PC版ブルーアーカイブのスクリーンショットの保存先を選びます。
4. 「取り込み」タブの「フォルダを巡回」を押します。

ドラッグ＆ドロップ・画像の選択・`Ctrl+V` での貼り付けでも読み込めます。

### データの保存場所

`%APPDATA%\Tactical Archive PC\`（設定の一番下の「保存フォルダを開く」で開けます）

| ファイル | 内容 |
| --- | --- |
| `IndexedDB/`、`Local Storage/` | 戦績・生徒辞書・設定（Web版と同じ形式） |
| `config.json` | 登録したフォルダ、サブフォルダを巡回するか |
| `processed-files.json` | 巡回で処理したファイルの記録（設定の「処理済みの記録をリセット」で消せます） |
| `result-detection-log.jsonl` | リザルト判定のログ（画像ごとの判定値） |

portable 版でもデータは上の場所に保存されるので、exe を置き換えてもデータは残ります。

## リザルト画面の判定

組み込みのトリミング位置を使い、次の値を測ります（`renderer/app.js` の `analyzeResultScreen`）。

| 値 | 内容 |
| --- | --- |
| `modalWhite` | リザルト枠の中の白い画素の割合 |
| `outsideWhite` / `lumaContrast` | 枠の上下（暗くなった背景）の白い画素の割合／枠の内と外の明るさの差 |
| `gold` / `grey` | WIN（金色）/ LOSE（灰色）の位置の画素数 |
| `texturedSlots` | 12 個の生徒アイコンの位置のうち、絵がある（平坦でない）数 |
| `attackCorr` | 攻撃アイコンのテンプレートとの一致度（ZNCC） |

判定：`白い枠あり` かつ `生徒アイコンの絵あり` かつ（`攻撃アイコンが強く一致` または（`WIN/LOSE あり` かつ `枠の外が暗い`））

しきい値は `renderer/result-detection.js` にまとめてあります。誤判定があったら「設定 → リザルト判定ログを開く」で値を確認して調整してください。

## ビルド手順

必要なもの：Node.js 20 以上、Windows

```bash
cd pc-app
npm install
npm start          # 開発用に起動
npm run dist       # dist/ に portable exe を作る
npm run dist:nsis  # インストーラー版を作る場合
```

`npm install` で electron の実行ファイルがダウンロードされない場合（npm の install script 制限）は、`node node_modules/electron/install.js` を実行してください。

`npm start` / `npm run dist` の前に `scripts/copy-vendor.js` が `node_modules` から次のものを `renderer/vendor/` にコピーします（git には入れません）。

- tesseract.js 5.1.1（本体・worker）、tesseract.js-core 5.1.1（LSTM 版 wasm）
- 日本語学習データ `jpn.traineddata.gz`（`@tesseract.js-data/jpn` の 4.0.0_best_int。Web版が CDN から読むものと同じ）
- Font Awesome Free 6.4.0

## 構成

```
pc-app/
├── main.js              Electron メインプロセス（app:// で画面を配信、フォルダ・処理済み記録・ログの IPC）
├── preload.js           画面に渡す API（window.taDesktop）。contextIsolation 有効、nodeIntegration 無効
├── renderer/
│   ├── index.html / index.css / app.js   Web版のコピーを PC 用に変更したもの
│   ├── students_data.js / default_roster.json / icon.png
│   ├── result-detection.js               リザルト判定のしきい値
│   ├── pc-desktop.js / pc-desktop.css    フォルダ巡回・設定・ダイアログ
│   └── vendor/                           同梱ライブラリ（ビルド時にコピー）
└── scripts/copy-vendor.js
```

## 開発用

- `F12` / `Ctrl+Shift+I`：開発者ツール（認識のログを確認できます）
- `F5` / `Ctrl+R`：再読み込み
- 環境変数 `TA_USER_DATA=<フォルダ>` を付けて起動すると、データを別のフォルダに保存します（テスト用）。
