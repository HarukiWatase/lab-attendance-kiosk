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
/** 本番キオスクでは可視入力・ボタンを出さない（docs/specs/frontend-kiosk-spec §2.2 / §3） */
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
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [nowLabel, setNowLabel] = useState(() =>
    new Date().toLocaleString("ja-JP", { hour12: false })
  );
  const scanInputRef = useRef<HTMLInputElement>(null);
  const scannerBufferRef = useRef("");

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
    if (IS_DEV || tab !== "scan") return;

    const keepFocus = () => {
      // Keep hidden capture input focused so keyboard-wedge scanners are always received.
      window.setTimeout(() => scanInputRef.current?.focus(), 0);
    };

    keepFocus();
    window.addEventListener("pointerdown", keepFocus);
    window.addEventListener("focus", keepFocus);
    document.addEventListener("visibilitychange", keepFocus);

    return () => {
      window.removeEventListener("pointerdown", keepFocus);
      window.removeEventListener("focus", keepFocus);
      document.removeEventListener("visibilitychange", keepFocus);
    };
  }, [tab]);

  useEffect(() => {
    if (tab !== "analytics") return;
    const timer = window.setTimeout(() => setTab("scan"), 60000);
    return () => window.clearTimeout(timer);
  }, [tab]);

  useEffect(() => {
    const tick = () => setNowLabel(new Date().toLocaleString("ja-JP", { hour12: false }));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

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
    setLogs((prev) => [log, ...prev].slice(0, 6));
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

  const doScan = async (useMock: boolean, rawInput?: string) => {
    if (state === "processing") return;
    const scannedUserId = pickLikelyUserId(rawInput ?? userId);
    if (!scannedUserId) return;
    const actor = resolveDisplayName(scannedUserId);
    // Clear input immediately to avoid scanner appending next read.
    setUserId("");
    setState("processing");
    try {
      const clientRequestId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const endpoint = useMock ? "/api/mock-scan" : "/api/scan";
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: scannedUserId,
          source: useMock ? "mock" : "scanner",
          client_request_id: clientRequestId
        })
      });
      const body = await res.json();
      if (!res.ok) {
        setUserId("");
        if (res.status === 409) {
          setState("blocked");
          setMessage(
            `連続打刻はできません\n${body?.detail?.cooldown_remaining_sec ?? "?"}秒後にお試しください`
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

  useEffect(() => {
    if (IS_DEV || tab !== "scan") return;

    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Enter") {
        const raw = scannerBufferRef.current;
        scannerBufferRef.current = "";
        if (raw) {
          setUserId(raw);
          void doScan(false, raw);
        }
        return;
      }

      if (e.key === "Backspace") {
        scannerBufferRef.current = scannerBufferRef.current.slice(0, -1);
        return;
      }

      if (e.key.length === 1) {
        scannerBufferRef.current += e.key;
      }
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [tab, state, userId, userDirectory]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f4f4f1] pt-3 md:pt-4 font-sans text-neutral-900">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(24,24,24,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(24,24,24,0.04) 1px, transparent 1px)",
          backgroundSize: "40px 40px"
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.9),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.6),transparent_30%)]"
      />
      <header className="relative border-b border-neutral-300/80 backdrop-blur-[1px]">
        <div
          className={`mx-auto flex w-full flex-col gap-8 md:flex-row md:items-end md:justify-between ${
            IS_DEV
              ? "max-w-6xl px-6 py-10 md:py-12 lg:px-8"
              : "max-w-[96rem] px-10 py-8 md:px-14 md:py-10 lg:px-16"
          }`}
        >
          <div className="animate-fade-in mt-3 md:mt-4">
            <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-[0.28em] text-neutral-400">
              Attendance
            </p>
            <h1
              className={`${
                IS_DEV ? "text-4xl md:text-5xl" : "text-5xl md:text-6xl"
              } font-light tracking-tight text-neutral-900`}
            >
              勤怠
            </h1>
          </div>
          <nav
            className={`flex animate-fade-in ${IS_DEV ? "gap-10 md:gap-12" : "gap-12 md:gap-16"}`}
            style={{ animationDelay: "80ms" }}
          >
            <TabLink active={tab === "scan"} onClick={() => setTab("scan")}>
              打刻
            </TabLink>
            <TabLink active={tab === "analytics"} onClick={() => setTab("analytics")}>
              分析
            </TabLink>
          </nav>
        </div>
      </header>

      <div
        className={`mx-auto w-full ${
          IS_DEV ? "max-w-6xl px-6 lg:px-8" : "max-w-[96rem] px-10 md:px-14 lg:px-16"
        } ${tab === "analytics" ? (IS_DEV ? "py-6 md:py-8" : "py-8 md:py-10") : IS_DEV ? "py-14 md:py-20" : "py-12 md:py-16"}`}
      >
        {tab === "scan" && (
          <div
            key="scan"
            className={`animate-fade-up rounded-2xl border border-neutral-300/80 bg-white/80 shadow-[0_20px_60px_rgba(0,0,0,0.06)] backdrop-blur-[2px] ${
              IS_DEV ? "space-y-16 p-8 md:p-10" : "space-y-16 p-8 md:p-12"
            }`}
          >
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
                    void doScan(false, e.currentTarget.value);
                  }
                }}
                onBlur={() => {
                  if (!IS_DEV && tab === "scan") {
                    window.setTimeout(() => scanInputRef.current?.focus(), 0);
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

            <section className={IS_DEV ? "min-h-[10rem]" : "min-h-[16rem]"}>
              <p
                className={`${
                  IS_DEV ? "max-w-2xl text-3xl md:text-4xl" : "max-w-5xl text-5xl md:text-6xl"
                } whitespace-pre-line font-light leading-snug tracking-tight text-neutral-900 transition-opacity duration-500 ease-out ${
                  state === "processing" ? "opacity-45" : "opacity-100"
                }`}
              >
                {hint}
              </p>
              {IS_DEV && (
                <p className="mt-8 text-xs tracking-wider text-neutral-400">state · {state}</p>
              )}
            </section>

            <section className={`border-t border-neutral-300/70 ${IS_DEV ? "pt-12" : "pt-14"}`}>
              <h2 className="mb-8 text-[0.65rem] font-medium uppercase tracking-[0.22em] text-neutral-400">
                直近の記録
              </h2>
              {logs.length === 0 ? (
                <p className={`${IS_DEV ? "text-sm" : "text-base md:text-lg"} font-light text-neutral-400`}>
                  記録はまだありません
                </p>
              ) : (
                <ul className="space-y-0 divide-y divide-neutral-200/90">
                  {logs.map((log, idx) => (
                    <li
                      key={`${log.at}-${idx}`}
                      className={`flex flex-wrap items-baseline justify-between gap-4 transition-colors duration-300 first:pt-0 ${
                        IS_DEV ? "py-4 text-sm" : "py-5 text-base md:text-lg"
                      }`}
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
          <div
            key="analytics"
            className={`animate-fade-up rounded-2xl border border-neutral-300/80 bg-white/80 shadow-[0_20px_60px_rgba(0,0,0,0.06)] backdrop-blur-[2px] ${
              IS_DEV ? "space-y-5 p-6 md:p-8" : "space-y-8 p-8 md:p-10"
            }`}
          >
            {viewDataError && (
              <div
                className={`border-l-2 border-red-600 bg-red-50/60 transition-opacity duration-500 text-red-950 ${
                  IS_DEV ? "py-2 pl-3 pr-4 text-xs" : "py-3 pl-4 pr-5 text-sm md:text-base"
                }`}
                role="alert"
              >
                {viewDataError}
              </div>
            )}

            <section className={`border-b border-neutral-300/70 ${IS_DEV ? "pb-4" : "pb-6"}`}>
              <div className={`flex flex-wrap items-end justify-between ${IS_DEV ? "gap-3 gap-y-2" : "gap-5 gap-y-3"}`}>
                <div>
                  <p
                    className={`font-medium uppercase tracking-[0.2em] text-neutral-400 ${
                      IS_DEV ? "text-[0.6rem]" : "text-xs md:text-sm"
                    }`}
                  >
                    週次平均 · 暦週（月曜始まり）
                    {weekStartLabel ? ` · ${weekStartLabel}〜` : ""}
                  </p>
                  <div className={`mt-1 flex items-baseline tabular-nums ${IS_DEV ? "gap-2" : "gap-3"}`}>
                    <span className={`${IS_DEV ? "text-3xl md:text-4xl" : "text-5xl md:text-6xl"} font-light tracking-tight`}>
                      {teamAvg}
                    </span>
                    <span className={`${IS_DEV ? "text-sm" : "text-lg md:text-xl"} font-light text-neutral-400`}>
                      / {TARGET_HOURS}h
                    </span>
                  </div>
                </div>
                <div className={`min-h-px flex-1 basis-full sm:basis-0 ${IS_DEV ? "min-w-[8rem] sm:pb-1" : "min-w-[14rem] sm:pb-2"}`}>
                  <div className={`${IS_DEV ? "h-px" : "h-1.5 md:h-2"} w-full overflow-hidden bg-neutral-200`}>
                    <div
                      className="h-full bg-neutral-900 transition-[width] duration-700 ease-smooth"
                      style={{ width: `${teamProgress}%` }}
                    />
                  </div>
                </div>
              </div>
              <p className={`mt-2 leading-snug text-neutral-400 ${IS_DEV ? "text-[0.65rem]" : "text-sm md:text-base"}`}>
                週15hは目安。教授向け月次とは別指標。
                {SHOW_DEMO_FALLBACK ? " 開発時はデモ表示の場合あり。" : ""}
              </p>
            </section>

            <section className="rounded-xl border border-neutral-200/90 bg-white/85 p-4 md:p-5">
              <h2
                className={`font-medium uppercase tracking-[0.2em] text-neutral-400 ${
                  IS_DEV ? "mb-2 text-[0.6rem]" : "mb-3 text-xs md:text-sm"
                }`}
              >
                ユーザー別 · 今週
              </h2>
              <div className="overflow-x-auto">
                <table
                  className={`w-full border-collapse text-left ${IS_DEV ? "min-w-[20rem] text-sm" : "min-w-[48rem] text-base md:text-lg"}`}
                >
                  <thead>
                    <tr
                      className={`border-b border-neutral-200 font-medium uppercase tracking-wider text-neutral-400 ${
                        IS_DEV ? "text-[0.55rem]" : "text-[0.7rem] md:text-xs"
                      }`}
                    >
                      <th className="pb-1.5 pr-2 font-medium">ユーザー</th>
                      <th className="pb-1.5 pr-2 font-normal">ID</th>
                      <th className="pb-1.5 pr-3 text-right font-normal whitespace-nowrap">時間</th>
                      <th className={`pb-1.5 font-normal ${IS_DEV ? "sm:w-[36%]" : "sm:w-[44%]"}`}>目安</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAnalytics.map((row) => {
                      const p = Math.min(100, Math.round((row.weekTotalHours / TARGET_HOURS) * 100));
                      const status =
                        row.weekTotalHours >= 15 ? "達成" : row.weekTotalHours >= 12 ? "注意" : "要改善";
                      const barTone =
                        status === "達成"
                          ? "bg-neutral-900"
                          : status === "注意"
                            ? "bg-neutral-600"
                            : "bg-neutral-400";
                      return (
                        <tr key={row.userId} className="border-b border-neutral-100 last:border-0">
                          <td className={`truncate pr-2 font-medium text-neutral-900 ${IS_DEV ? "max-w-[7rem] py-1" : "max-w-[14rem] py-2"}`}>
                            {row.displayName}
                          </td>
                          <td
                            className={`whitespace-nowrap pr-2 font-mono text-neutral-500 ${
                              IS_DEV ? "py-1 text-[0.7rem]" : "py-2 text-[0.9rem] md:text-base"
                            }`}
                          >
                            {row.userId}
                          </td>
                          <td className={`pr-3 text-right tabular-nums ${IS_DEV ? "py-1" : "py-2"}`}>
                            <span>{row.weekTotalHours}h</span>
                            <span className={`ml-1.5 text-neutral-400 ${IS_DEV ? "text-[0.6rem]" : "text-xs md:text-sm"}`}>
                              {status}
                            </span>
                          </td>
                          <td className={`align-middle ${IS_DEV ? "py-1" : "py-2"}`}>
                            <div className={`${IS_DEV ? "h-px" : "h-1.5 md:h-2"} overflow-hidden bg-neutral-200`}>
                              <div
                                className={`h-full ${barTone} transition-[width] duration-700 ease-smooth`}
                                style={{ width: `${p}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
      {!IS_DEV && tab === "scan" && (
        <aside className="fixed bottom-5 right-5 z-20 w-[19rem] rounded-xl border border-neutral-300/80 bg-white/95 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.16)] backdrop-blur-[3px] md:bottom-7 md:right-7 md:w-[22rem]">
          <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">状態監視</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
              <dt className="text-[0.65rem] uppercase tracking-[0.16em] text-neutral-400">処理状態</dt>
              <dd className="mt-1 text-lg font-medium text-neutral-900">
                {state === "processing"
                  ? "送信中"
                  : state === "error"
                    ? "エラー"
                    : state === "blocked"
                      ? "クールダウン"
                      : "待機中"}
              </dd>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
              <dt className="text-[0.65rem] uppercase tracking-[0.16em] text-neutral-400">ネットワーク</dt>
              <dd className="mt-1 text-lg font-medium text-neutral-900">{isOnline ? "オンライン" : "オフライン"}</dd>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
              <dt className="text-[0.65rem] uppercase tracking-[0.16em] text-neutral-400">現在時刻</dt>
              <dd className="mt-1 text-lg font-medium tabular-nums text-neutral-900">{nowLabel}</dd>
            </div>
          </dl>
        </aside>
      )}
    </main>
  );
}
