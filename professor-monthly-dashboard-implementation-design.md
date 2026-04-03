# 教授向け月次共有ダッシュボード 実装前設計書

本書は `professor-monthly-dashboard-design.md` を実装レベルに落とし込んだ設計書です。  
対象は GAS（`gas/attendance.gs`）と Google スプレッドシート構成です。

---

## 1. 目的とスコープ

## 1.1 目的

- 教授が月 1 回（**月末締め・翌月初共有**）で進捗を把握できるダッシュボードを提供する。
- 判定ルールは学期単位で固定:  
  `学期週平均 = 学期累計在室時間 / 大学公式週数N`  
  `学期週平均 >= 15` で合格。

## 1.2 スコープ

- 既存データ（`attendance_log`, `session_log`, `user_master`）を利用し、教授向けシートを追加・更新する。
- 学期設定（前期/後期、期間、公式週数）は `00_config` で管理する。
- 自動補正由来の時間は教授向け指標に含めない。

## 1.3 非スコープ

- 途中配属・途中離脱の個別ルール
- 学生向け詳細フィードバックUI
- 厳密な勤務評価ロジック（遅れ閾値等）

---

## 2. 用語定義

- **基準日**: 月末日。月次集計はこの日 23:59:59 JST 時点で確定。
- **公式週数 N**: 大学が学期ごとに定める週数（毎年更新）。
- **経過公式週数 k**: 学期開始から基準日までに対応する経過週数（`k <= N`）。
- **実打刻時間**: 自動補正でない `session_log` の `duration_hours` 合計。

---

## 3. シート構成

## 3.1 利用シート

- `00_config`（新規）
- `10_professor_monthly`（新規）
- `11_snapshot_YYYYMM`（運用時に月次で作成、任意）
- `user_master`（既存）
- `attendance_log`（既存）
- `session_log`（既存）
- `summary_semester`（既存、補助利用）

## 3.2 `00_config` レイアウト（推奨）

| セル | 項目 | 例 |
|------|------|----|
| B2 | 年度 | 2026 |
| B3 | 集計対象学期 | 前期 / 後期 |
| B4 | 前期開始日 | 2026-04-01 |
| B5 | 前期終了日 | 2026-09-30 |
| B6 | 前期公式週数N | 14 |
| B7 | 後期開始日 | 2026-10-01 |
| B8 | 後期終了日 | 2027-03-31 |
| B9 | 後期公式週数N | 14 |
| B10 | 目標週平均時間 | 15 |
| B11 | 週開始曜日 | MON |
| B12 | 基準日（月末） | 2026-05-31 |
| B13 | k上書き（任意） | 空欄 or 数値 |

補助セル（式で算出）:

- B15: 対象学期開始日（B3に応じて B4/B7）
- B16: 対象学期終了日（B3に応じて B5/B8）
- B17: 対象学期公式週数 N（B3に応じて B6/B9）
- B18: 経過公式週数 k（自動算出。B13 が入力されていれば B13 優先）

---

## 4. 集計仕様（教授向け）

## 4.1 集計対象ユーザー

- `user_master` の `active != FALSE` を対象とする。
- 氏名表示は `user_master.display_name` を正とする。

## 4.2 集計対象時間

- `session_log` の以下条件を満たす行を対象:
  - `in_at` が対象学期開始日以上
  - `in_at` が基準日以下
  - `is_auto_fixed = FALSE`（自動補正除外）
- `duration_hours` をユーザー単位で合計し、`累計在室時間(h)` とする。

## 4.3 指標定義

ユーザー i の累計在室時間を `H_i` とする。

- 経過週平均（h/週）  
  `P_i = IF(k>0, H_i / k, 0)`
- 学期目標総時間（h）  
  `T = 目標週平均時間(=15) * N`
- 達成率（%）  
  `R_i = IF(T>0, H_i / T * 100, 0)`
- 学期基準週平均見込み（任意）  
  `S_i = IF(N>0, H_i / N, 0)`

