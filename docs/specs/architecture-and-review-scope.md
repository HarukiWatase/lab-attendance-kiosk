# 研究室向け出勤管理システム — 構築概要とレビュー範囲

本書は、チームのエンジニアと研究室側（顧客）が共通認識を持ち、レビューや受入判断を効率化するための資料です。実装の詳細仕様は [`docs/operations/phased-guide.md`](../operations/phased-guide.md)・[`docs/operations/remaining-improvements.md`](../operations/remaining-improvements.md) 等と併読してください。

---

## 1. システムの目的と前提

- **目的**: 研究室メンバーが打刻（出勤／退勤）し、記録を Google スプレッドシートに蓄積する。分析ダッシュボードや週次集計は段階的に利用可能。
- **技術の柱**: 画面・API はローカル／エッジで動かし、**永続化と集計の中心は Google Apps Script（GAS）とスプレッドシート**です。GAS は Web アプリとしてデプロイされ、バックエンドから HTTP で呼び出されます。

---

## 2. アーキテクチャ全体像

### 2.1 レイヤ構成（データの流れ）

```
[入力端末・ブラウザ]
        │
        ▼ HTTP (同一LAN想定など)
┌───────────────────┐
│ フロントエンド     │  React (Vite) — 打刻UI・分析表示の一部
│ frontend/         │
└─────────┬─────────┘
          │ POST /api/scan 等
          ▼
┌───────────────────┐
│ バックエンド       │  FastAPI — 検証・クールダウン・ユーザー照合・GAS中継
│ backend/app/      │
└─────────┬─────────┘
          │ POST/GET (共有秘密付き)
          ▼
┌───────────────────┐
│ GAS Web アプリ     │  doPost / doGet — シート読書き・補正バッチ等
│ gas/src/main.ts │  （実体はスプレッドシートに紐づくプロジェクト）
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ Google スプレッドシート │
│ attendance_log, user_master, session_log, summary_* … │
└───────────────────┘
```

- **打刻のクリティカルパス**: フロント → `POST /api/scan` → GAS `doPost` → `attendance_log` へ1行追加。
- **参照・分析パス（任意）**: フロントが `GET /api/view/...` を叩き、バックエンドが GAS `doGet`（`mode=users` / `mode=analytics_semester`）経由でシートまたは事前集計結果を返す。

### 2.2 リポジトリ内の主要コンポーネント

| 領域 | 主なファイル・ディレクトリ | 役割の要約 |
|------|---------------------------|------------|
| フロント | `frontend/src/App.tsx`、`frontend/src/styles.css` | 打刻画面・簡易ログ・分析タブ。開発時はモックデータ利用可。 |
| API | `backend/app/main.py` | `healthz`、`/api/scan`、閲覧系 `/api/view/*`、開発用 `/api/mock-scan`。 |
| GAS | `gas/src/main.ts` | `doPost`（打刻行の追記）、`doGet`（ユーザー一覧・学期分析）、未退勤補正・セッション再構築・分析シート整備など。 |
| 運用・仕様補足 | [`phased-guide.md`](../operations/phased-guide.md)、[`display-ui-spec.md`](./display-ui-spec.md) 等 | フェーズ別の必須設定、UI文言方針など。 |

### 2.3 信頼境界と設定

- **共有秘密**: バックエンドの環境変数と GAS のスクリプトプロパティで同一の `GAS_SHARED_SECRET` を保持し、GAS へのリクエストを簡易認証します。
- **本番相当環境**: `APP_ENV` が開発以外のとき、GAS の URL と秘密が必須。`user_master` を GAS 経由で読み、未登録・無効ユーザーはバックエンドで打刻拒否します。
- **GAS の実行形態**: 打刻は **Web アプリ URL への都度 POST**。日次の未退勤補正（`runAutoFixBatch`）は **時間トリガー**（設定時のみ）。

### 2.4 スプレッドシート上の論理モデル（概要）

| シート例 | レビュー上の位置づけ |
|----------|----------------------|
| `attendance_log` | 生ログ（真実のソースに近い）。タイムスタンプ・ユーザー・出勤／退勤・来源・`request_id` 等。 |
| `user_master` | 登録ユーザーと表示名・アクティブフラグ。バックエンドの照合元。 |
| `session_log` | ログから再構築した「セッション」単位（集計の前提）。 |
| `summary_semester` 等 | 補助用の数式集計（**全期間寄り**になり得る）。**学期の公式指標は教授シート**（`00_config` 連動）。詳細は [summary-semester-vs-professor-metrics.md](../operations/summary-semester-vs-professor-metrics.md)。 |

---

## 3. レビュー範囲の分け（アーキテクチャ単位）

レビュー担当を分けるときは、**変更がどの境界をまたぐか**で切ると重複と漏れが減ります。以下は推奨の責務マッピングです。

