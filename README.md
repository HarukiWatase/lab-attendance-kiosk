# 研究室勤怠管理システム

QR コード（ユーザー ID）で研究室の入室・退室を記録し、**Google スプレッドシート**に蓄積するシステムです。

## 構成

| ディレクトリ | 役割 |
|--------------|------|
| `frontend/` | React + TypeScript + Vite + Tailwind（キオスク UI） |
| `backend/` | FastAPI（打刻 API・GAS 中継） |
| `gas/` | Google Apps Script（スプレッドシート連携） |
| `deploy/raspberry-pi/` | Raspberry Pi 本番向け nginx / systemd / Chromium の例 |

## ドキュメント

**仕様・運用・スライドはすべて [`docs/README.md`](docs/README.md) から辿れます。**

- 要求仕様・API: [`docs/specs/guide.md`](docs/specs/guide.md)
- 運用フェーズ: [`docs/operations/phased-guide.md`](docs/operations/phased-guide.md)
- Pi デプロイ: [`deploy/raspberry-pi/README.md`](deploy/raspberry-pi/README.md)

## 開発（例）

```bash
# バックエンド
cd backend && python -m venv ../.venv && ../.venv/bin/pip install -r requirements.txt
# .env を用意のうえ
../.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# フロント（別ターミナル）
cd frontend && npm install && npm run dev
```

フロントは開発時 `http://localhost:5173` から `/api` をプロキシします（`vite.config.ts` 参照）。

## ライセンス・秘密情報

- `backend/.env` や GAS の共有秘密は **リポジトリに含めない**でください（`.gitignore` 済み）。
