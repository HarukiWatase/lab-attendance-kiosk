# `user_id` と氏名の紐づけガイド

本書は、勤怠システムにおける `user_id` と氏名（表示名）の紐づけ方法を定義する。  
方針は、**打刻ログと個人情報を分離し、`user_master` を参照して結合する方式**とする。

---

## 1. 基本方針

- 打刻データ（`attendance_log`）は `user_id` を主キーとして記録する
- 氏名は打刻時に直接書き込まず、別シート `user_master` で管理する
- 表示・集計時に `user_id` をキーに氏名を参照する

この方式により、氏名変更（改姓・表記ゆれ）時もマスタ更新のみで全画面に反映できる。

---

## 2. シート構成

## 2-1. `attendance_log`（既存）

- `timestamp`
- `user_id`
- `action`
- `source`
- `request_id`
- `note`

## 2-2. `user_master`（新規）

必須列（推奨順）:

1. `user_id`（主キー、重複禁止）
2. `display_name`（氏名）
3. `active`（`TRUE`/`FALSE`）

任意列:

4. `grade`
5. `team`
6. `start_date`
7. `end_date`
8. `note`

---

## 3. 紐づけルール

- `attendance_log.user_id` と `user_master.user_id` を結合キーにする
- 一致しない `user_id` は「未登録ユーザー」として扱う
- `active=FALSE` のユーザーは運用ルールに応じて表示除外または警告表示

---

## 4. スプレッドシートでの参照例

## 4-1. `VLOOKUP` 例

`attendance_log` の `user_id`（例: B列）から氏名を引く:

```excel
=IFERROR(VLOOKUP(B2, user_master!A:B, 2, FALSE), "未登録")
```

## 4-2. `XLOOKUP` 例（利用可能な場合）

```excel
=IFERROR(XLOOKUP(B2, user_master!A:A, user_master!B:B), "未登録")
```

---

## 5. 運用ルール

- 新メンバー追加時:
  - `user_master` に `user_id` と `display_name` を先に登録
- 退室・卒業時:
  - `active=FALSE` に変更（ログは削除しない）
- 氏名変更時:
  - `display_name` のみ更新
- `user_id` の再利用は禁止（履歴混在防止）

---

## 6. QRコードとの関係

- QRコードには原則 `user_id` のみを埋め込む
- 氏名はサーバー側・表示側でマスタ参照して解決する
- QRに氏名を含めないことで、個人情報の露出を抑えられる

---

## 7. API拡張（将来）

将来的に閲覧APIを作る場合は、レスポンスに `display_name` を付与する。

例:

```json
{
  "user_id": "A12345",
  "display_name": "山田 太郎",
  "action": "出勤",
  "timestamp": "2026-04-01T09:00:00+09:00"
}
```

---

## 8. 監査・品質チェック

- `user_master.user_id` 重複チェック（定期）
- `attendance_log` に存在するが `user_master` に存在しない `user_id` の検出
- `active=FALSE` ユーザーの打刻が発生していないか確認

---

## 9. まとめ

- `attendance_log` は事実データ（ID中心）
- `user_master` は属性データ（氏名など）
- 表示時に結合することで、保守性・拡張性・個人情報保護のバランスを取る
