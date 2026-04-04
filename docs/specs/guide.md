# 勤怠管理システム（RPG風UI版） 要求仕様書

## 1. プロジェクト概要
研究室の学生が、物理QRスキャナに自身のQRコードをかざすことで出退勤を記録するシステム。
フロントエンドは8-bit RPG風のドット絵UIを採用し、毎日の打刻体験をゲーム化する。
開発フローとして、まずはMacBook上でモックを用いたローカル開発を行い、完成後に本番環境であるRaspberry Pi 5（Bookworm OS）へクローンして運用する。

## 2. システムアーキテクチャと技術スタック
* **フロントエンド**: `React` + `TypeScript` + `Vite` + `Tailwind CSS`
* **バックエンド (ローカル API)**: `Python` + `FastAPI`
* **クラウド・データベース**: `Google Apps Script (GAS)` + `Google Spreadsheet`
* **インフラ**: Mac (ローカル開発環境) -> Raspberry Pi 5 (本番環境, Chromium Kioskモード表示)

## 3. ディレクトリ構成案（モノレポ構成）
```text
/attendance-system
  ├── frontend/           # Vite + React (UI層)
  ├── backend/            # FastAPI (デバイス制御・API層)
  ├── gas/                # Google Apps Script (クラウド・バッチ層)
  ├── deploy/raspberry-pi/  # Pi 本番: nginx・systemd・Chromium 例
  └── docs/               # 仕様・運用ドキュメント（入口: docs/README.md）
        ├── specs/        # 要求仕様・UI・キオスク・アーキテクチャ
        ├── professor/    # 教授ダッシュボード関連
        ├── operations/   # 運用フェーズ・チェックリスト・改善
        ├── guides/       # 実装手順
        └── presentations/  # 説明用スライド（Marp）
```
## 4. 機能・実装要件
4-1. フロントエンド (frontend/)
デザイン要件: 8-bit RPG風のUI。

背景: 黒、またはドット絵風のシンプルなタイル。

フォント: DotGothic16 などのピクセルフォント（Google Fonts）を全体に適用。

メッセージウィンドウ: 画面下部に配置（黒背景、白の太枠）。

状態管理 (State): 以下の6つの状態を持ち、バックエンドからのWebSocket（またはSSE / ポーリング）通信を受け取って状態遷移する。

idle (待機中): 「▶ QRコードを かざしてね」と点滅表示。

processing (通信中): 「つうしんちゅう...」と表示。

success_in (出勤成功): 「[ユーザーID] が けんきゅうしつ に あらわれた！」と表示（3秒後にidleへ戻る）。

success_out (退勤成功): 「[ユーザーID] は きょうの けんきゅう を おえた！ (HPがかいふくした)」と表示（3秒後にidleへ戻る）。

blocked (連続打刻制限): 「れんぞく だこく は できないよ。あと [N] びょう まってね」を表示（3秒後にidleへ戻る）。

error (失敗): 「つうしん エラー / むこうなID / しばらく まってね」などを表示（3秒後にidleへ戻る）。

4-2. バックエンド (backend/)
役割: QRスキャナからの入力を受け付け、GASへPOST送信し、フロントエンドに結果を返す。

ローカル開発用モックエンドポイント:

Macでの開発中は物理スキャナの挙動をシミュレートするため、POST /api/mock-scan { "user_id": "12345" } というエンドポイントを作成する。これを叩くと、物理スキャナで読み込んだのと同じ処理が走るようにする。

連続打刻防止 (クールダウン): メモリ上で直近の打刻履歴を保持し、同一IDの連続読み取りは3分間ブロックする（誤作動防止）。

環境変数管理: GASのWebhook URLなどは .env で管理する。

4-3. クラウド連携・バッチ処理 (gas/)
Webhook API (doPost):

FastAPIから user_id と timestamp をJSONで受け取る。

スプレッドシートの履歴を確認し、前回の打刻が「出勤」であれば今回は「退勤」、それ以外は「出勤」として最下行に追記する（トグル処理）。

処理結果（出勤か退勤か）をFastAPIへレスポンスとして返す。

退勤忘れ自動補正バッチ:

毎日「午前5時」に実行される時間主導型トリガーを想定した関数を作成する。

前日のデータを走査し、「出勤」しているが「退勤」していないユーザーを特定。

該当ユーザーに対し、「出勤時刻 + 0時間（同時刻）」を退勤時刻として算出し、「退勤（自動補正）」という種別でスプレッドシートに追記する。

## 5. 開発の進め方（Cursorへの指示）
まずは frontend/ のセットアップを行い、モックデータを使ってRPG風UIのReactコンポーネントとTailwind CSSを完成させてください。

次に backend/ のFastAPIを構築し、フロントエンドと連携（WebSocket等）させて、モックAPI経由でUIが動的に変化する基盤を作ってください。

