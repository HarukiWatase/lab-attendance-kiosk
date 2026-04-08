const SHEET_NAME = "attendance_log";
const TZ = "Asia/Tokyo";
const USER_ID_REGEX = /^[A-Za-z0-9]{5,12}$/;

function doGet(e) {
  try {
    const secret = PropertiesService.getScriptProperties().getProperty("GAS_SHARED_SECRET");
    const given = (e && e.parameter && e.parameter.shared_secret) || "";
    if (!secret || given !== secret) {
      return jsonResponse({ ok: false, error_code: "UNAUTHORIZED", message: "unauthorized" });
    }

    const mode = (e && e.parameter && e.parameter.mode) || "";
    if (mode === "analytics_semester") {
      return jsonResponse({ ok: true, items: getSemesterAnalyticsItems() });
    }
    if (mode === "analytics_week_calendar") {
      const weekStart = getCurrentCalendarWeekStartYmd();
      return jsonResponse({ ok: true, week_start: weekStart, items: getWeeklyCalendarAnalyticsItems(weekStart) });
    }
    if (mode === "users") {
      return jsonResponse({ ok: true, items: getUserDirectoryItems() });
    }
    if (mode === "request_status") {
      const requestId = (e && e.parameter && e.parameter.request_id) || "";
      if (!requestId) {
        return jsonResponse({ ok: false, error_code: "BAD_REQUEST", message: "request_id is required" });
      }
      const found = getRequestStatusByRequestId(getSheet(), requestId);
      if (!found) {
        return jsonResponse({ ok: true, found: false, request_id: requestId });
      }
      return jsonResponse({
        ok: true,
        found: true,
        request_id: requestId,
        action: found.action,
        timestamp: found.timestamp,
        message: "request found"
      });
    }
    return jsonResponse({ ok: false, error_code: "BAD_REQUEST", message: "unsupported mode" });
  } catch (err) {
    return jsonResponse({ ok: false, error_code: "INTERNAL_ERROR", message: String(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const body = parseRequestBody(e);
    const secret = PropertiesService.getScriptProperties().getProperty("GAS_SHARED_SECRET");
    if (!secret || body.shared_secret !== secret) {
      return jsonResponse({ ok: false, error_code: "UNAUTHORIZED", message: "unauthorized" });
    }
    const userId = body.user_id;
    const timestamp = body.timestamp;
    const requestId = body.request_id;
    if (!userId || !timestamp || !requestId || !USER_ID_REGEX.test(userId)) {
      return jsonResponse({ ok: false, error_code: "BAD_REQUEST", message: "bad request" });
    }

    const sheet = getSheet();
    const duplicatedAction = getActionByRequestId(sheet, requestId);
    if (duplicatedAction) {
      return jsonResponse({
        ok: true,
        duplicated: true,
        action: duplicatedAction,
        message: "duplicate request ignored",
        server_time: new Date().toISOString()
      });
    }
    const action = decideAction(sheet, userId);
    sheet.appendRow([timestamp, userId, action, "scan", requestId, ""]);

    return jsonResponse({
      ok: true,
      action: action,
      message: action === "出勤" ? "checked in" : "checked out",
      server_time: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse({ ok: false, error_code: "INTERNAL_ERROR", message: String(err) });
  } finally {
    try {
      lock.releaseLock();
    } catch (_err) {
      // no-op
    }
  }
}

function getCurrentCalendarWeekStartYmd() {
  return getWeekStartYmd(new Date());
}

/**
 * session_log の week_start が日付型のとき、getValues() の Date と API の weekKey（JST 暦週の月曜 yyyy-MM-dd）
 * を文字列比較で突き合わせると一致しないことがある（シート TZ・UTC 解釈の差）。
 * スプレッドシート TZ / 固定 JST / UTC 暦日（toISOString）のいずれかが weekKey と一致すればその週として扱う。
 */
function sessionLogWeekStartMatchesWeekKey_(v, weekKey) {
  if (v === null || v === undefined || v === "") return false;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return false;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ssTz = ss ? ss.getSpreadsheetTimeZone() : TZ;
    const asSs = Utilities.formatDate(v, ssTz, "yyyy-MM-dd");
    const asJst = Utilities.formatDate(v, TZ, "yyyy-MM-dd");
    const asUtcDay = v.toISOString().slice(0, 10);
    return weekKey === asSs || weekKey === asJst || weekKey === asUtcDay;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s === weekKey;
  return s === weekKey;
}

/** duration_hours 列が文字列・カンマ小数のとき Number() が NaN になり週次合計が壊れるのを防ぐ */
function parseSessionDurationHours_(v) {
  if (typeof v === "number") {
    return isFinite(v) ? v : 0;
  }
  if (v === null || v === undefined || v === "") return 0;
  const s = String(v)
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

/** 暦週（月曜始まり・JST の week_start 文字列）に一致するセッションのみ集計。自動補正除外。user_master の active のみ。 */
function getWeeklyCalendarAnalyticsItems(weekKey) {
  const sessionSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("session_log");
  const hoursByUser = {};
  if (sessionSheet && sessionSheet.getLastRow() > 1) {
    const values = sessionSheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const uid = String(row[0] || "").trim();
      const dur = parseSessionDurationHours_(row[3]);
      const autoFixed = row[4] === true || String(row[4]).toUpperCase() === "TRUE";
      if (!uid || autoFixed || !sessionLogWeekStartMatchesWeekKey_(row[5], weekKey)) continue;
      const prev = hoursByUser[uid] || 0;
      const add = dur;
      hoursByUser[uid] = (isFinite(prev) ? prev : 0) + (isFinite(add) ? add : 0);
    }
  }

  const master = getUserDirectoryItems();
  const items = [];
  master.forEach((u) => {
    if (!u.active) return;
    let h = hoursByUser[u.user_id] || 0;
    if (!isFinite(h)) h = 0;
    items.push({
      user_id: u.user_id,
      display_name: u.display_name,
      week_total_hours: Math.round(h * 100) / 100
    });
  });
  items.sort((a, b) => b.week_total_hours - a.week_total_hours);
  return items;
}

function getSemesterAnalyticsItems() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("summary_semester");
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const items = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const userId = String(row[0] || "").trim();
    if (!userId) continue;
    items.push({
      user_id: userId,
      display_name: String(row[1] || userId),
      weekly_avg_hours: Number(row[4] || 0)
    });
  }
  return items;
}

function getUserDirectoryItems() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("user_master");
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const items = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const userId = String(row[0] || "").trim();
    if (!userId) continue;
    const displayName = String(row[1] || userId).trim() || userId;
    const active = String(row[2] || "TRUE").toUpperCase() !== "FALSE";
    items.push({
      user_id: userId,
      display_name: displayName,
      active: active
    });
  }
  return items;
}

function runAutoFixBatch() {
  const autoFixHours = Number(PropertiesService.getScriptProperties().getProperty("AUTO_FIX_HOURS") || "0");
  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return;

  const targetDay = getYesterdayYmd();
  const lastInByUser = {};
  const lastOutByUser = {};
  const existingRequestIds = {};
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const ts = row[0];
    const userId = row[1];
    const action = row[2];
    const reqId = String(row[4] || "");
    if (reqId) existingRequestIds[reqId] = true;
    if (!userId || !action || !ts) continue;

    const ymd = Utilities.formatDate(new Date(ts), TZ, "yyyy-MM-dd");
    if (ymd !== targetDay) continue;
    if (action === "出勤") lastInByUser[userId] = new Date(ts);
    if (action === "退勤" || action === "退勤（自動補正）") lastOutByUser[userId] = new Date(ts);
  }

  Object.keys(lastInByUser).forEach((userId) => {
    if (lastOutByUser[userId]) return;
    const inTime = lastInByUser[userId];
    const outTime = new Date(inTime.getTime() + autoFixHours * 60 * 60 * 1000);
    const reqId = `autofix-${targetDay}-${userId}`;
    if (existingRequestIds[reqId]) return;
    sheet.appendRow([outTime.toISOString(), userId, "退勤（自動補正）", "auto_fix", reqId, "前日未退勤の自動補正"]);
    existingRequestIds[reqId] = true;
  });
}