---

## 5. `10_professor_monthly` レイアウト

## 5.1 ヘッダ領域

- A1: タイトル（例: `前期 進捗レポート（教授向け）`）
- A2: 集計基準日（`00_config!B12` 参照）
- A3: 学期期間（`00_config!B15:B16`）
- A4: 公式週数 N、目標 15h/週（`00_config!B17`, `B10`）
- A5: 注記「自動補正時間は指標計算に含めない」

## 5.2 サマリ領域（例: A7:D10）

- 対象者数
- 累計在室時間（全体合計）
- 平均達成率（任意）

## 5.3 個票テーブル（例: A12 以降）

| 列 | 項目 |
|----|------|
| A | No. |
| B | 氏名 |
| C | user_id |
| D | 累計在室時間(h) |
| E | 経過公式週数(k) |
| F | 経過週平均(h/週) |
| G | 学期公式週数(N) |
| H | 学期目標総時間(h) |
| I | 達成率(%) |
| J | 学期基準週平均見込み(h/週, 任意) |

表示ルール:

- 並び順は `D` 降順（累計在室時間順）を推奨。
- 「遅れ」「要注意」などの閾値列は作成しない。

---

## 6. グラフ仕様

## 6.1 グラフ1（必須）

- 種別: 棒グラフ
- データ: `B(氏名)` × `D(累計在室時間)`
- 目的: 月次時点での個人差把握

## 6.2 グラフ2（推奨）

- 種別: 折れ線
- データ候補:
  - 研究室平均達成率（当月）
  - または研究室平均 `S_i`（学期基準週平均見込み）
- 補助線:
  - 達成率なら 100%
  - 週平均見込みなら 15h

---

## 7. GAS改修方針

## 7.1 改修対象

- `gas/attendance.gs` に教授向け関数群を追加済み（`bootstrapProfessorDashboard` 等）。`setupAnalyticsSheets()` は既存の `summary_semester` / `dashboard` 用として維持し、教授向けは別関数で実行する。
- 既存 `rebuildSessionLog()` は継続利用。教授向け計算では `is_auto_fixed` 除外を厳守。

## 7.2 実装方針

- 既存シートがある場合は上書き範囲を限定（ヘッダ・式のみ）。
- 月次スナップショットは GAS関数（例: `createMonthlySnapshot()`）で将来的に自動化可能な構成にする。

## 7.3 互換性・安全性

- `user_master` の列順は既存仕様（`user_id`, `display_name`, `active`）を前提に参照。
- シート未存在時は作成、存在時は壊さない（idempotent）を基本方針とする。

---

## 8. 運用フロー

1. 月末: 打刻が揃った後に `rebuildSessionLog()` 実行
2. `setupAnalyticsSheets()`（または教授向け更新関数）実行
3. `10_professor_monthly` の数値・グラフ確認
4. 翌月初: 教授へシート共有
5. 必要に応じて `11_snapshot_YYYYMM` を作成し履歴保存

---

## 9. 受入基準（UAT）

- `00_config` の学期切替で、`10_professor_monthly` の集計期間と N が切り替わる
- 集計対象が `user_master.active` のみになる
- 自動補正セッション（`is_auto_fixed=TRUE`）が D/F/I/J へ反映されない
- 基準日を変更すると D/F/I/J が再計算される
- 棒グラフと折れ線が当月データを指している

---

## 10. リスクと対策

- **大学週数と自動算出kのズレ**  
  -> `00_config!B13` で k 上書きを許可
- **シート手編集による式破損**  
  -> ヘッダと計算列を保護範囲化
- **月次共有時の再現性不足**  
  -> スナップショットシートを月次で保存

---

## 11. 実装順序

1. `00_config` 追加と参照セル確定
2. `10_professor_monthly` テーブル生成
3. 数式投入（D〜J）
4. グラフ定義
5. 試験データで月次フロー検証
6. ドキュメント更新（運用手順）

---

