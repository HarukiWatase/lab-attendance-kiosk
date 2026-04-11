# スプレッドシート分析セットアップ手順（実装開始版）

本手順は、`attendance_log` から週平均15時間目標を可視化するための最小実装です。

---

## 0. 手作業を減らす実行順（推奨）

Apps Scriptで次の順に実行すると、シート初期化がほぼ自動化される。

1. `rebuildSessionLog()`
2. `setupAnalyticsSheets()`

この2つで `session_log` と `summary_semester` の土台が作成される。

---

## 1. `user_master` の投入

1. `user_master_template.csv` をスプレッドシートにインポート
2. `user_master` シート名に変更
3. 実メンバーに置き換え

---

## 2. `summary_semester` シート作成

`setupAnalyticsSheets()` を実行済みなら、この章の多くは自動設定済み。  
未実行時のみ手動で実施する。

ヘッダ:

- A: `user_id`
- B: `display_name`
- C: `total_hours`
- D: `week_count`
- E: `semester_weekly_avg_hours`
- F: `target_hours`
- G: `gap_hours`
- H: `achievement_rate`
- I: `status`

### 2-1. `user_id` 一覧（A2）

```excel
=SORT(UNIQUE(attendance_log!B2:B))
```

### 2-2. 氏名参照（B2）

```excel
=IFERROR(XLOOKUP(A2, user_master!A:A, user_master!B:B), "未登録")
```

### 2-3. 総時間（C2）

注: ここではまず簡易実装として、別途 `session_log` がある前提の式とする。

```excel
=IFERROR(SUMIFS(session_log!D:D, session_log!A:A, A2), 0)
```

### 2-4. 対象週数（D2）

```excel
=MAX(1, COUNTA(UNIQUE(FILTER(session_log!F:F, session_log!A:A=A2))))
```

### 2-5. 前期週平均（E2）

```excel
=IFERROR(C2/D2, 0)
```

### 2-6. 目標・差分・達成率（F2〜H2）

```excel
=15
```

```excel
=E2-F2
```

```excel
=IFERROR(E2/F2*100, 0)
```

### 2-7. 判定（I2）

```excel
=IFS(E2>=15,"達成",E2>=12,"注意",TRUE,"要改善")
```

2行目の式を必要行までコピー。

---

## 3. `session_log` 自動生成（Apps Script）

1. Apps Scriptで `rebuildSessionLog()` を実行
2. `session_log` シートが自動作成され、以下列が入ることを確認
   - `user_id, in_at, out_at, duration_hours, is_auto_fixed, week_start`
3. 以降、データ確認時は必要に応じて `rebuildSessionLog()` を再実行

---

## 4. 次段階（推奨）

- `summary_weekly` 追加（週ごとの推移）
- 自動補正比率 `auto_fix_ratio` を集計して可視化
