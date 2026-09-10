# Tactical Archive (タクティカル・アーカイブ)

『ブルーアーカイブ（Blue Archive）』戦術対抗戦の対戦履歴をスクリーンショットから自動認識・記録・分析する完全ローカル・オフライン動作の Android アプリです。

[![Version](https://img.shields.io/badge/Version-v1.1.16-blue.svg)](#)
[![Download APK](https://img.shields.io/badge/Download-APK-00A3FF?logo=android&logoColor=white)](https://github.com/roundabout-oxygen/Tactic_Archive/raw/main/release/TacticalArchive.apk)
[![Platform](https://img.shields.io/badge/Platform-Android-green.svg)](#)
[![Kotlin](https://img.shields.io/badge/Kotlin-2.3.20-purple.svg)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20On--Device-success.svg)](#)

---

## 📸 画面イメージと使い方ガイド

### 💡 アップロードする対象画像について（どのスクショを使うか？）

本ツールが解析・自動記録の対象としているのは、**ゲーム内の「戦術対抗戦のリザルト画面（対戦終了画面）」**のスクリーンショットです。

- **対象となる画面**:
  - 対戦終了直後に表示される**リザルト画面（勝利「WIN」または敗北「LOSE」が表示されている画面）**。
- **画面に含まれる要素**:
  - 画面上部：対戦相手の指揮官アイコンおよび指揮官名
  - 画面左側：自分の攻撃編成生徒アイコン（味方6名）
  - 画面右側：相手の防衛編成生徒アイコン（敵6名）
- **撮影・アップロード時のポイント**:
  - 端末で撮影した**全画面スクリーンショット（トリミングや縮小・加工をしていない元の画像）**をそのままアップロードしてください。
  - 「Upload」タブへのドラッグ＆ドロップ、またはファイル選択ボタンから**複数枚まとめての一括アップロード**が可能です。

---

### 1. 初回起動時のトリミング位置指定（完全ローカル動作のための初期設定）
外部サーバーに一切通信せず端末内（オンデバイス）だけで超高精度な画像認識を行うため、**初回のみトリミング枠の手動キャリブレーション（位置合わせ）**を行います。

| 1. 相手名トリミング指定 | 2. 攻撃側生徒トリミング指定 | 3. 防衛側生徒トリミング指定 |
| :---: | :---: | :---: |
| <img src="docs/images/guide_calibration_name.png" width="260" alt="相手名トリミング指定"> | <img src="docs/images/guide_calibration_attacker.png" width="260" alt="攻撃側生徒トリミング指定"> | <img src="docs/images/guide_calibration_defender.png" width="260" alt="防衛側生徒トリミング指定"> |
| 対戦相手の指揮官名枠を指定 | 攻撃側生徒（味方6名）枠を指定 | 防衛側生徒（相手6名）枠を指定 |

> **💡 キャリブレーションのポイント**
> - 初回アップロード時、画面の案内に沿って「相手指揮官名」「攻撃編成生徒アイコン」「防衛編成生徒アイコン」の枠をドラッグして合わせます。
> - 一度設定した座標比率は端末の解像度・アスペクト比ごとに自動保存されるため、**2回目以降のアップロードではこの作業は不要**です。

---

### 2. リザルト登録画面（未登録生徒のワンタップ登録 ＆ 相手名の学習辞書）
アップロードされたスクリーンショットは自動で即座に解析されます。

<p align="center">
  <img src="docs/images/guide_register_screen.png" width="620" alt="リザルト登録画面">
</p>

- **未登録生徒は赤枠で強調表示**:
  - まだ名簿に登録されていない生徒や新生徒は**赤枠**で表示されます。アイコンをタップして生徒名を選択するだけで即座に登録が完了します。
- **相手指揮官名の照合プレビュー ＆ 自動辞書学習**:
  - 対戦相手の名前はフォントや文字装飾によって OCR 認識精度に差が出ることがあります。
  - そのため、最初のうちは**右側に表示されるトリミング元画像プレビューを確認しながら修正**を行ってください。
  - 一度修正して登録すると**「リネーム辞書」へ自動的に学習・登録**され、次回以降同じ相手と対戦した際は自動で正しい名前に置換・修正されます。

---

### 3. 戦績履歴一覧 ＆ 高度なスマート絞り込み（匿名対策・固有武器記録）
登録された対戦履歴は、高速かつ多角的なフィルターで瞬時に絞り込み・勝率分析が可能です。

<p align="center">
  <img src="docs/images/guide_history_screen.png" width="620" alt="履歴一覧と匿名絞り込み">
</p>

- **「匿名」相手の絞り込み活用法**:
  - 上位グループなどで相手の名前が「匿名」になっている場合、検索窓で「匿名」と絞り込みを行います。
  - 相手の防衛編成（特に D5 / D6 の特殊生徒やアタッカー）の**固有武器レベル（固有3・固有2など）を右端のメモ欄に青（攻撃）/ 黄（防衛）の数字で記録**しておくと、匿名相手でも編成と武器状況から対戦相手を正確に特定・メタ編成を組み立てることができ非常に便利です。

---

## 🌟 主な機能

### 1. 完全端末内・高速画像解析 (On-Device OCR & Image Match)
- 戦術対抗戦のリザルト画面（勝利/敗北）のスクリーンショットを選択するだけで、自動で対戦情報を解析します。
- **対戦相手名認識**: Tesseract OCR による相手指揮官名の高精度自動読み取り。
- **編成生徒の画像認識**: テンプレートマッチング（ZNCC）および画像特徴量比較により、生徒アイコンから自動で編成生徒を特定。
- **画面解像度・アスペクト比自動キャリブレーション**: 端末の画面比率（16:9 / 18:9 / 19.5:9 / 20:9 など）を自動検出してトリミング枠を最適化。
- **対戦相手名プレビュー照合**: OCR結果の確認用にトリミング元画像を並べて表示し、登録確認が容易。

### 2. 戦績ダッシュボード＆スマート絞り込み (Analytics & Fast Filter)
- **統計ダッシュボード**: 総対戦数、勝率、勝敗比（Win/Lose）をリアルタイム自動集計。
- **高速ページング（無限スクロール）**: 大量の対戦履歴（数百〜数千件）でも初期描画0ms、スクロールに合わせて30件ずつスムーズに追加描画。
- **多角的フィルタリング**:
  - **ひらがな・カタカナ相互あいまい検索**: 相手指揮官名がカタカナ（例: アザミ）でもひらがな（例: あざみ）で検索可能。生徒名も同様に双方向一致。
  - 相手指揮官名、編成生徒名でのフリーワード検索。
  - アイコンタップによる特定生徒の配置位置（A1〜A4, Sp5/6）でのワンタップ絞り込み。
  - 統計ダッシュボードタップでフィルター即時解除。

### 3. 生徒名簿管理＆学習機能 (Roster & Learning)
- **生徒名簿辞書**: ふりがな・略称・別衣装生徒に対応したロスター辞書を内蔵。
- **学習機能（ヒューマン・イン・ザ・ループ）**: 認識されなかった生徒や誤認識を手動修正すると、その生徒の新しい顔特徴データを自動蓄積し、次回以降の認識精度が向上。
- **相手名リネーム辞書**: OCRの誤読しやすい文字や愛称を自動変換するリネーム辞書機能。

### 4. 完全ローカル・オフライン対応 (Privacy-First Architecture)
- **外部通信なし**: 解析・画像処理・データベース保存のすべて端末内（IndexedDB / Canvas API / ローカルTesseract）で完結します。
- **個人情報ゼロ**: APIキー、ユーザー登録、ID、パスワード等の機密情報は一切不要かつ保持しません。
- **データバックアップ・復元**: JSON形式でいつでも戦績・名簿・設定をエクスポート／インポート可能。Android端末の「ダウンロード」フォルダへ直接保存できます。

---

## 📱 インストールと利用方法

### 方式A. Android アプリを直接インストールして使う (推奨)
本リポジトリ内のビルド済み APK ファイルをダウンロードし、Android 端末にインストールしてください。

<p align="left">
  <a href="https://github.com/roundabout-oxygen/Tactic_Archive/raw/main/release/TacticalArchive.apk">
    <img src="https://img.shields.io/badge/⬇️_APKを直接ダウンロード-TacticalArchive.apk-00A3FF?style=for-the-badge&logo=android&logoColor=white" alt="APK直接ダウンロード" height="38">
  </a>
</p>

- **直接ダウンロードリンク**: [**`TacticalArchive.apk` (v1.1.16) をダウンロード**](https://github.com/roundabout-oxygen/Tactic_Archive/raw/main/release/TacticalArchive.apk)  
  *(※上記ボタンまたはリンクをタップすると、プレビュー画面を挟まずに即座に APK ファイルのダウンロードが開始されます)*
- **対応OS**: Android 7.0 (API レベル 24) 以上

### 方式B. ソースコードからビルドする (Android Studio)
1. 本リポジトリをクローンまたはダウンロードします。
   ```bash
   git clone https://github.com/roundabout-oxygen/Tactic_Archive.git
   ```
2. Android Studio を起動し、本フォルダを開きます（`File -> Open`）。
3. Gradle の同期が完了したら、`Run` または以下のコマンドでビルドします。
   ```bash
   ./gradlew assembleDebug
   ```
   ビルドされた APK は `app/build/outputs/apk/debug/app-debug.apk` に生成されます。

---

## 🛠 技術スタック

- **Android Platform**: Kotlin, Jetpack Compose, Android WebView (JavaScript Interface), MediaStore API
- **UI & Processing**: HTML5 Canvas 2D, Modern CSS, Vanilla JavaScript (ES6+)
- **Storage**: IndexedDB (完全ローカルクライアントストレージ)
- **Image Processing**: Zero-mean Normalized Cross-Correlation (ZNCC)
- **OCR Engine**: Tesseract.js (On-device OCR)

---

## 🔒 セキュリティおよびプライバシーポリシー

- 本リポジトリのソースコードには、外部通信用 API キー、認証トークン、アカウントID、パスワード、個人を特定できる情報（個人名・機密情報）は一切含まれていません。
- アプリケーション動作中も外部サーバーへのアクセスやトラッキング、テレメトリ収集は一切行われません。

---

## ⚖️ 免責事項 (Disclaimer)

- 本ソフトウェアは、ファンによって制作された非公式の戦績管理補助ツールです。
- 『ブルーアーカイブ（Blue Archive）』の著作権、商標権、キャラクター、画像、ロゴ等のすべての知的財産権は、NEXON Games、株式会社Yostar、および各権利所有者に帰属します。
- 本ソフトウェアの使用によって生じたいかなる損害についても、作者は責任を負いません。

---

## 📄 ライセンス

本プロジェクトは [MIT License](LICENSE) のもとで公開されています。
