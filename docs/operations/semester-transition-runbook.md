# 前期・後期切替 Runbook（スプレッドシート／GAS）

学期が変わるときの**最低限の作業**と**よくある落とし穴**を固定します。  
実装の詳細は [dashboard-spec-and-manual.md](../professor/dashboard-spec-and-manual.md)（教授向け）および [phased-guide.md](./phased-guide.md) を参照してください。

---

## 0. 設計前提（必ず読む）

- **`attendance_log` は学期で分割しない。** 打刻の生ログは1本のシートに蓄積し続ける。
- **「どの期間を学期として数えるか」は `00_config` で切り替える。** 前期→後期は**ログ削除なし**で運用する。
- **教授向けの公式指標**（達成率・経過週平均など）は **`10_professor_monthly` と `00_config`** に基づく（GAS の `readProfessorConfig_`）。  
  `summary_semester` は補助用の数式シートであり、学期境界の解釈が異なる場合がある。詳細は [summary-semester-vs-professor-metrics.md](./summary-semester-vs-professor-metrics.md)。

---

## 1. `00_config` の更新（必須）

`bootstrapProfessorDashboard()` 済みで、シート `00_config` の行番号は次のとおり（列は **B 列が値**）。

| 行 | 項目（A列ラベル） | 作業 |
|----|-------------------|------|
| 2 | 年度 | 新年度なら **B2** を更新 |
| 3 | 集計対象学期 | **B3** を `前期` または `後期` に変更 |
| 4–5 | 前期開始・終了日 | 前期運用なら **B4, B5** を大学カレンダーどおり（**日付型**） |
| 6 | 前期公式週数 N | **B6** |
| 7–8 | 後期開始・終了日 | 後期運用なら **B7, B8**（**日付型**） |
| 9 | 後期公式週数 N | **B9** |
| 10 | 目標週平均 | 通常は **B10 = 15** |
| 12 | 基準日（月末） | 共有の「いつ時点まで」を **B12** に。日付型。 |
| 13 | k 上書き | **学期の切替時は原則空欄**に戻し、自動算出に任せる（特別運用のみ数値） |

**B15–B17** は数式（対象学期の開始・終了・N）。**手で上書きしない。**

---

## 2. `B12` と月次トリガーの関係

- 手動で `runMonthlyClose()` する場合: 実行前に **B12 をその締めの基準日（多くは先月末）** に合わせる（[dashboard-spec-and-manual.md](../professor/dashboard-spec-and-manual.md) 6章）。
- **`installMonthlyCloseTrigger` が有効な場合**: 毎月1日 7:00 の `runMonthlyCloseForPreviousMonth` が **B12 を先月末に自動設定**してから月次締めを実行する。
- **学期切替のタイミング**が月初と重なると、意図しない B12 で締まることがある。必要なら**その月は手動で B12 を確認してから** `runMonthlyClose()` を実行するか、トリガー実行後に B12 を読み直す。

---

## 3. GAS 実行チェックリスト（推奨順）

1. **`rebuildSessionLog()`**  
   `session_log` を `attendance_log` から再構築。教授向け集計・週次系 API の前提。
2. **`refreshProfessorMonthlyView()`**  
   `10_professor_monthly` を `00_config` の学期・基準日に合わせて更新。
3. **`setupAnalyticsSheets()`**（任意）  
   `summary_semester` の数式を再展開したいとき。補助表示用。

---

## 4. `user_master`

- 卒業・離籍・休止メンバーは **`active` を FALSE** にするタイミングを研究室ルールで決め、切替前後で一括見直し。
- **`user_id` は打刻・QR と完全一致**させる（フェーズ1の拒否挙動と連動）。

---

## 5. スナップショット `11_snapshot_YYYYMM`

- 前期の**最終共有**や年度末に、意図した **B12** で `runMonthlyClose()`（スナップショット作成あり）が済んでいるか確認する。
- シート名の `yyyyMM` は **B12 の基準日**から決まる（GAS 実装に依存）。欠けている月がないか一覧で確認。

---

## 6. バックエンド・フロント（必要なら）

- 学期や週の説明を UI に出している場合は、**用語を教授向け定義と揃える**。
- `doGet` の週次モード等は **`session_log` が最新**であることが前提。

---

## 7. 切替直後の確認（サインオフ用）

- [ ] B2–B9・B12 が意図どおり（日付型）
- [ ] B13 は空欄または意図した上書きのみ
- [ ] B15–B17 が数式のまま正しく表示されている
- [ ] `rebuildSessionLog` → `refreshProfessorMonthlyView` を実行済み
- [ ] `10_professor_monthly` のヘッダ・人数・グラフに明らかな欠損がない
- [ ] `user_master` の `active` が現状と一致
- [ ] 必要なら `setupAnalyticsSheets` 実行と `summary_semester` の目視

---

## 8. 参照コード

- `00_config` 雛形: `gas/src/main.ts` の `ensureConfigSheet_`
- 設定読み取り: `readProfessorConfig_`