最後に gas/ ディレクトリに、スプレッドシート連携と午前5時のバッチ処理を行う .gs ファイルのコードを出力してください。

## 6. 推奨実装仕様（追記）

### 6-1. API I/F 仕様

#### FastAPI 公開 API

- `POST /api/scan`
  - 用途: 物理QRスキャナ入力、および開発時の擬似入力を統一的に処理する本命エンドポイント。
  - Request(JSON):
    - `user_id: string`（必須）
    - `scanned_at: string`（任意、ISO8601。未指定時はサーバ時刻）
    - `source: string`（任意。`scanner` / `mock`）
  - Response(JSON):
    - `ok: boolean`
    - `result: string`（`success_in` / `success_out` / `blocked` / `error`）
    - `message: string`（UI表示用）
    - `user_id: string`
    - `action: string | null`（`出勤` / `退勤` / `退勤（自動補正）`）
    - `cooldown_remaining_sec: number | null`
    - `request_id: string`（トレーシング用）
    - `server_time: string`（ISO8601, JST）

- `POST /api/mock-scan`
  - 用途: ローカル開発専用。内部で `POST /api/scan` を呼び同一ロジックで処理する。
  - 本番運用時は無効化（環境変数フラグで起動拒否）。

- `GET /api/healthz`
  - 用途: 稼働監視用。200を返す。

#### FastAPI -> GAS Webhook

- Webhook URLは `.env` の `GAS_WEBHOOK_URL` で管理する。
- Request(JSON):
  - `user_id: string`
  - `timestamp: string`（ISO8601, JST）
  - `request_id: string`
- Response(JSON):
  - `ok: boolean`
  - `action: string`（`出勤` or `退勤`）
  - `message: string`
  - `server_time: string`

### 6-2. エラーコードとHTTPステータス

- `200`: 正常（`success_in` / `success_out`）
- `400`: `INVALID_USER`（不正なID形式）
- `409`: `COOLDOWN_ACTIVE`（3分クールダウン中）
- `502`: `GAS_ERROR`（GAS側エラー）
- `504`: `GAS_TIMEOUT`（GAS応答タイムアウト）
- `500`: `INTERNAL_ERROR`（その他）

レスポンスには常に `request_id` を含め、ログ相関を可能にする。

### 6-3. 時刻・日付仕様

- タイムゾーンは `Asia/Tokyo (JST)` に固定する。
- APIの時刻文字列はISO8601形式（例: `2026-04-01T09:00:00+09:00`）。
- GASの午前5時バッチは「JSTで前日分」を対象にする。
- 自動補正時刻は `出勤時刻 + 0時間（同時刻）` を既定とし、`AUTO_FIX_HOURS`（環境変数）で将来変更可能にする。

### 6-4. フロントエンド状態遷移仕様

状態は以下の6つを持つ。

- `idle`: 待機中
- `processing`: API通信中
- `success_in`: 出勤成功（3秒表示後 `idle`）
- `success_out`: 退勤成功（3秒表示後 `idle`）
- `blocked`: 連続打刻制限（3秒表示後 `idle`）
- `error`: 失敗（通信失敗/不正ID/タイムアウト/内部エラー）

`blocked` は `error` と分離し、専用メッセージで「あとN秒で再打刻可能」を表示する。

### 6-5. 連続打刻防止（クールダウン）仕様

- 同一 `user_id` について、直近成功打刻から3分間は再打刻をブロックする。
- 実装はFastAPIのメモリ保持を基本とする（再起動で消える）。
- 将来の多重プロセス対応を見据え、永続化ストア（Redis等）への移行余地を残す。

### 6-6. セキュリティ・運用仕様

- `mock-scan` は `APP_ENV=dev` の場合のみ有効化し、本番では404または起動時エラーとする。
- FastAPI -> GAS呼び出し時に共有シークレットをHTTPヘッダで付与し、GAS側で検証する。
- `.env` の必須項目が欠ける場合、FastAPIは起動しない（fail fast）。
- QR文字列はサニタイズし、許可パターンを `^[A-Za-z0-9]{5,12}$` に固定する（英数字のみ、5〜12文字）。

### 6-7. スプレッドシート列仕様（推奨）

シート名: `attendance_log`

列定義（固定順）:

1. `timestamp`（JST, ISO8601）
2. `user_id`
3. `action`（`出勤` / `退勤` / `退勤（自動補正）`）
4. `source`（`scan` / `auto_fix`）
5. `request_id`
6. `note`（任意）

### 6-8. 受け入れ基準（最低限）

- 正常系:
  - 初回打刻で `success_in`
  - 次回打刻で `success_out`
- 異常系:
  - 3分以内再打刻で `blocked` が返る
  - GAS停止時に `GAS_TIMEOUT` or `GAS_ERROR`
  - 不正IDで `INVALID_USER`
- バッチ:
  - 「出勤のみ」の前日レコードに対し、5時実行で「退勤（自動補正）」が追記される