function rebuildSessionLog() {
  const src = getSheet();
  const dst = getOrCreateSheet("session_log", [
    "user_id",
    "in_at",
    "out_at",
    "duration_hours",
    "is_auto_fixed",
    "week_start"
  ]);
  clearSheetBody(dst);

  const values = src.getDataRange().getValues();
  if (values.length <= 1) return;

  const byUser = {};
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const ts = new Date(row[0]);
    const userId = String(row[1] || "");
    const action = String(row[2] || "");
    if (!userId || !action || String(ts) === "Invalid Date") continue;
    if (!byUser[userId]) byUser[userId] = [];
    byUser[userId].push({ ts: ts, action: action });
  }

  const outRows = [];
  Object.keys(byUser).forEach((userId) => {
    const events = byUser[userId].sort((a, b) => a.ts - b.ts);
    let inAt = null;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.action === "出勤") {
        inAt = ev.ts;
        continue;
      }
      if ((ev.action === "退勤" || ev.action === "退勤（自動補正）") && inAt) {
        const ms = ev.ts.getTime() - inAt.getTime();
        if (ms > 0) {
          const hours = Math.round((ms / 3600000) * 100) / 100;
          const weekStart = getWeekStartYmd(inAt);
          outRows.push([
            userId,
            inAt.toISOString(),
            ev.ts.toISOString(),
            hours,
            ev.action === "退勤（自動補正）",
            weekStart
          ]);
        }
        inAt = null;
      }
    }
  });

  if (outRows.length > 0) {
    dst.getRange(2, 1, outRows.length, outRows[0].length).setValues(outRows);
  }
}