## 12. GAS 関数 API 仕様（入出力・エラー）

実装は `gas/attendance.gs` を参照。以下は契約（Contract）の要約である。

### 12.1 定数（シート名）

| 名前 | 値 |
|------|-----|
| `CONFIG_SHEET_NAME` | `00_config` |
| `PROFESSOR_SHEET_NAME` | `10_professor_monthly` |
| `MONTHLY_HISTORY_SHEET` | `12_monthly_history` |

### 12.2 `bootstrapProfessorDashboard()`

| 項目 | 内容 |
|------|------|
| 引数 | なし |
| 戻り値 | `{ ok: boolean, error_code?: string, message?: string, warnings?: string[] }` |
| 成功時 | `ok: true`。`user_master` / `session_log` 未検出時は `warnings` に文字列を追加 |
| 失敗時 | `ok: false`, `error_code: "BOOTSTRAP_ERROR"`, `message` に例外文字列 |
| 副作用 | `00_config` の A1:B18 を再書き込み（ラベル・初期値・B15:B17 の数式）。`10_professor_monthly` の見出し行（12行目）。`12_monthly_history` のヘッダが空なら1行目を設定 |

### 12.3 `refreshProfessorMonthlyView()`

| 項目 | 内容 |
|------|------|
| 引数 | なし |
| 戻り値 | 成功: `{ ok: true, row_count, k, N }` / 失敗: `{ ok: false, error_code, message }` |
| `error_code` | `MISSING_CONFIG`（`00_config` なし）, `INVALID_CONFIG_DATE`（日付不備）, `INVALID_N`, `NO_ACTIVE_USERS`, `REFRESH_ERROR` |
| 集計ルール | `user_master` の `active !== FALSE` のみ。`session_log` で `is_auto_fixed` が真の行は除外。`in_at` は学期開始日以上かつ `min(基準日, 学期終了日)` 以下（日付文字列 YMD 比較） |
| 副作用 | `10_professor_monthly` の A1:B9・表 13 行目以降を更新。`00_config!B18` に実効 `k` を書き込み。`12_monthly_history` に当月 `yyyyMM` 行を upsert。棒グラフ「累計在室（ユーザー別）」を差し替え |

### 12.4 `runMonthlyClose(opt)`

| 項目 | 内容 |
|------|------|
| 引数 | `opt?: { snapshot?: boolean }`。省略時 `snapshot` は `true` 相当 |
| 戻り値 | 成功: `{ ok: true, refreshed, snapshot }` / 途中失敗は各子処理の戻り値をそのまま返す |
| 処理順 | `rebuildSessionLog()` → `refreshProfessorMonthlyView()` →（既定）`createMonthlySnapshot()` |
| `opt.snapshot === false` | スナップショット作成を省略 |

### 12.5 `createMonthlySnapshot()`

| 項目 | 内容 |
|------|------|
| 引数 | なし（基準日は `00_config!B12` から取得） |
| 戻り値 | 成功: `{ ok: true, sheet_name }` / 失敗: `MISSING_CONFIG`, `INVALID_*`, `MISSING_SHEET`, `SNAPSHOT_ERROR` |
| 副作用 | `11_snapshot_yyyyMM` を作成（同名があれば削除後に再作成）。内容は `10_professor_monthly` のコピーを値化したもの |

### 12.6 補助関数（外部から呼ばない想定）

- `readProfessorConfig_`, `loadActiveUsersFromMaster_`, `aggregateSessionHoursForProfessor_`, `computeElapsedWeekCountJst_`, `appendMonthlyHistoryRow_`, `refreshProfessorBarChart_` など

### 12.7 運用上の初回手順

1. スプレッドシートにスクリプトを紐づけ、`bootstrapProfessorDashboard()` を1回実行  
2. `00_config` の B4〜B9・B12 を年度に合わせて入力（日付はセルの日付型推奨）  
3. 月末運用で `runMonthlyClose()` を実行（または `snapshot: false` で試行）

