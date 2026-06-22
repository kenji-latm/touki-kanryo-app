# 登記完了予定日アプリ（PWA）

申請日を入力すると、**東京法務局・不動産（権利）登記／商業・法人登記**の完了予定日を自動表示し、案件を一覧管理するPWA。
完了予定日を過ぎた案件だけ、一覧と画面上部に控えめな超過表示が出る。

## いまの状態：Phase 2a（自動更新・PWA公開）

- `file://` で直接開いて動く（ローカルサーバー不要）
- GitHub Pages では起動時に最新の `kanryo.json` を取得
- GitHub Actions が毎日、法務局サイトからデータを自動更新
- オフライン時や取得失敗時は端末内の同梱データを使用
- 通知は未実装。「アプリを開くと完了見込みが色付き」まで

## 使い方（Windowsで見た目確認）

1. エクスプローラで `touki-kanryo-app/app/index.html` をダブルクリック（ブラウザで開く）
2. 登記種別・管轄・申請日を選ぶと完了予定日がプレビュー表示
3. 「追加する」で案件を保存（端末のlocalStorageに保存。サーバーに送信しない）

## フォルダ構成

```
touki-kanryo-app/
├─ app/                  PWA本体（これを配布する）
│  ├─ index.html
│  ├─ styles.css
│  ├─ app.js            画面・案件管理・完了予定日lookup
│  ├─ sw.js             オフライン用（http(s)配信時のみ有効）
│  ├─ manifest.webmanifest
│  ├─ icon.svg
│  └─ data/
│     ├─ kanryo.json    取得データ（人間確認用）
│     └─ kanryo.js      同じ内容のJS版（file://で読むのはこちら）
└─ scraper/
   └─ scrape.mjs        法務局サイト→ kanryo.json / kanryo.js を生成
```

## データ更新

```
node scraper/scrape.mjs
```

東京法務局の完了予定日ページから不動産（権利）と商業・法人の列を取得し、
`登記種別 → 庁 → 申請日 → 完了予定日` を `app/data/` へ書き出す。
法務局は直近数か月分しか掲載しないため、定期的に再実行して差し替える。

GitHub上では `.github/workflows/pages.yml` が毎日自動実行し、変更があれば
`app/data/kanryo.json` と `app/data/kanryo.js` をコミットしてPagesへ公開する。

- 出典：https://houmukyoku.moj.go.jp/tokyo/category_00019.html
- AM/PMは区別せず、同一申請日の遅い方の完了予定日を採用
- 不動産（表示）登記は対象外

## 設計判断（合意済み）

- 形態：PWA（Mac不要・App Store不要・月額0円）
- 対象：東京法務局・不動産（権利）登記／商業・法人登記、管轄は選択式
- 完了予定日：申請日から自動算出（カメラ読取は将来構想）
- 「過ぎたら」基準：完了予定日の**翌日**（当日は通常表示）
- データ置き場：端末内のみ。ラベルは自由記述。サーバーに依頼者情報を出さない

## Phase 2

### 2a（実装済み）

- GitHub Actions で日次スクレイピング → 最新データを自動配信
- GitHub Pages のHTTPS配信 → iPhoneの「ホーム画面に追加」で常用

### 2b（次の予定）

- Cloudflare（Workers・KV・無料枠）＋ Web Push（VAPID）で当日通知
  - 通知本文は汎用文（依頼者情報はサーバーに送らない＝守秘義務）

## Phase 3（構想）

- 受付のお知らせをカメラ撮影 → OCR で申請日を自動入力
```