function setupAnalyticsSheets() {
  const summary = getOrCreateSheet("summary_semester", [
    "user_id",
    "display_name",
    "total_hours",
    "week_count",
    "semester_weekly_avg_hours",
    "target_hours",
    "gap_hours",
    "achievement_rate",
    "status",
    "target_line"
  ]);
  clearSheetBody(summary);

  summary.getRange("A2").setFormula('=SORT(UNIQUE(FILTER(attendance_log!B2:B, attendance_log!B2:B<>"")))');
  summary.getRange("B2").setFormula('=ARRAYFORMULA(IF(A2:A="",,IFERROR(VLOOKUP(A2:A,user_master!A:B,2,FALSE),"未登録")))');
  summary.getRange("C2").setFormula('=ARRAYFORMULA(IF(A2:A="",,IFERROR(SUMIF(session_log!A:A,A2:A,session_log!D:D),0)))');
  summary.getRange("L1").setFormula(
    '=QUERY(session_log!A:F,"select A, count(distinct F) where A is not null group by A label count(distinct F) \'\'",0)'
  );
  summary.getRange("D2").setFormula('=ARRAYFORMULA(IF(A2:A="",,IFERROR(VLOOKUP(A2:A,L:M,2,FALSE),1)))');
  summary.getRange("E2").setFormula("=ARRAYFORMULA(IF(A2:A=\"\",,IFERROR(C2:C/D2:D,0)))");
  summary.getRange("F2").setFormula('=ARRAYFORMULA(IF(A2:A="",,15))');
  summary.getRange("G2").setFormula('=ARRAYFORMULA(IF(A2:A="",,E2:E-F2:F))');
  summary.getRange("H2").setFormula('=ARRAYFORMULA(IF(A2:A="",,IFERROR(E2:E/F2:F*100,0)))');
  summary.getRange("I2").setFormula(
    '=ARRAYFORMULA(IF(A2:A="",,IF(E2:E>=15,"達成",IF(E2:E>=12,"注意","要改善"))))'
  );
  summary.getRange("J2").setFormula('=ARRAYFORMULA(IF(A2:A="",,15))');

  const dashboard = getOrCreateSheet("dashboard", []);
  dashboard.clear();
  dashboard.getRange("A1").setValue("前期 週平均在室時間（目標15h）");
  dashboard.getRange("A2").setValue("グラフは [挿入] -> [グラフ] で作成");
  dashboard.getRange("A3").setValue("推奨データ範囲: summary_semester!B1:B, E1:E, J1:J");
  dashboard.getRange("A4").setValue("status列(I)に条件付き書式: 達成=緑, 注意=黄, 要改善=赤");
}

function installDailyBatchTrigger() {
  const exists = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === "runAutoFixBatch");
  if (exists) return;
  ScriptApp.newTrigger("runAutoFixBatch").timeBased().everyDays(1).atHour(5).create();
}

/**
 * 毎月1日の朝に「先月末」を基準日として月次締めを実行する。
 * - 00_config!B12 に先月末日を自動設定
 * - runMonthlyClose() を実行（snapshot あり）
 */
