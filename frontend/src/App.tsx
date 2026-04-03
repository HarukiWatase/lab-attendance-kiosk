import { useEffect, useMemo, useRef, useState } from "react";

type ViewState =
  | "idle"
  | "processing"
  | "success_in"
  | "success_out"
  | "blocked"
  | "error";

type ScanResponse = {
  ok: boolean;
  result: ViewState;
  message: string;
  user_id: string;
  action: string | null;
  cooldown_remaining_sec: number | null;
  request_id: string;
  server_time: string;
};

type Tab = "scan" | "analytics";

type AnalyticsRow = {
  userId: string;
  displayName: string;
  /** 暦週（月曜始まり）の在室合計時間（h） */
  weekTotalHours: number;
};

type ScanLog = {
  at: string;
  actor: string;
  result: ViewState;
  action: string | null;
};

const API_BASE = "";
/** 本番キオスクでは可視入力・ボタンを出さない（frontend-kiosk-spec §2.2 / §3） */
const IS_DEV = import.meta.env.DEV;
const CAN_USE_MOCK = IS_DEV;
const TARGET_HOURS = 15;
const SHOW_DEMO_FALLBACK = IS_DEV;

const defaultAnalytics: AnalyticsRow[] = [
  { userId: "A10001", displayName: "山田 太郎", weekTotalHours: 12.5 },
  { userId: "A10002", displayName: "佐藤 花子", weekTotalHours: 9.0 },
  { userId: "A10003", displayName: "鈴木 次郎", weekTotalHours: 4.5 },
  { userId: "A10004", displayName: "高橋 愛", weekTotalHours: 15.0 },
  { userId: "A10005", displayName: "伊藤 健", weekTotalHours: 11.0 },
  { userId: "A10006", displayName: "渡辺 翼", weekTotalHours: 14.0 },
  { userId: "A10007", displayName: "中村 明", weekTotalHours: 6.0 },
  { userId: "A10008", displayName: "小林 陽", weekTotalHours: 16.0 },
  { userId: "A10009", displayName: "加藤 美咲", weekTotalHours: 10.0 },
  { userId: "A10010", displayName: "吉田 悠", weekTotalHours: 15.0 },
  { userId: "A10011", displayName: "山本 陸", weekTotalHours: 8.0 },
  { userId: "A10012", displayName: "松本 彩", weekTotalHours: 3.0 },
  { userId: "A10013", displayName: "井上 蓮", weekTotalHours: 13.0 },
  { userId: "A10014", displayName: "木村 華", weekTotalHours: 7.5 }
];

const defaultUserDirectory: Record<string, string> = {
  A12345: "山田 太郎",
  A12346: "佐藤 花子",
  B67891: "鈴木 次郎",
  ...Object.fromEntries(defaultAnalytics.map((u) => [u.userId, u.displayName]))
};