### 3.1 顧客（研究室側）に見てほしい範囲

ビジネス妥当性・運用可能性・プライバシ周りが中心です。ソースコードの深読みは必須ではありません。

- **打刻フロー**: 誤操作時のメッセージ、クールダウンによる連打制限の実運用として許容できるか。
- **マスタ運用**: `user_master` と実際の ID（QR・入力値）の対応、無効化の手順、`user_master_template.csv` の運用。
- **記録の意味**: `attendance_log` の列の意味、自動補正（`退勤（自動補正）`）を入れる判断と研究室ルールの整合。
- **分析の見え方**: [`display-ui-spec.md`](./display-ui-spec.md) に沿った画面文言・目標時間（例: 週平均 15 時間）の解釈。在室マークは [`analytics-tab-presence-indicator.md`](./analytics-tab-presence-indicator.md)。
- **フェーズ判断**: [`phased-guide.md`](../operations/phased-guide.md) のフェーズ1〜3に対し、「まず何を必須にするか」の合意。

**レビュー成果物の例**: 受入チェックリスト、マスタ更新手順の承認、自動補正の採用／非採用。

### 3.2 フロントエンド担当エンジニア

- **範囲**: `frontend/`（`App.tsx` の状態遷移、API 呼び出し、分析タブ、開発モックの扱い）、`vite.config.ts` のプロキシ、`styles.css`。
- **観点**: `/api/scan` や `/api/view/...` のレスポンス形との整合、エラー・ブロック表示、`request_id` 表示の要否、子ども向け文言（ひらがな等）の一貫性。
- **境界**: ビジネスルールの最終判定はバックエンド／GAS 側。フロントは表示と入力検証の補助に留める前提でレビューする。

### 3.3 バックエンド（FastAPI）担当エンジニア

- **範囲**: `backend/app/main.py`、環境変数（`.env` のキー定義と本番要件）、起動・デプロイ手順（Pi 等を含む運用ドキュメントがあればそれに連動）。
- **観点**: `user_id` 正規表現、クールダウン、`UNKNOWN_USER` / `INACTIVE_USER`、GAS タイムアウト・502 扱い、ユーザー一覧キャッシュ TTL、`/api/mock-scan` の本番無効化。
- **契約（Contract）レビュー**: GAS に送る JSON（`user_id`, `timestamp`, `request_id`, `shared_secret`）と、GAS から返る `action` の解釈が前后で矛盾しないこと。

### 3.4 GAS・スプレッドシート担当エンジニア

- **範囲**: `gas/src/main.ts` と、実際のスプレッドシート上のシート構造・数式・命名（リポ外だが仕様としてレビュー対象）。
- **観点**: `doPost` の idempotency ではないことの理解（同一 `request_id` の再送仕様が必要なら別途）、`decideAction` とログの整合、秘密の比較、大量行時のパフォーマンス、`runAutoFixBatch` / `rebuildSessionLog` / `setupAnalyticsSheets` の実行順と副作用。
- **運用**: Web アプリの再デプロイ、トリガー重複、Script Properties と `.env` の同期。

### 3.5 横断レビュー（アーキテクト／テックリード推奨）

複数コンポーネントにまたがる変更時に実施します。

- **エンドツーエンド**: 1 打刻が `attendance_log` の期待行になるか（タイムゾーン JST の一貫性含む）。
- **トレーシビリティ**: `request_id` がログに残り、問い合わせ時に追えるか。
- **セキュリティ**: 共有秘密の取り扱い、GAS Web アプリの「アクセスできるユーザー」設定と研究室ポリシー。
- **フェーズとスコープ**: 分析機能を後回しにする場合、フェーズ1で `doGet` が本当に不要か（本番ユーザー照合では `mode=users` が必要）。

---

## 4. レビュー時の優先度メモ（短縮版）

| 優先度 | 観点 | 主な担当の目安 |
|--------|------|----------------|
| 最高 | 打刻が欠損・二重解釈なく記録されること | BE + GAS + 顧客（運用） |
| 高 | 未登録・無効ユーザーの拒否、秘密・URL の取り扱い | BE + GAS + 顧客（マスタ） |
| 中 | UI のわかりやすさ、分析表示の意味 | FE + 顧客 |
| 段階的 | セッション再構築・学期集計・週次正規表 | GAS + スプレッドシート + 顧客 |

---

## 5. 関連ドキュメント

| 文書 | 用途 |
|------|------|
| [`phased-guide.md`](../operations/phased-guide.md) | フェーズ別の設定手順と最小要件 |
| [`remaining-improvements.md`](../operations/remaining-improvements.md) | 運用 SOP・改善バックログ |
| [`display-ui-spec.md`](./display-ui-spec.md) | 表示UIの仕様・文言 |

---

*最終更新想定: リポジトリ現状（FastAPI / React / GAS / スプレッドシート）に基づく。*