function runMonthlyCloseForPreviousMonth() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!cfg) {
    throw new Error("00_config が見つかりません。先に bootstrapProfessorDashboard() を実行してください。");
  }

  const now = new Date();
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // 当月1日基準で前月末
  cfg.getRange("B12").setValue(prevMonthEnd);
  cfg.getRange("B12").setNumberFormat("yyyy-mm-dd");

  const result = runMonthlyClose();
  if (!result || result.ok !== true) {
    throw new Error("runMonthlyClose failed: " + JSON.stringify(result));
  }
}

/**
 * 教授向け月次処理のトリガーをインストール（重複防止）
 * - runMonthlyCloseForPreviousMonth: 毎月1日 07:00
 */
function installMonthlyCloseTrigger() {
  const handler = "runMonthlyCloseForPreviousMonth";
  const exists = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === handler);
  if (exists) return;
  ScriptApp.newTrigger(handler).timeBased().onMonthDay(1).atHour(7).create();
}

/**
 * 現在のプロジェクトトリガー一覧を返す（確認用）
 */
function listAutomationTriggers() {
  return ScriptApp.getProjectTriggers().map((t) => ({
    handler: t.getHandlerFunction(),
    type: String(t.getEventType()),
    source: String(t.getTriggerSource())
  }));
}

/**
 * このプロジェクトで使う自動化トリガーを一括セットアップ
 * - 日次: runAutoFixBatch（毎日 5時）
 * - 月次: runMonthlyCloseForPreviousMonth（毎月1日 7時）
 */
function installAutomationTriggers() {
  installDailyBatchTrigger();
  installMonthlyCloseTrigger();
  return listAutomationTriggers();
}

/**
 * 自動化トリガーを一括削除（再設定時に使用）
 */
function removeAutomationTriggers() {
  const targets = new Set(["runAutoFixBatch", "runMonthlyCloseForPreviousMonth"]);
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (targets.has(t.getHandlerFunction())) {
      ScriptApp.deleteTrigger(t);
    }
  });
}

function setScriptProperties() {
  const props = PropertiesService.getScriptProperties();
  props.setProperties(
    {
      GAS_SHARED_SECRET: "replace-with-long-random-string",
      AUTO_FIX_HOURS: "0"
    },
    true
  );
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["timestamp", "user_id", "action", "source", "request_id", "note"]);
  }
  return sheet;
}

function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (headers && headers.length > 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function clearSheetBody(sheet) {
  const rows = sheet.getLastRow();
  const cols = sheet.getLastColumn();
  if (rows <= 1 || cols === 0) return;
  sheet.getRange(2, 1, rows - 1, cols).clearContent();
}

function decideAction(sheet, userId) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return "出勤";
  const values = sheet.getRange(2, 2, lastRow - 1, 3).getValues(); // B:user_id, C:action
  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    if (String(row[0]) !== userId) continue;
    return row[1] === "出勤" ? "退勤" : "出勤";
  }
  return "出勤";
}

function getActionByRequestId(sheet, requestId) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return "";
  const values = sheet.getRange(2, 3, lastRow - 1, 5).getValues(); // C:action, D:source, E:request_id
  for (let i = values.length - 1; i >= 0; i--) {
    const action = String(values[i][0] || "");
    const reqId = String(values[i][2] || "");
    if (reqId === requestId) return action;
  }
  return "";
}

function getRequestStatusByRequestId(sheet, requestId) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;
  // A:timestamp, C:action, E:request_id
  const values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    const timestamp = values[i][0];
    const action = String(values[i][2] || "");
    const reqId = String(values[i][4] || "");
    if (reqId === requestId) {
      return {
        action: action,
        timestamp: timestamp instanceof Date ? timestamp.toISOString() : String(timestamp || "")
      };
    }
  }
  return null;
}

function getYesterdayYmd() {
  const now = new Date();
  const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return Utilities.formatDate(y, TZ, "yyyy-MM-dd");
}

function getWeekStartYmd(dt) {
  const local = new Date(dt);
  const day = Number(Utilities.formatDate(local, TZ, "u")); // 1=Mon ... 7=Sun
  const diff = day - 1;
  const monday = new Date(local.getTime() - diff * 24 * 60 * 60 * 1000);
  return Utilities.formatDate(monday, TZ, "yyyy-MM-dd");
}

function parseRequestBody(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("empty request body");
  }
  return JSON.parse(e.postData.contents);
}

