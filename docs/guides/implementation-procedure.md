# 勤怠管理システム（RPG風UI版） 実装手順書

本書は [`docs/specs/guide.md`](../specs/guide.md) の最終仕様を実装に落とし込むための手順書です。  
作業順は **frontend -> backend -> gas -> 結合試験 -> Raspberry Pi本番化** を推奨します。

---

## 0. 前提条件

- 開発OS: macOS
- 本番OS: Raspberry Pi 5 (Bookworm)
- リポジトリ構成:
  - `frontend/`
  - `backend/`
  - `gas/`
- 使用技術:
  - Frontend: React + TypeScript + Vite + Tailwind CSS
  - Backend: Python + FastAPI
  - Cloud: Google Apps Script + Google Spreadsheet

---

## 1. 初期セットアップ（モノレポ）

### 1-1. ディレクトリ作成

- ルートに以下を作成:
  - `frontend`
  - `backend`
  - `gas`

### 1-2. frontend セットアップ

- Vite + React + TypeScript プロジェクトを作成
- Tailwind CSS を導入
- ピクセルフォント（DotGothic16）を適用
- 起動確認（ローカル）

### 1-3. backend セットアップ

- Python仮想環境を作成
- FastAPI, Uvicorn, python-dotenv, httpx（GAS連携用）などを導入
- `backend/.env.example` を作成

### 1-4. gas セットアップ

- `gas/` に `.gs` ファイルを作成
- Apps Script プロジェクトを作成して貼り付け
- Spreadsheetを用意し、シート名を `attendance_log` に設定

---

## 2. 環境変数定義

`backend/.env` に最低限以下を定義:

- `APP_ENV=dev`
- `GAS_WEBHOOK_URL=<GAS Webhook URL>`
- `GAS_SHARED_SECRET=<任意の長いランダム文字列>`
- `AUTO_FIX_HOURS=0`
- `COOLDOWN_SECONDS=30`
- `REQUEST_TIMEOUT_SEC=5`

運用ルール:

- 本番では `APP_ENV=prod`
- `APP_ENV=prod` のとき `POST /api/mock-scan` は無効化
- 必須環境変数が欠けたらFastAPIを起動しない（fail fast）

---

## 3. バックエンド実装（FastAPI）

## 3-1. API仕様を固定実装

- `POST /api/scan`
  - 入力: `user_id`, `scanned_at?`, `source?`
  - 出力: `ok`, `result`, `message`, `user_id`, `action`, `cooldown_remaining_sec`, `request_id`, `server_time`

- `POST /api/mock-scan`
  - 開発専用
  - 内部的に `/api/scan` と同一ロジックを使用

- `GET /api/healthz`
  - 稼働確認用（200）

### 3-2. 入力バリデーション

- `user_id` は正規表現 `^[A-Za-z0-9]{5,12}$` で検証
- 不正時:
  - HTTP `400`
  - エラーコード `INVALID_USER`

### 3-3. クールダウン処理

- 同一 `user_id` の直近成功打刻から30秒（`COOLDOWN_SECONDS`）はブロック
- ブロック時:
  - HTTP `409`
  - エラーコード `COOLDOWN_ACTIVE`
  - `result=blocked`
  - `cooldown_remaining_sec` を返却

### 3-4. GAS連携

- FastAPIからGASへPOST:
  - 送信: `user_id`, `timestamp`(JST ISO8601), `request_id`, `shared_secret`
  - `shared_secret` はGASのScript Properties `GAS_SHARED_SECRET` と一致させる
- タイムアウト/失敗時:
  - `504 GAS_TIMEOUT`
  - `502 GAS_ERROR`

### 3-5. ログ・トレース

- 全レスポンスに `request_id` を含める
- エラー時は `request_id` 付きでログ出力

---

## 4. フロントエンド実装（React）

### 4-1. 画面要件

- RPG風 8-bit UI
- 黒背景 / ピクセルフォント
- 下部メッセージウィンドウ（黒背景 + 白枠）

### 4-2. 状態管理

以下6状態を持つ:

- `idle`
- `processing`
- `success_in`
- `success_out`
- `blocked`
- `error`

遷移ルール:

- 初期状態は `idle`
- 送信中は `processing`
- API応答により `success_in / success_out / blocked / error` に遷移
- `success_* / blocked / error` は3秒表示後 `idle` に戻る

### 4-3. 文言表示

