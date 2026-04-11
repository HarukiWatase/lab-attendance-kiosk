# ドキュメント索引

勤怠システムの仕様・運用・説明資料は **`docs/` 以下**にまとめています。リポジトリ直下に散らばっていた Markdown は整理済みです。

## クイックリンク

| 読みたい内容 | ファイル |
|--------------|----------|
| **全体の要求仕様・API 概要** | [specs/guide.md](./specs/guide.md) |
| **運用をフェーズ別に進める** | [operations/phased-guide.md](./operations/phased-guide.md) |
| **Raspberry Pi 本番（nginx / systemd / キオスク）** | [../deploy/raspberry-pi/README.md](../deploy/raspberry-pi/README.md) |
| **研究室向けスライド（Marp）** | [presentations/lab-attendance-slides.md](./presentations/lab-attendance-slides.md) |

---

## `docs/specs/` — 仕様・アーキテクチャ

| ファイル | 内容 |
|----------|------|
| [guide.md](./specs/guide.md) | 要求仕様書（UI・API・GAS・スプレッドシート） |
| [architecture-and-review-scope.md](./specs/architecture-and-review-scope.md) | アーキテクチャとレビュー範囲 |
| [display-ui-spec.md](./specs/display-ui-spec.md) | 表示 UI・文言 |
| [frontend-kiosk-spec.md](./specs/frontend-kiosk-spec.md) | キオスク（ラズパイ）フロントの挙動 |

---

## `docs/professor/` — 教授向けダッシュボード

| ファイル | 内容 |
|----------|------|
| [dashboard-spec-and-manual.md](./professor/dashboard-spec-and-manual.md) | 教授シートの仕様と操作 |
| [monthly-dashboard-design.md](./professor/monthly-dashboard-design.md) | 月次ダッシュボード設計 |
| [monthly-dashboard-implementation-design.md](./professor/monthly-dashboard-implementation-design.md) | 実装設計（GAS 契約など） |

---

## `docs/operations/` — 運用・チェックリスト・改善

| ファイル | 内容 |
|----------|------|
| [phased-guide.md](./operations/phased-guide.md) | フェーズ別運用ガイド |
| [semester-transition-runbook.md](./operations/semester-transition-runbook.md) | 前期・後期切替チェックリスト |
| [summary-semester-vs-professor-metrics.md](./operations/summary-semester-vs-professor-metrics.md) | 集計の正データ（教授 vs summary_semester） |
| [gas-triggers-and-clasp.md](./operations/gas-triggers-and-clasp.md) | トリガー設定と clasp の限界 |
| [spreadsheet-lifecycle-protection.md](./operations/spreadsheet-lifecycle-protection.md) | ログ寿命・シート保護・索引 |
| [analytics-plan.md](./operations/analytics-plan.md) | 分析・運用計画 |
| [spreadsheet-analytics-setup.md](./operations/spreadsheet-analytics-setup.md) | スプレッドシート分析セットアップ |
| [user-id-name-mapping-guide.md](./operations/user-id-name-mapping-guide.md) | ユーザー ID と氏名の対応 |
| [next-actions-checklist.md](./operations/next-actions-checklist.md) | 次アクション一覧 |
| [remaining-improvements.md](./operations/remaining-improvements.md) | 残課題・改善リスト |

---

## `docs/guides/` — 実装手順

| ファイル | 内容 |
|----------|------|
| [implementation-procedure.md](./guides/implementation-procedure.md) | 実装手順（フロント→バックエンド→GAS→Pi） |

---

## `docs/presentations/` — 説明用

| ファイル | 内容 |
|----------|------|
| [lab-attendance-slides.md](./presentations/lab-attendance-slides.md) | 研究室説明用スライド（Marp） |

---

## コード・デプロイ（参考）

| 場所 | 内容 |
|------|------|
| `frontend/` | React + Vite キオスク UI |
| `backend/` | FastAPI |
| `gas/src/main.ts` | Apps Script ソース（TypeScript、`clasp push` 前に `npm run build`） |
| `deploy/raspberry-pi/` | Pi 用 nginx / systemd / Chromium 設定例 |

旧パス（ルートにあった `guide.md` や `operations-phased-guide.md` など）は削除し、上記へ移動しました。ブックマークや外部リンクがある場合は更新してください。