function jsonResponse(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// --- 教授向け月次ダッシュボード（00_config / 10_professor_monthly）---

var CONFIG_SHEET_NAME = "00_config";
var PROFESSOR_SHEET_NAME = "10_professor_monthly";
var MONTHLY_HISTORY_SHEET = "12_monthly_history";

/**
 * 初回セットアップ。シート作成・config 雛形・教授シート枠・棒グラフ枠（冪等）。
 * @returns {{ ok: boolean, error_code?: string, message?: string, warnings?: string[] }}
 */
function bootstrapProfessorDashboard() {
  const warnings = [];
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss.getSheetByName("user_master")) warnings.push("user_master が見つかりません（後で作成してください）");
    if (!ss.getSheetByName("session_log")) warnings.push("session_log が未作成です。rebuildSessionLog を実行してください");

    ensureConfigSheet_(ss);
    ensureProfessorSheetLayout_(ss);
    ensureMonthlyHistorySheet_(ss);

    return { ok: true, warnings: warnings };
  } catch (err) {
    return { ok: false, error_code: "BOOTSTRAP_ERROR", message: String(err) };
  }
}

/**
 * session_log から教授向け表を再計算。config の B18 に算出 k を書き戻す（可視用）。
 * @returns {{ ok: boolean, error_code?: string, message?: string, row_count?: number, k?: number, N?: number }}
 */
function refreshProfessorMonthlyView() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cfg = readProfessorConfig_(ss);
    if (!cfg.ok) return cfg;

    const users = loadActiveUsersFromMaster_(ss);
    if (users.length === 0) {
      return { ok: false, error_code: "NO_ACTIVE_USERS", message: "user_master に active ユーザーがありません" };
    }

    const hoursByUser = aggregateSessionHoursForProfessor_(ss, cfg.semesterStart, cfg.semesterEnd, cfg.asOfDate);
    const kEffective = cfg.kOverride != null ? Math.min(cfg.kOverride, cfg.N) : computeElapsedWeekCountJst_(cfg.semesterStart, cfg.asOfDate, cfg.N);

    const configSheet = ss.getSheetByName(CONFIG_SHEET_NAME);
    if (configSheet) configSheet.getRange("B18").setValue(kEffective);

    const targetTotalHours = cfg.targetHoursPerWeek * cfg.N;
    const rows = [];
    let sumH = 0;
    let sumAchievement = 0;
    users.forEach((u) => {
      const H = hoursByUser[u.userId] || 0;
      sumH += H;
      const pace = kEffective > 0 ? H / kEffective : 0;
      const achievementPct = targetTotalHours > 0 ? (H / targetTotalHours) * 100 : 0;
      sumAchievement += achievementPct;
      const semesterAvgEst = cfg.N > 0 ? H / cfg.N : 0;
      rows.push([u.displayName, u.userId, H, kEffective, pace, cfg.N, targetTotalHours, achievementPct, semesterAvgEst]);
    });
    rows.sort((a, b) => b[2] - a[2]);

    const prof = ss.getSheetByName(PROFESSOR_SHEET_NAME);
    const startRow = 13;
    const oldLast = prof.getLastRow();
    if (oldLast >= startRow) {
      prof.getRange(startRow, 1, oldLast - startRow + 1, 10).clearContent();
    }

    const table = rows.map((r, i) => [i + 1, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]]);
    if (table.length > 0) {
      prof.getRange(startRow, 1, table.length, 10).setValues(table);
    }

    const semLabel = cfg.semesterLabel || "";
    prof.getRange("A1").setValue(semLabel ? semLabel + " 進捗レポート（教授向け）" : "進捗レポート（教授向け）");
    prof.getRange("A2").setValue("集計基準日: " + formatYmdJst_(cfg.asOfDate));
    prof.getRange("A3").setValue(
      "学期期間: " + formatYmdJst_(cfg.semesterStart) + " 〜 " + formatYmdJst_(cfg.semesterEnd)
    );
    prof.getRange("A4").setValue("公式週数 N=" + cfg.N + " / 目標週平均 " + cfg.targetHoursPerWeek + "h/週");
    prof.getRange("A5").setValue("※ 自動補正（is_auto_fixed=TRUE）のセッションは指標に含めていません。");

    prof.getRange("A7").setValue("対象者数");
    prof.getRange("B7").setValue(users.length);
    prof.getRange("A8").setValue("累計在室（合計 h）");
    prof.getRange("B8").setValue(Math.round(sumH * 100) / 100);
    prof.getRange("A9").setValue("平均達成率（%）");
    prof.getRange("B9").setValue(rows.length > 0 ? Math.round((sumAchievement / rows.length) * 100) / 100 : 0);

    appendMonthlyHistoryRow_(ss, cfg.asOfDate, rows.length > 0 ? sumAchievement / rows.length : 0, sumH, users.length);

    refreshProfessorBarChart_(prof, startRow, table.length);
    refreshProfessorTrendChart_(ss, prof);

    return { ok: true, row_count: rows.length, k: kEffective, N: cfg.N };
  } catch (err) {
    return { ok: false, error_code: "REFRESH_ERROR", message: String(err) };
  }
}

