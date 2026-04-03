# Raspberry Pi（研究室キオスク）デプロイ手順

フロントは **`vite build`** 済みの静的ファイル、API は **127.0.0.1:8000** の uvicorn、外向きは **nginx** が `/` と `/api` を振り分けます。URL はすべて **同一オリジン**（`frontend-kiosk-spec.md` §5）です。

## 前提

- Raspberry Pi OS（Bookworm）想定。`nginx` と `chromium`（または `chromium-browser`）が使えること。
- リポジトリを Pi 上に置く。**以下では置き場所を `INSTALL_ROOT` と書く**（例: `/opt/attendance-management-app` または `~/attendance-management-app`）。

## 1. 依存とビルド

```bash
export INSTALL_ROOT=/opt/attendance-management-app   # 実際のパスに合わせる
cd "$INSTALL_ROOT"

sudo apt update
sudo apt install -y nginx python3-venv python3-full

python3 -m venv .venv
./.venv/bin/pip install -r backend/requirements.txt
```

`backend/.env` を作成（`backend/.env.example` 参照）。**`APP_ENV=prod`**・`GAS_WEBHOOK_URL`・`GAS_SHARED_SECRET` を本番値にする。

フロントの本番ビルド:

```bash
# Node または Bun どちらかで
cd "$INSTALL_ROOT/frontend"
npm ci && npm run build
# または: bun install && bun run build
```

## 2. nginx

```bash
sudo cp "$INSTALL_ROOT/deploy/raspberry-pi/nginx/attendance-kiosk.conf" /etc/nginx/sites-available/attendance-kiosk
sudo sed -i "s|__INSTALL_ROOT__|$INSTALL_ROOT|g" /etc/nginx/sites-available/attendance-kiosk
sudo ln -sf /etc/nginx/sites-available/attendance-kiosk /etc/nginx/sites-enabled/attendance-kiosk
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

`__INSTALL_ROOT__` は上記 `sed` で `frontend/dist` の実パスに置換されます。

## 3. バックエンド（systemd）

ユニット内のパスを Pi の `INSTALL_ROOT` に合わせてから:

```bash
sudo cp "$INSTALL_ROOT/deploy/raspberry-pi/systemd/attendance-backend.service" /etc/systemd/system/attendance-backend.service
sudo sed -i "s|__INSTALL_ROOT__|$INSTALL_ROOT|g" /etc/systemd/system/attendance-backend.service
# 実行ユーザーは pi 以外なら User= / Group= を編集
sudo systemctl daemon-reload
sudo systemctl enable --now attendance-backend.service
curl -sS http://127.0.0.1:8000/api/healthz
```

## 4. Chromium キオスク

Chromium のパスを確認: `which chromium` または `which chromium-browser`。`chromium-kiosk.desktop` の `Exec=` を必要なら修正。

自動起動（ログインするユーザーで、例: `pi`）:

```bash
mkdir -p ~/.config/autostart
cp "$INSTALL_ROOT/deploy/raspberry-pi/chromium-kiosk/attendance-kiosk.desktop" ~/.config/autostart/
# 同上: Exec 内の URL・バイナリパスを環境に合わせて編集してよい
```

キオスク用に **自動ログイン** を有効にする場合は Raspberry Pi OS の「デスクトップ自動ログイン」を設定。

起動 URL は **nginx 経由**の `http://127.0.0.1/`（または `http://localhost/`）を推奨。

## 5. 起動確認

| 項目 | 確認 |
|------|------|
| API | `curl -sS http://127.0.0.1/api/healthz` が `{"ok":true}` |
| フロント | ブラウザで `http://127.0.0.1/` → 打刻タブで可視の ID 入力・scan ボタンが**無い**（本番ビルド） |
| 打刻 | スキャナまたはキーボードで ID 入力 + Enter → スプレッドシートに行が付く |

## 6. 更新手順（簡易）

```bash
cd "$INSTALL_ROOT"
git pull
./.venv/bin/pip install -r backend/requirements.txt
cd frontend && npm run build && cd ..
sudo systemctl restart attendance-backend.service
sudo nginx -t && sudo systemctl reload nginx
```
