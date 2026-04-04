# 勤怠管理システム 運用・分析構想書（前期 週平均15時間目標）

本書は、現行の `attendance_log` データを使って、研究室運用（前期の週平均15時間目標）を可視化・分析するための方針をまとめたものです。  
目的は、**「誰が目標に近いか/離れているかを直感的に把握できること」** と、**将来フロントエンドUIに再利用しやすい形で指標を整理すること** です。

---

## 1. 運用前提

- 対象期間: 前期（開始日〜終了日を運用で定義）
- 目標: 各メンバーの **週平均在室時間 15時間**
- データソース: `attendance_log`
  - `timestamp`
  - `user_id`
  - `action`（`出勤` / `退勤` / `退勤（自動補正）`）
  - `source`（`scan` / `auto_fix`）
  - `request_id`
  - `note`

---

## 2. 主要KPI（最優先）

分析は以下のKPIを基準に行う。

1. `weekly_hours`  
   - 週ごとの在室時間（時間）
2. `semester_weekly_avg_hours`  
   - 前期全体の週平均在室時間（時間）
3. `target_gap_hours`  
   - `semester_weekly_avg_hours - 15`（目標との差）
4. `target_achievement_rate`  
   - `semester_weekly_avg_hours / 15 * 100`
5. `auto_fix_ratio`  
   - `退勤（自動補正）件数 / 全退勤件数`（データ信頼性の補助指標）

---

## 3. 在室時間の算出ルール

集計ブレを防ぐため、以下を固定ルールとする。

- 1セッション = `出勤` から次の `退勤`（または `退勤（自動補正）`）まで
- セッション時間 = `退勤時刻 - 出勤時刻`（分単位、最終的に時間換算）
- 異常データ（負値・不整合）は除外し、`note` に監査情報を残す
- 週の定義は JST 基準（月曜開始推奨）
- 自動補正データは時間算出に含めるが、別指標（`auto_fix_ratio`）で同時表示する

---

## 4. 可視化プラン（グラフ構成）

## 4-1. 運用向けダッシュボード（最小セット）

1. **週平均15時間の達成状況（個人別棒グラフ）**
   - X軸: `user_id`
   - Y軸: `semester_weekly_avg_hours`
   - 目標線: 15時間（赤の基準線）
   - 色分け:
     - 15時間以上: 緑
     - 12〜15時間: 黄
     - 12時間未満: 赤

2. **週次推移（折れ線）**
   - X軸: 週
   - Y軸: `weekly_hours`
   - 系列: ユーザーごと（または全体平均）
   - 目的: 期中の改善/低下トレンド確認

3. **目標差分ヒートマップ（週×ユーザー）**
   - 値: `weekly_hours - 15`
   - 色: 目標超過=濃色、未達=淡色
   - 目的: どの週に誰が未達かを即把握

4. **自動補正比率（棒 or ドーナツ）**
   - ユーザー別 `auto_fix_ratio`
   - 目的: 打刻運用の健全性確認

## 4-2. 追加候補（必要時）

- 滞在時間分布（箱ひげ図）
- 曜日別平均在室時間
- 在室開始時刻ヒストグラム

---

## 5. スプレッドシート実装方針（短期）

まずはスプレッドシート内で完結させる。

- 元データ: `attendance_log`
- 中間テーブル: `session_log`
  - 1行=1セッション（`user_id`, `in_at`, `out_at`, `duration_hours`, `is_auto_fixed`）
- 集計テーブル:
  - `summary_weekly`（週次）
  - `summary_semester`（前期累積・週平均）
- 表示シート:
  - `dashboard`

### 推奨シート構成

1. `attendance_log`（入力）
2. `session_log`（整形）
3. `summary_weekly`（週次KPI）
4. `summary_semester`（目標差分）
5. `dashboard`（グラフ）

---

## 6. フロントエンド再利用を見据えた設計

将来的に同じグラフを React UI で再表示できるよう、指標定義を固定する。

## 6-1. APIで返す想定データ（将来）

- `GET /api/view/analytics/weekly`
  - `[{ week_start, user_id, weekly_hours, target_hours, gap_hours }]`
- `GET /api/view/analytics/semester`
  - `[{ user_id, semester_weekly_avg_hours, target_hours, achievement_rate, auto_fix_ratio }]`

## 6-2. フロントUI部品の再利用方針

- グラフ描画ライブラリ（例: Recharts）で共通コンポーネント化
  - `KpiCard`
  - `TargetBarChart`
  - `WeeklyTrendLine`
  - `GapHeatmap`
- RPG風UIテーマを維持しつつ、分析画面は可読性優先
  - 背景/枠/フォントは統一
  - データ色（達成/注意/未達）は固定ルール

---

## 7. 運用フロー（毎週）

1. 打刻データ蓄積（通常運用）
2. 週末に `summary_weekly` 更新
3. `dashboard` で未達者と傾向を確認
4. 必要なら翌週の行動改善（出勤頻度・時間帯）

---

## 8. 判定ルール（運用での見せ方）

- 達成: `semester_weekly_avg_hours >= 15`
- 注意: `12 <= semester_weekly_avg_hours < 15`
- 要改善: `semester_weekly_avg_hours < 12`

表示上は、数値だけでなくバッジを併記する。

- `達成`
- `あとX時間/週`
- `要改善`

---

## 9. 段階的実装ロードマップ

### Phase 1（すぐできる）
- スプレッドシートで `session_log` / `summary_weekly` / `dashboard` を作成
- 週平均15時間達成可視化（棒グラフ + 目標線）

### Phase 2（次段階）
- FastAPIに閲覧用集計APIを追加
- React上で同等グラフを表示

### Phase 3（本格運用）
- 認証付きオンライン閲覧
- 期間比較・アラート通知（未達予兆）

---

## 10. 注意点

- 自動補正（`auto_fix`）が多いと実態把握が難しくなるため、比率を常に併記する
- 週平均は「対象週数」の定義で値が変わるため、前期開始/終了日を固定する
- 欠損・異常データの扱いを最初に決めてから運用する