/**
 * 月末締め: session_log 再構築 → 教授ビュー更新 →（既定）スナップショット作成。
 * @param {{ snapshot?: boolean }} opt snapshot false でスナップショット省略
 */
function runMonthlyClose(opt) {
  const options = opt || {};
  const doSnap = options.snapshot !== false;
  try {
    rebuildSessionLog();
    const r = refreshProfessorMonthlyView();
    if (!r.ok) return r;
    if (doSnap) {
      const snap = createMonthlySnapshot();
      if (!snap.ok) return snap;
    }
    return { ok: true, refreshed: r, snapshot: doSnap };
  } catch (err) {
    return { ok: false, error_code: "MONTHLY_CLOSE_ERROR", message: String(err) };
  }
}

/**
 * 10_professor_monthly の値コピーを 11_snapshot_yyyyMM として保存（同名があれば削除して作り直し）。
 */
function createMonthlySnapshot() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cfg = readProfessorConfig_(ss);
    if (!cfg.ok) return cfg;

    const yyyymm = Utilities.formatDate(cfg.asOfDate, TZ, "yyyyMM");
    const name = "11_snapshot_" + yyyymm;
    const existing = ss.getSheetByName(name);
    if (existing) ss.deleteSheet(existing);

    const src = ss.getSheetByName(PROFESSOR_SHEET_NAME);
    if (!src) return { ok: false, error_code: "MISSING_SHEET", message: PROFESSOR_SHEET_NAME + " がありません" };

    const copy = src.copyTo(ss);
    copy.setName(name);
    const rng = copy.getDataRange();
    const vals = rng.getValues();
    rng.setValues(vals);
    copy.getRange("A1").setValue(copy.getRange("A1").getValue() + " [スナップショット " + yyyymm + "]");

    return { ok: true, sheet_name: name };
  } catch (err) {
    return { ok: false, error_code: "SNAPSHOT_ERROR", message: String(err) };
  }
}

function ensureConfigSheet_(ss) {
  let sh = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!sh) sh = ss.insertSheet(CONFIG_SHEET_NAME);

  const labels = [
    ["項目", "値"],
    ["年度", 2026],
    ["集計対象学期", "前期"],
    ["前期開始日", ""],
    ["前期終了日", ""],
    ["前期公式週数N", 14],
    ["後期開始日", ""],
    ["後期終了日", ""],
    ["後期公式週数N", 14],
    ["目標週平均時間", 15],
    ["週開始曜日", "MON"],
    ["基準日（月末）", ""],
    ["k上書き（空=自動）", ""],
    ["", ""],
    ["対象学期開始（自動）", '=IF(B3="前期",B4,IF(B3="後期",B7,""))'],
    ["対象学期終了（自動）", '=IF(B3="前期",B5,IF(B3="後期",B8,""))'],
    ["公式週数N（自動）", '=IF(B3="前期",B6,IF(B3="後期",B9,""))'],
    ["経過週数k（refreshで更新）", ""]
  ];
  sh.getRange(1, 1, labels.length, 2).setValues(labels);
  sh.getRange("B4:B9").setNumberFormat("yyyy-mm-dd");
  sh.getRange("B12").setNumberFormat("yyyy-mm-dd");
}

function ensureProfessorSheetLayout_(ss) {
  let sh = ss.getSheetByName(PROFESSOR_SHEET_NAME);
  if (!sh) sh = ss.insertSheet(PROFESSOR_SHEET_NAME);

  sh.getRange("A12:J12").setValues([
    ["No.", "氏名", "user_id", "累計在室(h)", "経過週数k", "経過週平均(h/週)", "学期週数N", "学期目標総時間(h)", "達成率(%)", "学期週平均見込み(h/週)"]
  ]);
}

