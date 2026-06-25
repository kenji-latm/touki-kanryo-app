# 事務所共有モードの設定手順

このアプリは、何も設定しなければ今までどおり「この端末だけ」に案件を保存します。
事務所内で先生・事務員さんが同じ案件一覧を見る場合だけ、Supabaseを設定します。

## できること

- 案件名、法務局、管轄、登記種別、申請日、登記完了予定日を事務所内で共有
- 完了／未完了の状態を共有
- 予定日超過アラートを事務所共有案件に対して表示
- 事務所ごとにデータを分離

## 重要な前提

案件名には依頼者名や会社名が入る可能性があります。
そのため、Supabase側では必ずRLS（行単位セキュリティ）を有効にします。
アプリ側の anon key は公開されてもよいキーですが、RLSなしで使ってはいけません。

## 手順

1. Supabaseで新しいプロジェクトを作成
2. SQL Editorで `supabase/shared-office-schema.sql` の中身を実行
3. Authentication > Users で先生・事務員さんのログインユーザーを作成
4. SQL Editorで事務所を作成

```sql
insert into public.offices (name)
values ('○○司法書士事務所')
returning id;
```

5. 返ってきた `id` と、Users画面のユーザーUUIDを使ってメンバーを紐づけ

```sql
insert into public.office_members (office_id, user_id, role, display_name)
values
  ('事務所ID', '先生のユーザーUUID', 'owner', '先生'),
  ('事務所ID', '事務員さんのユーザーUUID', 'member', '事務員さん');
```

6. Supabase Project Settings > API で次の2つを確認

- Project URL
- anon public key

7. `app/shared-config.js` を編集

```js
window.TOUKI_SHARED_CONFIG = {
  enabled: true,
  supabaseUrl: "https://xxxxxxxx.supabase.co",
  supabaseAnonKey: "取得したanon public key",
};
```

8. チーム利用者には通常URLではなく、末尾に `?team=office` を付けたチーム用URLを案内
9. チーム用URLで開くと「保存先」が表示されるので、「事務所共有」を選び、メールアドレス・パスワードでログイン

## 運用メモ

- 通常URLでは「保存先」は表示されません。チーム用URL `?team=office` で開いた端末だけ表示されます。
- 一度チーム用URLで開いた端末では、次回以降も保存先パネルを表示します。
- 共有モードに切り替えるまでは、既存の保存案件は端末内に残ります。
- 端末内の案件と事務所共有案件は別管理です。
- 退職者・外部者を外す場合は、SupabaseのAuthenticationでユーザーを削除または無効化し、`office_members` からも削除します。
- GitHub Pagesにはアプリ本体だけを置きます。案件データはSupabaseに保存します。