- `idle`: 「▶ QRコードを かざしてね」
- `processing`: 「つうしんちゅう...」
- `success_in`: 「[ユーザーID] が けんきゅうしつ に あらわれた！」
- `success_out`: 「[ユーザーID] は きょうの けんきゅう を おえた！ (HPがかいふくした)」
- `blocked`: 「れんぞく だこく は できないよ。あと [N] びょう まってね」
- `error`: APIの `message` を優先表示

### 4-4. 通信方式

- 開発時はViteプロキシ（`/api` -> `http://127.0.0.1:8000`）経由で単発リクエストを実装
- 必要に応じてWebSocket/SSEに拡張

---

## 5. GAS実装（Webhook + バッチ）

### 5-1. doPost（Webhook）

- FastAPIからのJSONを受信
- 共有シークレットを検証（不一致は拒否）
- `attendance_log` を読み、直近の該当ユーザー状態からトグル判定:
  - 前回が `出勤` -> 今回 `退勤`
  - それ以外 -> 今回 `出勤`
- 行を追記:
  - `timestamp`, `user_id`, `action`, `source=scan`, `request_id`, `note`
- JSONでFastAPIへ返却:
  - `ok`, `action`, `message`, `server_time`

### 5-2. 午前5時バッチ

- 時間主導トリガー（毎日05:00 JST）を設定
- 前日データを走査し、`出勤`のみで`退勤`が無いユーザーを抽出
- `出勤時刻 + AUTO_FIX_HOURS` で退勤時刻を算出
- `退勤（自動補正）` を追記:
  - `source=auto_fix`
  - `note` に自動補正理由を記録

### 5-3. GAS初期化（運用時に一度だけ）

- Apps Script の `setScriptProperties()` を1回実行
  - `GAS_SHARED_SECRET`, `AUTO_FIX_HOURS` を設定
- `installDailyBatchTrigger()` を1回実行
  - `runAutoFixBatch` の毎日5時トリガーを作成

---

## 6. 結合試験手順

### 6-1. 正常系

1. `POST /api/mock-scan` で初回打刻
2. `result=success_in` を確認
3. 3分経過後に再打刻
4. `result=success_out` を確認

### 6-2. 異常系

1. 不正ID（例: `ab!`）で `400 INVALID_USER`
2. 連続打刻で `409 COOLDOWN_ACTIVE` + `result=blocked`
3. GAS停止/URL不正で `504 GAS_TIMEOUT` または `502 GAS_ERROR`

### 6-3. バッチ系

1. 前日に `出勤` のみを作成
2. バッチ実行
3. `退勤（自動補正）` が追記されることを確認

---

## 7. Raspberry Pi 本番化手順

**詳細はリポジトリの [`deploy/raspberry-pi/README.md`](../../deploy/raspberry-pi/README.md) に従う（nginx・systemd・Chromium の具体例あり）。**

### 7-1. 配備

- Raspberry Pi 5 にリポジトリをクローン
- `frontend` を `vite build`（本番バンドル）
- `backend` の venv と依存をインストール
- `backend/.env` を本番値で作成（`APP_ENV=prod`）

### 7-2. 常駐化

- nginx で `frontend/dist` を配信し `/api` を uvicorn にリバースプロキシ
- FastAPI を systemd（[`deploy/raspberry-pi/systemd/attendance-backend.service`](../../deploy/raspberry-pi/systemd/attendance-backend.service)）で常駐
- Chromium キオスクは `~/.config/autostart/` に `.desktop` を配置

### 7-3. 起動時確認

- `curl http://127.0.0.1/api/healthz` が 200（nginx 経由）
- 本番フロントで可視 ID 入力・`mock-scan` ボタンが無い
- 実スキャナ入力で打刻可能

---

## 8. 運用チェックリスト

- [ ] `.env` のシークレット値が漏洩していない
- [ ] Spreadsheet列順が仕様通り
- [ ] GASトリガーが毎日5時に設定済み
- [ ] エラー時ログに `request_id` が出る
- [ ] 本番で `mock-scan` が公開されていない
- [ ] タイムゾーンがJSTで統一されている

---

## 9. 変更管理ルール（推奨）

- 仕様変更はまず [`docs/specs/guide.md`](../specs/guide.md) を更新
- 実装変更時は本手順書も同期更新
- 受け入れ基準（正常系/異常系/バッチ系）を満たしてから本番反映