function ensureMonthlyHistorySheet_(ss) {
  let sh = ss.getSheetByName(MONTHLY_HISTORY_SHEET);
  if (!sh) sh = ss.insertSheet(MONTHLY_HISTORY_SHEET);
  if (sh.getLastRow() < 1 || String(sh.getRange("A1").getValue() || "") === "") {
    sh.getRange("A1:F1").setValues([
      ["基準日", "yyyyMM", "平均達成率(%)", "累計合計(h)", "対象者数", "備考"]
    ]);
  }
}

function readProfessorConfig_(ss) {
  const sh = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!sh) {
    return { ok: false, error_code: "MISSING_CONFIG", message: "先に bootstrapProfessorDashboard() を実行してください" };
  }

  const semesterLabel = String(sh.getRange("B3").getValue() || "").trim();
  const targetHoursPerWeek = Number(sh.getRange("B10").getValue() || 15);
  const kOverrideRaw = sh.getRange("B13").getValue();
  let kOverride = null;
  if (kOverrideRaw !== "" && kOverrideRaw != null && !isNaN(Number(kOverrideRaw))) {
    kOverride = Number(kOverrideRaw);
  }

  const asOfDate = sh.getRange("B12").getValue();
  const semesterStart = sh.getRange("B15").getValue();
  const semesterEnd = sh.getRange("B16").getValue();
  const N = Number(sh.getRange("B17").getValue() || 0);

  const semStart = parseSheetDate_(semesterStart);
  const semEnd = parseSheetDate_(semesterEnd);
  const asOf = parseSheetDate_(asOfDate);

  if (!semStart || !semEnd || !asOf) {
    return {
      ok: false,
      error_code: "INVALID_CONFIG_DATE",
      message: "00_config の前期/後期の日付または基準日(B12)が不正です"
    };
  }
  if (!N || N <= 0) {
    return { ok: false, error_code: "INVALID_N", message: "公式週数 N（B17 連鎖）が正ではありません" };
  }

  return {
    ok: true,
    semesterLabel: semesterLabel,
    semesterStart: semStart,
    semesterEnd: semEnd,
    asOfDate: endOfDayJst_(asOf),
    N: N,
    targetHoursPerWeek: targetHoursPerWeek,
    kOverride: kOverride
  };
}

function parseSheetDate_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const p = v.slice(0, 10).split("-");
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }
  return null;
}

function endOfDayJst_(d) {
  const y = Number(Utilities.formatDate(d, TZ, "yyyy"));
  const m = Number(Utilities.formatDate(d, TZ, "MM"));
  const day = Number(Utilities.formatDate(d, TZ, "dd"));
  return new Date(y, m - 1, day, 23, 59, 59, 999);
}

function formatYmdJst_(d) {
  return Utilities.formatDate(d, TZ, "yyyy-MM-dd");
}

function loadActiveUsersFromMaster_(ss) {
  const sh = ss.getSheetByName("user_master");
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const userId = String(row[0] || "").trim();
    if (!userId) continue;
    const displayName = String(row[1] || userId).trim() || userId;
    const active = String(row[2] || "TRUE").toUpperCase() !== "FALSE";
    if (!active) continue;
    out.push({ userId: userId, displayName: displayName });
  }
  return out;
}

function aggregateSessionHoursForProfessor_(ss, semesterStart, semesterEnd, asOfEnd) {
  const sh = ss.getSheetByName("session_log");
  const hoursByUser = {};
  if (!sh || sh.getLastRow() <= 1) return hoursByUser;

  const values = sh.getDataRange().getValues();
  const semYmd = formatYmdJst_(semesterStart);
  const endCap = clearTimeJst_(semesterEnd).getTime() < clearTimeJst_(asOfEnd).getTime() ? semesterEnd : asOfEnd;
  const maxYmd = formatYmdJst_(endCap);

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const userId = String(row[0] || "").trim();
    const inAt = row[1];
    const dur = Number(row[3] || 0);
    const autoFixed = row[4] === true || String(row[4]).toUpperCase() === "TRUE";
    if (!userId || autoFixed) continue;

    const inDate = inAt instanceof Date ? inAt : new Date(inAt);
    if (String(inDate) === "Invalid Date") continue;
    const inYmd = formatYmdJst_(inDate);
    if (inYmd < semYmd || inYmd > maxYmd) continue;

    hoursByUser[userId] = (hoursByUser[userId] || 0) + dur;
  }
  return hoursByUser;
}

