# 残課題と次アクション手順

本書は、現在の実装・可視化が完了した前提で、今後の改善点と実施順を整理した運用ドキュメントです。

---

## 1. 現在完了していること（前提）

- 打刻フロー（`/api/scan`）の基本動作
- GAS連携とスプレッドシート記録
- `session_log` 自動生成（`rebuildSessionLog()`）
- `summary_semester` 自動整備（`setupAnalyticsSheets()`）
- `summary_semester` による達成状況の確認
- `user_master` による `user_id` と氏名の紐づけ

---

## 2. 残されている改善点（優先順）

## 2-1. 運用安定化（最優先）

1. **週次運用SOPの固定**
   - 実行者・実行日・確認項目を固定する
2. **データ品質監査の定例化**
   - 未登録 `user_id`、自動補正比率、不整合セッションを毎週確認
3. **バックアップ運用**
   - スプレッドシートの定期バックアップ（週1推奨）

## 2-2. 分析精度向上

1. **`summary_weekly` 追加**
   - 週ごとの推移を正規テーブル化
2. **自動補正の影響可視化**
   - `auto_fix_ratio` を `summary_semester` または教授向けシート側で常設
3. **対象期間の厳密化**
   - 前期開始日・終了日を固定し、集計条件を明記

## 2-3. システム品質向上

1. **APIの異常系テスト強化**
   - GASエラー、タイムアウト、不正ID、クールダウン
2. **ログ整備**
   - `request_id` を使った追跡手順の文書化
3. **本番起動の安定化**
   - Raspberry Pi 向け例は `deploy/raspberry-pi/` を参照（運用に合わせた調整・再起動 SOP の確定は継続）

## 2-4. 将来拡張（任意）

1. 閲覧API（`/api/view/...`）の実装
2. フロント分析画面（グラフ再利用）
3. 認証付きオンライン閲覧

---

## 3. 次にやる手順（実行順）

## Step 1: 運用SOPを決める（今週）

- [ ] 週次更新の担当者を決める
- [ ] 実行タイミングを決める（例: 毎週月曜 09:00）
- [ ] 毎週の固定手順を文書化
  - `rebuildSessionLog()`
  - `setupAnalyticsSheets()`
  - `summary_semester` / 教授向けシートの確認

## Step 2: 監査チェックを運用に組み込む（今週）

- [ ] 未登録 `user_id` 件数を確認
- [ ] `auto_fix_ratio` を確認
- [ ] セッション不整合（0時間/負値）を確認
- [ ] 問題があれば `note` に記録

## Step 3: `summary_weekly` を追加（来週）

- [ ] `week_start` × `user_id` の週次集計シートを作成
- [ ] 週次推移グラフを追加
- [ ] 週平均15hからの差分を可視化

## Step 4: 本番運用ドキュメントを確定（来週）

- [ ] 障害時手順（GASエラー時、再デプロイ手順）
- [ ] Raspberry Pi再起動時の確認手順
- [ ] 機密情報管理ルール（`.env`, Script Properties）

---

## 4. 週次実行チェックリスト（そのまま利用可）

- [ ] Apps Script `rebuildSessionLog()` 実行
- [ ] Apps Script `setupAnalyticsSheets()` 実行
- [ ] `summary_semester` 更新確認（数式・条件付き書式に崩れがないか）
- [ ] 達成/注意/要改善の人数確認
- [ ] `auto_fix_ratio` 確認
- [ ] 未登録 `user_id` 確認
- [ ] 気付き事項を `note` もしくは議事メモに記録

---

## 5. 目標判定ルール（再掲）

- 達成: `semester_weekly_avg_hours >= 15`
- 注意: `12 <= semester_weekly_avg_hours < 15`
- 要改善: `semester_weekly_avg_hours < 12`

---

## 6. 推奨マイルストーン

- **M1（今週）**: 運用SOP + 監査定例化
- **M2（来週）**: `summary_weekly` + 週次推移グラフ
- **M3（今月）**: 本番運用手順固定（障害対応含む）
- **M4（余力）**: 閲覧APIとフロント分析画面への展開

