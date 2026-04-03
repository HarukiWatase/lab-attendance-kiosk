# 教授向けダッシュボード 仕様まとめ・運用マニュアル

本書は、フロント改修前に現行仕様を固定し、運用担当が迷わず回せるようにするための資料です。  
対象は Google Apps Script（`gas/attendance.gs`）とスプレッドシート運用です。

---

## 1. 目的と前提

- 学期判定ルール: **学期週平均 >= 15h で合格**
- 分母: **大学が定める公式週数 N**
- 月次共有: **毎月頭に、先月末基準で教授へ共有**
- 教授向け指標では、**自動補正セッション（`is_auto_fixed=TRUE`）を除外**

---

## 2. システム構成（教授向け分析）

- データ入力元: `attendance_log`
- セッション化: `session_log`（`rebuildSessionLog()`）
- 設定シート: `00_config`
- 教授向け表示: `10_professor_monthly`
- 月次履歴: `12_monthly_history`
- 月次スナップショット: `11_snapshot_YYYYMM`
- ユーザー名マスタ: `user_master`（`user_id`, `display_name`, `active`）

---

## 3. 指標仕様（教授向け）

ユーザー i の学期内累計在室時間（自動補正除外）を `H_i` とする。

- 経過週平均（h/週）: `P_i = H_i / k`
- 学期目標総時間（h）: `T = 15 * N`
- 達成率（%）: `R_i = H_i / T * 100`
- 学期基準週平均見込み（任意）: `S_i = H_i / N`

補足:
- `k` は経過公式週数（`00_config` の自動算出。必要時は上書き可）
- `N` は対象学期の公式週数（大学基準）

---

## 4. `00_config` 入力ルール

最低限入力するセル:

- `B3`: 集計対象学期（`前期` / `後期`）
- `B4:B9`: 前期・後期の開始日/終了日/公式週数
- `B10`: 目標週平均時間（通常 15）
- `B12`: 基準日（共有対象月の月末日）
- `B13`: k上書き（通常は空欄）

注意:
- 日付セルは**日付型**で入力する（文字列は不可）
- 実在しない日付（例: 4/31）は不可

---

## 5. GAS関数一覧（運用で使うもの）

初期構築:

- `bootstrapProfessorDashboard()`
  - `00_config` / `10_professor_monthly` / `12_monthly_history` を準備

日次・月次運用:

- `rebuildSessionLog()`
  - `attendance_log` -> `session_log` を再構築
- `refreshProfessorMonthlyView()`
  - 教授向け表・サマリ・グラフを更新
- `runMonthlyClose(opt)`
  - `rebuildSessionLog` -> `refreshProfessorMonthlyView` ->（既定）`createMonthlySnapshot`
- `createMonthlySnapshot()`
  - `11_snapshot_YYYYMM` を作成（値固定）

トリガー自動化:

- `installAutomationTriggers()`
  - 日次 `runAutoFixBatch`（毎日5時）
  - 月次 `runMonthlyCloseForPreviousMonth`（毎月1日7時）
- `listAutomationTriggers()`
  - 現在のトリガー一覧確認
- `removeAutomationTriggers()`
  - 自動化トリガーの削除

---

## 6. 月次運用マニュアル（手動運用）

### 6.1 月初の実行手順

1. `00_config!B12` を先月末日に更新
2. `runMonthlyClose()` 実行
3. `10_professor_monthly` を確認
4. `11_snapshot_YYYYMM` が作成されたことを確認
5. 教授へ共有

### 6.2 確認ポイント

- `10_professor_monthly`
  - A1〜A5 にヘッダ情報が出ている
  - A12:J12 に列見出し
  - 13行目以降に対象者行が出る
- グラフ
  - 棒グラフ: 累計在室（ユーザー別）
  - 折れ線: 平均達成率の月次推移
- `12_monthly_history`
  - 当月 `yyyyMM` の行が更新/追記される

---

## 7. 自動運用マニュアル（推奨）

### 7.1 初回のみ

1. `installAutomationTriggers()` 実行
2. `listAutomationTriggers()` で登録確認

### 7.2 動作

- 毎月1日 7:00 に `runMonthlyCloseForPreviousMonth()` が実行
  - `B12` を先月末へ自動設定
  - 月次締め処理を実行

---

## 8. トラブルシュート

### 症状: `refreshProfessorMonthlyView()` が完了表示だが表が更新されない

確認順:

1. `00_config` の日付セルが日付型か（`B4,B5,B7,B8,B12`）
2. `B12` が実在する日付か
3. `user_master` の1〜3列が `user_id/display_name/active` か
4. `active=TRUE` のユーザーがいるか
5. `rebuildSessionLog()` を先に実行したか

### 症状: データ行がゼロ

- `user_master` の active フラグ確認
- 学期期間と基準日の範囲確認
- `session_log` の `is_auto_fixed` 除外で実データが0になっていないか確認

---

## 9. 共有時の推奨ルール

- 教授向け正式値は `10_professor_monthly`（または `11_snapshot_YYYYMM`）を正とする
- フロント分析は補助表示として扱う（正式月次レポート用途はスプシ）
- 月次共有前に、必ずスナップショットを1枚残す

---

## 10. 次フェーズ（フロント改修前提）

- フロント分析を教授向け定義（達成率・経過週平均）に合わせる
- API で `10_professor_monthly` 相当の指標を直接返す設計を検討
- 教授向け表示とフロント表示の用語・定義を統一