function computeElapsedWeekCountJst_(semesterStart, asOfEnd, capN) {
  const sem = clearTimeJst_(semesterStart);
  const asOf = clearTimeJst_(asOfEnd);
  if (asOf.getTime() < sem.getTime()) return 0;

  const monSem = getMondayOfWeekJst_(sem);
  const monAsOf = getMondayOfWeekJst_(asOf);
  const diffMs = monAsOf.getTime() - monSem.getTime();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const weeks = Math.floor(diffMs / weekMs) + 1;
  const k = Math.min(Math.max(weeks, 1), capN);
  return k;
}

function clearTimeJst_(d) {
  const y = Number(Utilities.formatDate(d, TZ, "yyyy"));
  const m = Number(Utilities.formatDate(d, TZ, "MM"));
  const day = Number(Utilities.formatDate(d, TZ, "dd"));
  return new Date(y, m - 1, day);
}

function getMondayOfWeekJst_(d) {
  const day = Number(Utilities.formatDate(d, TZ, "u"));
  const diff = day - 1;
  const t = d.getTime() - diff * 24 * 60 * 60 * 1000;
  return new Date(t);
}

function appendMonthlyHistoryRow_(ss, asOfDate, avgAchievementPct, sumH, userCount) {
  const sh = ss.getSheetByName(MONTHLY_HISTORY_SHEET);
  if (!sh) return;
  const yyyymm = Utilities.formatDate(asOfDate, TZ, "yyyyMM");
  const lastRow = sh.getLastRow();
  for (let r = 2; r <= lastRow; r++) {
    if (String(sh.getRange(r, 2).getValue() || "") === yyyymm) {
      sh.getRange(r, 1, 1, 5).setValues([[formatYmdJst_(asOfDate), yyyymm, avgAchievementPct, sumH, userCount]]);
      return;
    }
  }
  sh.appendRow([formatYmdJst_(asOfDate), yyyymm, avgAchievementPct, sumH, userCount, ""]);
}

function refreshProfessorBarChart_(sheet, dataStartRow, numRows) {
  const charts = sheet.getCharts();
  charts.forEach((c) => {
    try {
      const title = c.getOptions().get("title");
      if (title === "累計在室（ユーザー別）") sheet.removeChart(c);
    } catch (_e) {
      /* ignore */
    }
  });
  if (numRows <= 0) return;

  const endRow = dataStartRow + numRows - 1;
  const chart = sheet
    .newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(sheet.getRange(dataStartRow, 2, numRows, 1))
    .addRange(sheet.getRange(dataStartRow, 4, numRows, 1))
    .setPosition(1, 12, 0, 0)
    .setOption("title", "累計在室（ユーザー別）")
    .setOption("legend", { position: "none" })
    .setOption("hAxis", { title: "氏名" })
    .setOption("vAxis", { title: "時間(h)" })
    .build();
  sheet.insertChart(chart);
}

function refreshProfessorTrendChart_(ss, professorSheet) {
  const hist = ss.getSheetByName(MONTHLY_HISTORY_SHEET);
  if (!hist) return;
  const lastRow = hist.getLastRow();
  if (lastRow <= 1) return;

  const charts = professorSheet.getCharts();
  charts.forEach((c) => {
    try {
      const title = c.getOptions().get("title");
      if (title === "平均達成率の月次推移") professorSheet.removeChart(c);
    } catch (_e) {
      /* ignore */
    }
  });

  // B:yyyyMM, C:平均達成率(%)
  const dataRows = lastRow - 1;
  const chart = professorSheet
    .newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(hist.getRange(2, 2, dataRows, 1))
    .addRange(hist.getRange(2, 3, dataRows, 1))
    .setPosition(20, 12, 0, 0)
    .setOption("title", "平均達成率の月次推移")
    .setOption("hAxis", { title: "月(yyyyMM)" })
    .setOption("vAxis", { title: "達成率(%)", viewWindow: { min: 0, max: 120 } })
    .setOption("legend", { position: "none" })
    .build();
  professorSheet.insertChart(chart);
}
