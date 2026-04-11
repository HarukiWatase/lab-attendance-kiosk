# GAS トリガーと clasp（運用メモ）

長期運用で迷子にならないよう、**コード上の関数名**と**実際の設定手順**を固定します。

---

## 1. clasp でできること・できないこと

| 操作 | clasp | 備考 |
|------|-------|------|
| スクリプトの push / pull | `clasp push` 等 | トリガーは**付随しない** |
| 関数のリモート実行 | `clasp run` | **Execution API 経由の制限**により、`ScriptApp.newTrigger()` など**トリガー作成は不可**（エラーになる） |
| トリガーの作成 | **不可（CLI からは不可）** | Apps Script **エディタ上で関数を1回実行**するか、エディタの「トリガー」UIで手動追加 |

実務フロー:

1. ローカルで `gas` をビルドし `clasp push` する。
2. ブラウザでスプレッドシート → **拡張機能 → Apps Script** を開く。
3. **`installAutomationTriggers()` をエディタから実行**（初回・引き継ぎ・壊れたとき）。
4. **`listAutomationTriggers()` を実行**し、一覧を確認（ログに出すか、実行ログを見る）。

---

## 2. 本プロジェクトの自動化トリガー（`gas/src/main.ts`）

| ハンドラ | スケジュール | 役割 |
|----------|--------------|------|
| `runAutoFixBatch` | 毎日 5 時（スクリプトのタイムゾーン基準） | 前日分の未退勤に対し `退勤（自動補正）` を追記 |
| `runMonthlyCloseForPreviousMonth` | 毎月 1 日 7 時 | `00_config!B12` を**先月末**に設定し、`runMonthlyClose()`（`rebuildSessionLog` → `refreshProfessorMonthlyView` → 既定でスナップショット）を実行 |

登録用のラッパー:

- **`installAutomationTriggers()`** … 上記2種を**重複なし**で追加し、一覧を返す。
- **`removeAutomationTriggers()`** … 上記2種だけ削除（他の手動トリガーは触らない設計）。
- **`listAutomationTriggers()`** … 確認用。

---

## 3. 週次 `rebuildSessionLog` / `setupAnalyticsSheets` をどうするか

現状、**時間トリガーには載っていない。** 次のどちらかを研究室で決め、SOP に書き留める。

- **A. 手動（週1）**  
  エディタで `rebuildSessionLog()` → 必要なら `setupAnalyticsSheets()`。負荷が少なく、月次トリガーと干渉しにくい。
- **B. 週1の時間トリガー**  
  新規関数（例: `runWeeklyMaintenance`）を作り、その中で上記を呼ぶ。**月次実行日と重なった場合の二重実行**が許容か（冪等性はあるが負荷増）を確認する。

---

## 4. 失敗検知

GAS の時間トリガーは、失敗しても UI に気づきにくい。

- **実行ログシート** `99_automation_log`（本リポジトリの GAS で**追記**）  
  `runAutoFixBatch` と `runMonthlyCloseForPreviousMonth` の**正常終了／エラー**を1行ずつ残す。トリガー障害の調査の足がかりにする。
- **メール通知**（`MailApp` / `GmailApp`）は任意。クォータとスパムに注意。

定期確認:

- 月1回、`99_automation_log` の直近行と `listAutomationTriggers()` の結果を見る。

---

## 5. 引き継ぎ・権限

- トリガーは**作成した Google アカウント**の権限で動く。アカウント変更時は **`removeAutomationTriggers` → `installAutomationTriggers`** を新担当のエディタで実行し直す。
- Web アプリのデプロイ実行ユーザと揃えるかどうかは、組織ポリシーに合わせて決める。

---

## 6. 参照

- フェーズ別の入口: [phased-guide.md](./phased-guide.md)
- 教授向け手順: [dashboard-spec-and-manual.md](../professor/dashboard-spec-and-manual.md)
- 学期切替: [semester-transition-runbook.md](./semester-transition-runbook.md)
