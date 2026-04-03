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

function TabLink({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative pb-3 text-sm font-medium tracking-[0.12em] transition-colors duration-300 ease-out ${
        active ? "text-neutral-900" : "text-neutral-400 hover:text-neutral-600"
      }`}
    >
      {children}
      <span
        className={`absolute bottom-0 left-0 right-0 h-px origin-left bg-neutral-900 transition-transform duration-500 ease-smooth ${
          active ? "scale-x-100" : "scale-x-0"
        }`}
        aria-hidden
      />
    </button>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("scan");
  const [state, setState] = useState<ViewState>("idle");
  const [userId, setUserId] = useState("");
  const [message, setMessage] = useState("QRコードをかざしてください");
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
    if (state === "processing") return "処理しています";
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
        setViewDataError("データを取得できませんでした。");
      } else {
        setViewDataError("");
      }
    };

    void loadWeekAnalytics();
  }, [tab]);

  const resetLater = () => {
    window.setTimeout(() => {
      setState("idle");
      setMessage("QRコードをかざしてください");
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
            `連続打刻はできません。${body?.detail?.cooldown_remaining_sec ?? "?"}秒後にお試しください。`
          );
          pushLog({
            at: new Date().toLocaleTimeString("ja-JP"),
            actor,
            result: "blocked",
            action: null
          });
        } else {
          setState("error");
          setMessage(body?.detail?.message ?? "通信エラーが発生しました。");
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
          ? `${displayName} — 入室を記録しました`
          : data.result === "success_out"
            ? `${displayName} — 退室を記録しました`
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
      setMessage("通信エラーが発生しました。");
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
    <main className="min-h-screen bg-[#f7f7f5] font-sans text-neutral-900">
      <header className="border-b border-neutral-200/90">
        <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-12 md:flex-row md:items-end md:justify-between md:py-14 lg:px-8">
          <div className="animate-fade-in">
            <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-[0.28em] text-neutral-400">
              Attendance
            </p>
            <h1 className="text-4xl font-light tracking-tight text-neutral-900 md:text-5xl">勤怠</h1>
          </div>
          <nav className="flex gap-10 md:gap-12 animate-fade-in" style={{ animationDelay: "80ms" }}>
            <TabLink active={tab === "scan"} onClick={() => setTab("scan")}>
              打刻
            </TabLink>
            <TabLink active={tab === "analytics"} onClick={() => setTab("analytics")}>
              分析
            </TabLink>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-14 md:py-20 lg:px-8">
        {tab === "scan" && (
          <div key="scan" className="animate-fade-up space-y-16">
            <div className={IS_DEV ? "flex flex-wrap items-end gap-6 border-b border-neutral-200/80 pb-8" : ""}>
              {IS_DEV && (
                <label htmlFor="scan-capture" className="text-xs font-medium tracking-wider text-neutral-500">
                  ユーザーID
                </label>
              )}
              <input
                id="scan-capture"
                ref={scanInputRef}
                type="text"
                name="scan-capture"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label={IS_DEV ? undefined : "QRコードスキャナ入力"}
                className={IS_DEV ? "input-minimal" : "sr-only"}
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
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void doScan(false)}
                    disabled={state === "processing"}
                    className="border border-neutral-900 bg-neutral-900 px-6 py-2.5 text-xs font-medium tracking-wider text-white transition-all duration-300 ease-out hover:bg-neutral-800 disabled:opacity-35"
                  >
                    Scan
                  </button>
                  {CAN_USE_MOCK && (
                    <button
                      type="button"
                      onClick={() => void doScan(true)}
                      disabled={state === "processing"}
                      className="border border-neutral-300 bg-transparent px-6 py-2.5 text-xs font-medium tracking-wider text-neutral-700 transition-all duration-300 ease-out hover:border-neutral-900 hover:text-neutral-900 disabled:opacity-35"
                    >
                      Mock
                    </button>
                  )}
                </div>
              )}
            </div>

            <section className="min-h-[10rem]">
              <p
                className={`max-w-2xl text-3xl font-light leading-snug tracking-tight text-neutral-900 transition-opacity duration-500 ease-out md:text-4xl ${
                  state === "processing" ? "opacity-45" : "opacity-100"
                }`}
              >
                {hint}
              </p>
              {IS_DEV && (
                <p className="mt-8 text-xs tracking-wider text-neutral-400">state · {state}</p>
              )}
            </section>

            <section className="border-t border-neutral-200/90 pt-12">
              <h2 className="mb-8 text-[0.65rem] font-medium uppercase tracking-[0.22em] text-neutral-400">
                直近の記録
              </h2>
              {logs.length === 0 ? (
                <p className="text-sm font-light text-neutral-400">記録はまだありません</p>
              ) : (
                <ul className="space-y-0 divide-y divide-neutral-200/90">
                  {logs.map((log, idx) => (
                    <li
                      key={`${log.at}-${idx}`}
                      className="flex flex-wrap items-baseline justify-between gap-4 py-4 text-sm transition-colors duration-300 first:pt-0"
                    >
                      <span className="tabular-nums text-neutral-400">{log.at}</span>
                      <span className="flex-1 font-medium text-neutral-800">{log.actor}</span>
                      <span className="text-xs tracking-wider text-neutral-500">
                        {log.result}
                        {log.action ? ` · ${log.action}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {tab === "analytics" && (
          <div key="analytics" className="animate-fade-up space-y-16">
            {viewDataError && (
              <div
                className="border-l-2 border-red-600 bg-red-50/60 py-4 pl-5 pr-6 text-sm text-red-950 transition-opacity duration-500"
                role="alert"
              >
                {viewDataError}
              </div>
            )}

            <section className="space-y-8">
              <div>
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-neutral-400">
                  週次 · チーム平均
                </p>
                <p className="mt-2 text-sm text-neutral-500">
                  月曜始まりの暦週
                  {weekStartLabel ? ` · ${weekStartLabel}〜` : ""}
                </p>
              </div>
              <div className="flex items-baseline gap-3 tabular-nums">
                <span className="text-5xl font-light tracking-tight md:text-6xl">{teamAvg}</span>
                <span className="text-lg font-light text-neutral-400">/</span>
                <span className="text-lg font-light text-neutral-400">{TARGET_HOURS}h</span>
              </div>
              <div className="h-px w-full overflow-hidden bg-neutral-200">
                <div
                  className="h-full bg-neutral-900 transition-[width] duration-700 ease-smooth"
                  style={{ width: `${teamProgress}%` }}
                />
              </div>
              <p className="max-w-xl text-xs leading-relaxed text-neutral-400">
                週15hは目安です。教授向け月次の判定とは別の指標です。
              </p>
              {SHOW_DEMO_FALLBACK && (
                <p className="text-xs text-neutral-400">開発モードではデモデータが表示される場合があります。</p>
              )}
            </section>

            <section>
              <h2 className="mb-10 text-[0.65rem] font-medium uppercase tracking-[0.22em] text-neutral-400">
                ユーザー別 · 今週の在室
              </h2>
              <div className="grid grid-cols-1 gap-px bg-neutral-200/80 md:grid-cols-2">
                {sortedAnalytics.map((row) => {
                  const p = Math.min(100, Math.round((row.weekTotalHours / TARGET_HOURS) * 100));
                  const status = row.weekTotalHours >= 15 ? "達成" : row.weekTotalHours >= 12 ? "注意" : "要改善";
                  const barTone =
                    status === "達成"
                      ? "bg-neutral-900"
                      : status === "注意"
                        ? "bg-neutral-600"
                        : "bg-neutral-400";
                  return (
                    <div
                      key={row.userId}
                      className="group bg-[#f7f7f5] p-8 transition-colors duration-300 ease-out hover:bg-white"
                    >
                      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="text-base font-medium tracking-tight text-neutral-900">{row.displayName}</p>
                          <p className="mt-1 text-xs tabular-nums tracking-wider text-neutral-400">{row.userId}</p>
                        </div>
                        <div className="text-right tabular-nums">
                          <span className="text-2xl font-light">{row.weekTotalHours}</span>
                          <span className="ml-1 text-sm font-light text-neutral-400">h</span>
                          <p className="mt-1 text-[0.65rem] tracking-wider text-neutral-500">{status}</p>
                        </div>
                      </div>
                      <div className="h-px w-full overflow-hidden bg-neutral-200">
                        <div
                          className={`h-full ${barTone} transition-[width] duration-700 ease-smooth`}
                          style={{ width: `${p}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
