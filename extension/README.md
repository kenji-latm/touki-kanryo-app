# 登記完了予定日 Chrome拡張版

案件保存あり・事務所共有なしのChrome拡張版です。

## 位置づけ

- Chrome右上の拡張機能アイコンから小さく開き、必要に応じて「大きく開く」で新しいタブ表示
- 案件メモは、そのChrome拡張の中だけに保存
- 事務所共有DB・Supabaseへは送信しない
- 完了予定日の最新データは `https://tools.ishimoto-legal.com/data/kanryo.json` を読み込み
- ネットワーク取得に失敗した場合は、拡張機能に同梱したデータを使う

## 開発・配布用ファイル生成

リポジトリ直下で実行します。

```bash
npm run build:extension
```

生成物:

- `dist/chrome-extension/`
  Chromeの「パッケージ化されていない拡張機能を読み込む」で指定するフォルダ
- `dist/登記完了予定日Chrome拡張.zip`
  テスター配布用Zip

## ローカル確認手順

1. Chromeで `chrome://extensions/` を開く
2. 右上の「デベロッパー モード」をオン
3. 「パッケージ化されていない拡張機能を読み込む」を押す
4. `dist/chrome-extension/` を選ぶ
5. Chrome右上の拡張機能アイコンから「登記完了予定日」を開く
