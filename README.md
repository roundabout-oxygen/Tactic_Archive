# Tactical Archive (タクティカル・アーカイブ)

『ブルーアーカイブ』戦術対抗戦で、**「この相手の防衛、前はどうやって抜いたっけ？」「そもそもこの人の編成思い出せない…」** を解消するための戦績記録・検索 Android アプリです。

対戦後のリザルト画面（スクショ）をまとめて放り込むだけで、生徒アイコンや対戦相手名を自動認識して端末内に記録します。

[![Version](https://img.shields.io/badge/Version-v1.2.0-blue.svg)](#)
[![Download APK](https://img.shields.io/badge/Download-APK-00A3FF?logo=android&logoColor=white)](https://github.com/roundabout-oxygen/Tactic_Archive/raw/main/release/TacticalArchive.apk)
[![Platform](https://img.shields.io/badge/Platform-Android-green.svg)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![note 解説記事](https://img.shields.io/badge/note-使い方・初期設定の解説-2cb69a?logo=note&logoColor=white)](https://note.com/glad_lilac3872/n/nb495e629f395)

> 📖 **詳しい使い方や初期設定手順は note でも解説しています**  
> 導入の流れや日々のルーティン、初期トリミング設定の手順などを分かりやすくまとめています。ぜひ合わせてご覧ください。  
> 👉 [**note解説記事: 戦術対抗戦の記録用Androidアプリを作成しました。**](https://note.com/glad_lilac3872/n/nb495e629f395)

---

## 📱 毎日の使い方（シンプルな3ステップ）

### 1. 対戦前：相手の名前で検索して過去の履歴をチェック
対戦相手の名前を入力するだけで、過去に戦った相手の防衛編成や「以前どの攻め編成で勝てたか」を瞬時に確認できます。  
*(※ひらがな・カタカナのどちらでも検索可能です)*

<p align="center">
  <img src="docs/images/history_search_anonymous.png" width="680" alt="戦績履歴・検索画面">
</p>

### 2. 対戦後：リザルトのスクショを撮っておく
5戦のチケットを消化しながら、勝敗が決まったリザルト画面（WINまたはLOSEの画面）のスクリーンショットを撮影しておきます。

### 3. まとめて取り込み（1〜2分で完了）
アプリの取り込み画面にスクショを一括で選択するだけで、生徒アイコンや相手の名前が自動で読み取られ、簡単に記録・蓄積できます。

<p align="center">
  <img src="docs/images/result_review_registration.png" width="680" alt="取り込み確認画面">
</p>

---

## ⚙️ 初回起動時の初期設定について

本アプリはプライバシー保護のため、**画像を外部サーバーへ送信せず端末内だけで画像解析・保存**を行います。  
そのため、お使いのスマートフォンの画面サイズに合わせて、最初に1枚だけリザルト画像を使い**アイコン枠を合わせる初期設定（トリミング位置の指定）**が必要です。

| 生徒アイコン枠 | 相手アイコン枠 | 相手の名前枠 |
|:---:|:---:|:---:|
| <img src="docs/images/setup_calibration_students.png" width="260" alt="生徒枠"> | <img src="docs/images/setup_calibration_opponent_icon.png" width="260" alt="相手アイコン枠"> | <img src="docs/images/setup_calibration_opponent_name.png" width="260" alt="相手名前枠"> |

※一度設定すれば端末内に保存されるため、2回目以降はこの設定は不要です。  
※枠合わせの詳しいコツや生徒の登録手順は [**noteの解説記事**](https://note.com/glad_lilac3872/n/nb495e629f395) に画像付きで分かりやすく掲載しています。

---

## 📥 アプリのインストール

Android端末のブラウザから下記リンクをタップして APK をダウンロードし、インストールしてください。

<p align="left">
  <a href="https://github.com/roundabout-oxygen/Tactic_Archive/raw/main/release/TacticalArchive.apk">
    <img src="https://img.shields.io/badge/⬇️_APKを直接ダウンロード-TacticalArchive.apk-00A3FF?style=for-the-badge&logo=android&logoColor=white" alt="APK直接ダウンロード" height="38">
  </a>
</p>

- **直接ダウンロード**: [**`TacticalArchive.apk` (v1.2.0) をダウンロード**](https://github.com/roundabout-oxygen/Tactic_Archive/raw/main/release/TacticalArchive.apk)
- **対応OS**: Android 7.0 以上
- **通信について**: 
  - アプリサイズを約13MBと軽量に保つため、**初回起動時のみ**文字認識用の日本語データ（約10〜15MB）を自動ダウンロードします。
  - 取得完了後はオフラインで動作し、対戦画像や戦績データが外部へ送信されることは一切ありません。

---

## 🔒 プライバシー・免責事項

- **完全ローカル管理**: 戦績データや画像は端末内のストレージ（IndexedDB）にのみ保存されます。アカウント登録や外部送信は一切ありません。
- **データバックアップ**: 設定画面からいつでも戦績データをJSONファイルとして「ダウンロード」フォルダに書き出し・復元できます（PC用CSV出力にも対応）。
- **免責事項**: 本アプリはファンによる非公式ツールです。『ブルーアーカイブ』の著作権・知的財産権は株式会社YostarおよびNEXON Gamesに帰属します。
