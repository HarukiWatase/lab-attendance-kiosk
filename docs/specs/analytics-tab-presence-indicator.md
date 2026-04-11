# 分析タブ：在室マーク表示 — 仕様・設計

## 1. 目的

運用ディスプレイの**分析タブ**において、研究室に**在室している可能性が高い**メンバーを一目で区別できるようにする。  
**在室と判定されたユーザーのみ**、ユーザー別一覧の**表示名の右**に在室マークを表示する。非在室のユーザーに「不在」等のラベルは付けない。

本書は実装の受け入れ条件とデータ・API の契約を定義する。実装は `frontend`・`backend`・`gas` の変更が前提となる。

---

## 2. 用語

| 用語 | 意味 |
|------|------|
| 在室 | 本システムの打刻ログ上、そのユーザの**直近の打刻種別が未退勤の出勤**である状態（詳細は次節）。 |
| 在室マーク | 在室と判定された行のみ、表示名の右に表示する短い視覚的記号またはテキスト（UI 仕様は [display-ui-spec.md](./display-ui-spec.md) を参照）。 |

学籍上の「在籍」とは別概念である。

---

## 3. 在室の判定ルール（業務定義）

### 3.1 データの正

- **正**: スプレッドシートの **`attendance_log`**（列: `timestamp`, `user_id`, `action`, …）。
- **`session_log` は使わない**（`rebuildSessionLog` は退勤が確定したセッションを行として出力するため、**未退勤の「開いたセッション」は行として存在しない**）。

### 3.2 アルゴリズム（既定）

1. `user_id` ごとに、`attendance_log` のデータ行を **`timestamp` 昇順**とみなす。
2. 同一 `user_id` について、**時刻が最も新しい行**の `action` を `last_action` とする。
3. **`last_action` が `出勤` のとき、その `user_id` は在室**とする。それ以外（`退勤`, `退勤（自動補正）` 等）は在室としない。

### 3.3 境界・解釈

- **手編集・重複時刻**: 仕様上は「最終行の action」のみを正とする。運用で問題が出た場合はログ整備ルールを別途定める。
- **未登録ユーザ**: 分析一覧に載らない（現行どおり `user_master` の active のみ）ため、判定対象外でよい。
- **自動補正**: `退勤（自動補正）` は退勤系として扱い、**在室にしない**（`decideAction` と整合）。

---

## 4. 更新タイミングと性質

- **分析タブを開いたとき**（および現行実装どおり `GET /api/view/analytics/week-calendar` を実行したとき）、そのリクエスト処理中に **`attendance_log` を読み、上記ルールで在室フラグを算出**する。  
  → タブを開くたびに**その時点の最新**の在室状況が返ること。
- **WebSocket は使わない**。分析タブを**開いたまま滞在**している間に他端末で退勤が入っても、**追加の取得がない限り**マークは自動では更新されない。  
  滞在中の定期ポーリングが必要になった場合は**別要件**とする。

---

## 5. API 設計

### 5.1 エンドポイント

既存の **`GET /api/view/analytics/week-calendar`** の応答を拡張する（別エンドポイントに分けない。キオスクは1リクエストで週次＋在室を得る）。

### 5.2 応答スキーマ（案）

`items` の各要素にブールを追加する。

| フィールド | 型 | 説明 |
|------------|-----|------|
| `user_id` | string | 既存 |
| `display_name` | string | 既存 |
| `week_total_hours` | number | 既存 |
| `is_present` | boolean | **追加**。§3 のルールで在室なら `true`。 |

キー名は GAS・FastAPI・フロントで **スネーク `is_present` / キャメル `isPresent` の揺れ**を吸収する方針（既存の `week_total_hours` と同様）とする。

### 5.3 算出の実装場所

- **GAS**: `getWeeklyCalendarAnalyticsItems`（または共通ヘルパ）内で、`attendance_log` を走査し `user_id → last_action` を構築。週次 `items` の各 `user_id` に `is_present` を付与。
- **FastAPI**: `WeekCalendarRow` に `is_present: bool` を追加。GAS アイテムから `_week_calendar_row_from_gas_item` でマッピング。欠損時は `false`。
- **フロント**: `AnalyticsRow` に `isPresent` を保持し、表示名セル内で条件付きレンダリング。

### 5.4 算出の効率（実装）

アクティブユーザは ~14 名想定。`attendance_log` の **A:C を1回読み**、配列を**末尾から**走査する。対象 `user_id` それぞれについて**シート上で最も下にある行の `action` が初めて分かった時点で記録**し、対象全員分が揃ったら**ループを打ち切る**（推奨案）。

---

## 6. UI 設計（概要）

詳細なピクセル・タイポは [display-ui-spec.md](./display-ui-spec.md) に委ねる。

- **配置**: 「ユーザー」列のセル内で、`display_name` の直後（右隣）にマーク。既存の「ID」列は変更しない。
- **在室のみ表示**: `is_present === true` のときだけマーク。`false` のときは追加表示なし。
- **アクセシビリティ**: 色のみに依存しない（例: 記号＋ `aria-label` / 視認できる短いテキスト）。

---

## 7. 開発・モック

- `APP_ENV=dev` 等でバックエンドが週次応答をモックする場合、`items` に `is_present` の**真偽が混在する例**を含め、UI 確認ができるようにする。

---

## 8. 受け入れ基準（チェックリスト）

- [x] 分析タブ表示時の `week-calendar` 応答に、各ユーザー行に在室フラグが含まれる。
- [x] `attendance_log` の当該ユーザ最終行が `出勤` の行だけ、在室マークが表示される。
- [x] 最終行が `退勤` または `退勤（自動補正）` のユーザーにはマークが出ない。
- [x] 分析タブを閉じて再度開いたとき、**再取得後**のログに基づきマークが更新される。
- [x] 週次時間・並び順など既存の分析タブ挙動を壊さない。

---

## 9. 参照実装・関連文書

| 対象 | パス・備考 |
|------|------------|
| 分析 UI | `frontend/src/App.tsx` |
| 週次 API | `backend/app/main.py`（`WeekCalendarRow` / `analytics_week_calendar`） |
| 週次・ユーザマスタ | `gas/src/main.ts`（`getWeeklyCalendarAnalyticsItems`, `getUserDirectoryItems`, `rebuildSessionLog`, `decideAction`） |
| キオスク API 概要 | [frontend-kiosk-spec.md](./frontend-kiosk-spec.md) |
| ディスプレイ UI | [display-ui-spec.md](./display-ui-spec.md) |
