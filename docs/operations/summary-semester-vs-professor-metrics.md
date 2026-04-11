# `summary_semester` と教授向け指標の関係（正データの定義）

運用担当・開発が同じ前提を共有するための整理です。

---

## 結論（どちらを「正」とするか）

| 用途 | 正とするデータソース | 根拠 |
|------|----------------------|------|
| **教授共有・学期達成率・経過週平均** | **`10_professor_monthly`**（および月次 **`11_snapshot_YYYYMM`**）と **`00_config`** | GAS が `readProfessorConfig_` で読む **学期開始・終了・基準日 B12・公式週数 N** に沿って集計。自動補正セッションは指標から除外する実装になっている。 |
| **メンバー一覧のざっくり週平均（補助）** | **`summary_semester`** | `setupAnalyticsSheets()` が生成する**数式のみ**のシート。`session_log` の **全期間**の滞在時間をユーザー別に合算し、週数は QUERY で得た週数を用いる。**`00_config` の前期／後期レンジとは連動しない。** |

**学期単位の公式判断や面談資料には教授シート側を使う。** `summary_semester` は「全ログからの補助ビュー」として扱う。

---

## `summary_semester` の数式がやっていること（要点）

- `total_hours`（C 列相当）: `SUMIF(session_log!A:A, user, session_log!D:D)` に近い形で、**ユーザーごとのセッション時間の合計**。
- 学期の開始日・終了日で `session_log` を切っていないため、**過去学期のセッションも含まれる**（`session_log` が全期間再構築のため）。
- `week_count` や週平均は、上記合計と QUERY 由来の週数から算出。**大学の「公式週数 N」や `00_config` の k とは一致しない**。

将来、シート数式だけで学期フィルタを載せる場合は、`session_log!B`（入室 `in_at`）と `00_config!$B$15:$B$16` の関係を明示的に扱う必要があり、ISO 文字列と日付型の解釈差にも注意が必要です。**現状コードでは数式の変更は行っていない**（本ドキュメントで定義を固定）。

---

## 運用上の推奨

1. **学期切替**は [semester-transition-runbook.md](./semester-transition-runbook.md) に従い、`rebuildSessionLog` → `refreshProfessorMonthlyView` を優先。
2. **`summary_semester` を更新**したい場合のみ `setupAnalyticsSheets()` を実行（数式の再配置）。
3. フロントや API の `analytics_semester` モードは **`summary_semester` 由来**である点を理解したうえで表示ラベルを付ける（「全期間累計ベース」など）。

---

## 参照

- 教授向け仕様: [dashboard-spec-and-manual.md](../professor/dashboard-spec-and-manual.md)
- 数式生成: `gas/src/main.ts` の `setupAnalyticsSheets`
- 教授集計: 同ファイルの `refreshProfessorMonthlyView` / `aggregateSessionHoursForProfessor_`