export default function App() {
  const [tab, setTab] = useState<Tab>("scan");
  const [state, setState] = useState<ViewState>("idle");
  const [userId, setUserId] = useState("");
  const [message, setMessage] = useState("▶ QRコードを かざしてね");
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [analyticsRows, setAnalyticsRows] = useState<AnalyticsRow[]>(
    SHOW_DEMO_FALLBACK ? defaultAnalytics : []
  );
  const [userDirectory, setUserDirectory] = useState<Record<string, string>>(
    SHOW_DEMO_FALLBACK ? defaultUserDirectory : {}
  );
  const [viewDataError, setViewDataError] = useState("");
  const [weekStartLabel, setWeekStartLabel] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);

  const hint = useMemo(() => {
    if (state === "processing") return "つうしんちゅう...";
    return message;
  }, [state, message]);

  const teamAvg = useMemo(() => {
    if (analyticsRows.length === 0) return 0;
    const sum = analyticsRows.reduce((acc, cur) => acc + cur.weekTotalHours, 0);
    return Number((sum / analyticsRows.length).toFixed(1));
  }, [analyticsRows]);
  const teamProgress = Math.min(100, Math.round((teamAvg / TARGET_HOURS) * 100));
  const sortedAnalytics = useMemo(
    () => [...analyticsRows].sort((a, b) => b.weekTotalHours - a.weekTotalHours),
    [analyticsRows]
  );

  useEffect(() => {
    if (tab === "scan") {
      scanInputRef.current?.focus();
    }
  }, [tab, state]);

  useEffect(() => {
    if (tab !== "analytics") return;
    const timer = window.setTimeout(() => setTab("scan"), 60000);
    return () => window.clearTimeout(timer);
  }, [tab]);

  useEffect(() => {
    const loadUsersOnly = async () => {
      try {
        const usersRes = await fetch(`${API_BASE}/api/view/users`);
        if (!usersRes.ok) return;
        const rows = (await usersRes.json()) as Array<{
          user_id: string;
          display_name: string;
          active: boolean;
        }>;
        const directory: Record<string, string> = {};
        rows.forEach((r) => {
          if (r.active) directory[r.user_id] = r.display_name;
        });
        setUserDirectory(directory);
      } catch {
        /* 打刻表示名は user_id フォールバック */
      }
    };
    void loadUsersOnly();
  }, []);

  useEffect(() => {
    if (tab !== "analytics") return;

    const loadWeekAnalytics = async () => {
      let hasError = false;
      try {
        const res = await fetch(`${API_BASE}/api/view/analytics/week-calendar`);
        if (!res.ok) {
          hasError = true;
        } else {
          const body = (await res.json()) as {
            week_start: string;
            items: Array<{ user_id: string; display_name: string; week_total_hours: number }>;
          };
          setWeekStartLabel(body.week_start || "");
          setAnalyticsRows(
            (body.items || []).map((r) => ({
              userId: r.user_id,
              displayName: r.display_name,
              weekTotalHours: Number(r.week_total_hours || 0)
            }))
          );
        }
      } catch {
        hasError = true;
      }
      if (hasError) {
        setViewDataError("分析データの取得に失敗しました。表示内容を確認してください。");
      } else {
        setViewDataError("");
      }
    };

    void loadWeekAnalytics();
  }, [tab]);

  const resetLater = () => {
    window.setTimeout(() => {
      setState("idle");
      setMessage("▶ QRコードを かざしてね");
    }, 3000);
  };

  const pushLog = (log: ScanLog) => {
    setLogs((prev) => [log, ...prev].slice(0, 3));
  };

  const normalizeUserId = (raw: string) =>
    raw
      .normalize("NFKC")
      .replace(/\s+/g, "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase();

  const pickLikelyUserId = (raw: string) => {
    const normalized = normalizeUserId(raw);
    if (!normalized) return "";

    if (normalized.length < 5 || normalized.length > 12) return "";
    return normalized;
  };

  const resolveDisplayName = (id: string) => userDirectory[id] ?? id;

  const doScan = async (useMock: boolean) => {
    if (state === "processing") return;
    const scannedUserId = pickLikelyUserId(userId);
    if (!scannedUserId) return;
    const actor = resolveDisplayName(scannedUserId);
    // Clear input immediately to avoid scanner appending next read.
    setUserId("");
    setState("processing");
    try {
      const endpoint = useMock ? "/api/mock-scan" : "/api/scan";
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: scannedUserId, source: useMock ? "mock" : "scanner" })
      });
      const body = await res.json();
      if (!res.ok) {
        setUserId("");
        if (res.status === 409) {
          setState("blocked");
          setMessage(
            `${actor} は れんぞく だこく は できないよ。あと ${body?.detail?.cooldown_remaining_sec ?? "?"} びょう まってね`
          );
          pushLog({
            at: new Date().toLocaleTimeString("ja-JP"),
            actor,
            result: "blocked",
            action: null
          });
        } else {
          setState("error");
          setMessage(body?.detail?.message ?? "つうしんエラー");
          pushLog({
            at: new Date().toLocaleTimeString("ja-JP"),
            actor,
            result: "error",
            action: null
          });
        }
        resetLater();
        return;
      }
      const data = body as ScanResponse;
      const displayName = resolveDisplayName(data.user_id);
      const resultMessage =
        data.result === "success_in"
          ? `${displayName} が けんきゅうしつ に あらわれた！`
          : data.result === "success_out"
            ? `${displayName} は 研究を終えた`
            : data.message;
      setState(data.result);
      setMessage(resultMessage);
      pushLog({
        at: new Date().toLocaleTimeString("ja-JP"),
        actor: displayName,
        result: data.result,
        action: data.action
      });
      resetLater();
    } catch {
      setUserId("");
      setState("error");
      setMessage("つうしん エラー");
      pushLog({
        at: new Date().toLocaleTimeString("ja-JP"),
        actor,
        result: "error",
        action: null
      });
      resetLater();
    }
  };

  return (
    <main className="min-h-screen text-white p-6 font-dot mc-bg">
      <div className="mx-auto max-w-3xl pixel-panel p-6">
        <h1 className="text-3xl mb-6 text-emerald-200 drop-shadow">勤怠管理システム</h1>
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setTab("scan")}
            className={`pixel-btn px-4 py-2 ${tab === "scan" ? "pixel-btn-active" : ""}`}
          >
            打刻
          </button>
          <button
            onClick={() => setTab("analytics")}
            className={`pixel-btn px-4 py-2 ${tab === "analytics" ? "pixel-btn-active" : ""}`}
          >
            分析
          </button>
        </div>

        {tab === "scan" && (
          <>
            <div className={IS_DEV ? "mb-4 flex gap-2 items-center flex-wrap" : ""}>
              {IS_DEV && <label htmlFor="scan-capture">ユーザーID</label>}
              {/*
                本番: スキャナ（キーボードウェッジ）用の非表示フォーカス要素。CR+LF 想定で Enter 確定（§2.3）。
              */}
              <input
                id="scan-capture"
                ref={scanInputRef}
                type="text"
                name="scan-capture"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label={IS_DEV ? undefined : "QRコードスキャナ入力"}
                className={IS_DEV ? "pixel-input px-3 py-2" : "sr-only"}
                value={userId}
                disabled={state === "processing"}
                maxLength={12}
                onChange={(e) => {
                  if (state === "processing") return;
                  setUserId(pickLikelyUserId(e.target.value));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void doScan(false);
                  }
                }}
              />
              {IS_DEV && (
                <>
                  <button
                    onClick={() => void doScan(false)}
                    disabled={state === "processing"}
                    className="pixel-btn px-4 py-2 disabled:opacity-50"
                  >
                    scan
                  </button>
                  {CAN_USE_MOCK && (
                    <button
                      onClick={() => void doScan(true)}
                      disabled={state === "processing"}
                      className="pixel-btn px-4 py-2 disabled:opacity-50"
                    >
                      mock scan
                    </button>
                  )}
                </>
              )}
            </div>
            <section className="mt-8 pixel-panel p-4 min-h-24">
              <p className="text-[28px] leading-tight">{hint}</p>
              {IS_DEV && <p className="mt-3 text-sm text-zinc-300">state: {state}</p>}
            </section>
            <section className="mt-4 pixel-panel p-4">
              <h2 className="mb-2 text-lg">直近ログ（3件）</h2>
              {logs.length === 0 ? (
                <p className="text-zinc-400">まだログがありません</p>
              ) : (
                <div className="space-y-1 text-base">
                  {logs.map((log, idx) => (
                    <p key={`${log.at}-${idx}`}>
                      {log.at} / {log.actor} / {log.result}
                      {log.action ? ` (${log.action})` : ""}
                    </p>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {tab === "analytics" && (
          <section className="space-y-4">
            {viewDataError && (
              <div className="pixel-panel p-3 border border-red-500/70 text-red-200 text-sm">
                {viewDataError}
              </div>
            )}
            <div className="pixel-panel p-4">
              <p className="text-sm text-zinc-300 mb-2">
                今週のチーム平均（月曜始まり暦週の合計）
                {weekStartLabel ? ` · 週: ${weekStartLabel}〜` : ""}
              </p>
              <p className="text-xl mb-2">
                {teamAvg}h / {TARGET_HOURS}h
              </p>
              <div className="w-full h-4 pixel-track">
                <div className="h-full pixel-fill-green" style={{ width: `${teamProgress}%` }} />
              </div>
              <p className="text-xs text-zinc-400 mt-2">
                ※ 週15hは目安。教授向け月次の判定とは別指標です。
              </p>
              {SHOW_DEMO_FALLBACK && (
                <p className="text-xs text-zinc-400 mt-2">※ 開発モードではデモ表示になる場合があります。</p>
              )}
            </div>
            <div className="pixel-panel p-4">
              <h2 className="mb-3">ユーザー別 今週の在室（15h目安）</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                {sortedAnalytics.map((row) => {
                  const p = Math.min(100, Math.round((row.weekTotalHours / TARGET_HOURS) * 100));
                  const status = row.weekTotalHours >= 15 ? "達成" : row.weekTotalHours >= 12 ? "注意" : "要改善";
                  const color =
                    status === "達成"
                      ? "pixel-fill-green"
                      : status === "注意"
                        ? "pixel-fill-yellow"
                        : "pixel-fill-red";
                  return (
                    <div key={row.userId} className="border border-zinc-600 p-2 bg-black/20">
                      <div className="flex justify-between text-[13px] mb-1 leading-tight gap-2">
                        <span className="truncate">
                          {row.displayName} ({row.userId})
                        </span>
                        <span className="whitespace-nowrap">
                          {row.weekTotalHours}h / {status}
                        </span>
                      </div>
                      <div className="w-full h-2.5 pixel-track">
                        <div className={`h-full ${color}`} style={{ width: `${p}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
