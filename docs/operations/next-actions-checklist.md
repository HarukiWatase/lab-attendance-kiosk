# 次アクション実行チェックリスト（週平均15時間運用）

このチェックリストは、現状の実装から運用分析フェーズに進むための実行順リストです。  
上から順に実施してください。

---

## 1. `user_master` 作成（最優先）

- [ ] スプレッドシートに `user_master` シートを作成
- [ ] ヘッダを設定: `user_id, display_name, active, grade, team, start_date, end_date, note`
- [ ] 現在の全メンバーを登録（`active=TRUE`）
- [ ] `attendance_log` の `user_id` と突合し、未登録IDを0件にする

成果物:
- `user_master` シート完成

---

## 2. 名前表示の結合列を作成

- [ ] `attendance_log` の右側に `display_name` 補助列を追加（任意）
- [ ] `VLOOKUP` または `XLOOKUP` で氏名参照を設定
- [ ] 未登録時の表示を `"未登録"` に統一

成果物:
- IDだけでなく名前で履歴確認可能

---

## 3. `session_log` 作成（集計の土台）

- [ ] `session_log` シートを作成
- [ ] ヘッダを設定: `user_id, in_at, out_at, duration_hours, is_auto_fixed, week_start`
- [ ] `attendance_log` から `出勤` と `退勤` をペア化する処理を整備
- [ ] 負値/不整合レコードを除外するルールを適用

成果物:
- 1行=1セッション形式の正規化テーブル

---

## 4. 週次・前期集計テーブル作成

- [ ] `summary_weekly` シートを作成
- [ ] 列: `week_start, user_id, weekly_hours, target_hours, gap_hours, achievement_rate, auto_fix_ratio`
- [ ] `summary_semester` シートを作成
- [ ] 列: `user_id, semester_weekly_avg_hours, target_hours, gap_hours, achievement_rate`
- [ ] `target_hours=15` を固定

成果物:
- 週次と前期平均が算出された集計テーブル

---

## 5. 集計の確認（最小構成）

- [ ] `summary_semester` が `setupAnalyticsSheets()` で意図どおり更新されている
- [ ] 達成/注意/要改善（`status` 列）の人数感が妥当か確認
- [ ] （任意）`summary_semester` 上で棒グラフ・条件付き書式を追加

成果物:
- 目標達成状況を `summary_semester` で把握できる状態

---

## 6. 運用ルール固定

- [ ] 判定閾値を明文化
  - 達成: `>=15`
  - 注意: `12〜15`
  - 要改善: `<12`
- [ ] 週次レビュー運用を決定（例: 毎週月曜朝）
- [ ] 自動補正比率の許容上限を決定（例: 20%未満）

成果物:
- チームで同じ基準で評価できる状態

---

## 7. フロント再利用に向けた準備（次段階）

- [ ] APIレスポンス形式を確定（`weekly`, `semester`）
- [ ] グラフコンポーネント設計（`TargetBarChart`, `WeeklyTrendLine`）
- [ ] UIテーマ（RPG風）と分析画面の配色ルールを統一

成果物:
- スプレッドシート実績をフロントへ移植可能な設計

---

## 8. 完了判定

- [ ] `user_master` 未登録ID 0件
- [ ] `summary_weekly` / `summary_semester` 更新可能
- [ ] 週平均15h達成状況がダッシュボードで確認可能
- [ ] 週次運用フローが回り始めている
