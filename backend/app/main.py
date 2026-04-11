import asyncio
import os
import re
import uuid
from datetime import datetime
from threading import Lock
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

load_dotenv()

JST = ZoneInfo("Asia/Tokyo")
USER_ID_PATTERN = re.compile(r"^[A-Za-z0-9]{5,12}$")
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{8,128}$")
COOLDOWN_SECONDS = int(os.getenv("COOLDOWN_SECONDS", "180"))
REQUEST_TIMEOUT_SEC = float(os.getenv("REQUEST_TIMEOUT_SEC", "5"))
GAS_RECONCILE_ATTEMPTS = int(os.getenv("GAS_RECONCILE_ATTEMPTS", "3"))
GAS_RECONCILE_INTERVAL_SEC = float(os.getenv("GAS_RECONCILE_INTERVAL_SEC", "0.8"))
USER_CACHE_TTL_SECONDS = int(os.getenv("USER_CACHE_TTL_SECONDS", "60"))
APP_ENV = os.getenv("APP_ENV", "dev")
GAS_WEBHOOK_URL = os.getenv("GAS_WEBHOOK_URL")
GAS_SHARED_SECRET = os.getenv("GAS_SHARED_SECRET")

required_env = ["APP_ENV"]
if APP_ENV != "dev":
    required_env.extend(["GAS_WEBHOOK_URL", "GAS_SHARED_SECRET"])
missing_env = [k for k in required_env if not os.getenv(k)]
if missing_env:
    raise RuntimeError(f"Missing required env vars: {', '.join(missing_env)}")

app = FastAPI(title="Attendance Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
cooldown_store: dict[str, datetime] = {}
cooldown_lock = Lock()
last_action_store: dict[str, str] = {}
last_action_lock = Lock()
user_cache_lock = Lock()
user_cache: dict[str, object] = {"loaded_at": None, "by_id": {}}


class ScanRequest(BaseModel):
    user_id: str
    scanned_at: str | None = None
    source: str | None = "scanner"
    client_request_id: str | None = None


class ScanResponse(BaseModel):
    ok: bool
    result: str
    message: str
    user_id: str
    action: str | None
    cooldown_remaining_sec: int | None
    request_id: str
    server_time: str


class AnalyticsRow(BaseModel):
    user_id: str
    display_name: str
    weekly_avg_hours: float


class WeekCalendarRow(BaseModel):
    user_id: str
    display_name: str
    week_total_hours: float
    is_present: bool = False


class WeekCalendarResponse(BaseModel):
    week_start: str
    items: list[WeekCalendarRow]


def _week_calendar_row_from_gas_item(item: object) -> WeekCalendarRow:
    """GAS のキー揺れ・文字列数値・NaN を吸収する（週次時間がフロントに載らない事故の予防）。"""
    if not isinstance(item, dict):
        return WeekCalendarRow(user_id="", display_name="", week_total_hours=0.0, is_present=False)
    d = item
    uid = str(d.get("user_id") or d.get("userId") or "").strip()
    name = str(d.get("display_name") or d.get("displayName") or uid).strip() or uid
    raw = d.get("week_total_hours", d.get("weekTotalHours", 0))
    try:
        hrs = float(raw)
    except (TypeError, ValueError):
        hrs = 0.0
    if hrs != hrs:  # NaN
        hrs = 0.0
    raw_present = d.get("is_present", d.get("isPresent", False))
    present = raw_present is True or str(raw_present).lower() in ("true", "1", "yes")
    return WeekCalendarRow(user_id=uid, display_name=name, week_total_hours=hrs, is_present=present)


class UserRow(BaseModel):
    user_id: str
    display_name: str
    active: bool


def now_jst() -> datetime:
    return datetime.now(JST)


def iso_jst(dt: datetime) -> str:
    return dt.astimezone(JST).isoformat()


def parse_scanned_at(scanned_at: str | None) -> datetime:
    if not scanned_at:
        return now_jst()
    try:
        dt = datetime.fromisoformat(scanned_at)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error_code": "INVALID_SCANNED_AT", "message": "scanned_at の形式が不正です"},
        ) from exc
    if dt.tzinfo is None:
        return dt.replace(tzinfo=JST)
    return dt.astimezone(JST)


def make_response(
    *,
    ok: bool,
    result: str,
    message: str,
    user_id: str,
    action: str | None,
    cooldown_remaining_sec: int | None,
    request_id: str,
) -> ScanResponse:
    return ScanResponse(
        ok=ok,
        result=result,
        message=message,
        user_id=user_id,
        action=action,
        cooldown_remaining_sec=cooldown_remaining_sec,
        request_id=request_id,
        server_time=iso_jst(now_jst()),
    )


def validate_user_id(user_id: str) -> None:
    if not USER_ID_PATTERN.fullmatch(user_id):
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "INVALID_USER",
                "message": "むこうなIDです（英数字5〜12文字）",
            },
        )


def normalize_request_id(client_request_id: str | None) -> str:
    if not client_request_id:
        return str(uuid.uuid4())
    candidate = client_request_id.strip()
    if REQUEST_ID_PATTERN.fullmatch(candidate):
        return candidate
    return str(uuid.uuid4())


def check_cooldown(user_id: str) -> int | None:
    with cooldown_lock:
        last = cooldown_store.get(user_id)
        if not last:
            return None
        elapsed = (now_jst() - last).total_seconds()
        remain = COOLDOWN_SECONDS - int(elapsed)
        if remain > 0:
            return remain
        cooldown_store.pop(user_id, None)
        return None


def touch_cooldown(user_id: str) -> None:
    with cooldown_lock:
        cooldown_store[user_id] = now_jst()


async def get_gas_request_status(request_id: str) -> dict | None:
    payload = await call_gas_get("request_status", extra_params={"request_id": request_id})
    if payload.get("found") is True:
        return payload
    return None


async def call_gas_webhook(user_id: str, timestamp: str, request_id: str) -> dict:
    payload = {
        "user_id": user_id,
        "timestamp": timestamp,
        "request_id": request_id,
        "shared_secret": GAS_SHARED_SECRET,
    }
    headers = {}
    timeout = httpx.Timeout(REQUEST_TIMEOUT_SEC)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        try:
            response = await client.post(GAS_WEBHOOK_URL, json=payload, headers=headers)
        except httpx.TimeoutException as exc:
            # GAS が遅延しても実処理が完了している可能性があるため、request_id で結果照会を試みる。
            for attempt in range(max(GAS_RECONCILE_ATTEMPTS, 0)):
                recovered = await get_gas_request_status(request_id)
                if recovered:
                    return {
                        "ok": True,
                        "action": recovered.get("action"),
                        "message": recovered.get("message") or "recovered from timeout",
                        "server_time": recovered.get("server_time"),
                    }
                if attempt < GAS_RECONCILE_ATTEMPTS - 1:
                    await asyncio.sleep(max(GAS_RECONCILE_INTERVAL_SEC, 0))
            raise HTTPException(
                status_code=504,
                detail={"error_code": "GAS_TIMEOUT", "message": "GASタイムアウト"},
            ) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=502,
                detail={"error_code": "GAS_ERROR", "message": "GAS通信エラー"},
            ) from exc

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail={"error_code": "GAS_ERROR", "message": "GAS応答エラー"},
        )
    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail={"error_code": "GAS_ERROR", "message": "GAS応答がJSONではありません"},
        ) from exc
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=502,
            detail={"error_code": "GAS_ERROR", "message": "GAS応答形式が不正です"},
        )
    if payload.get("ok") is False:
        raise HTTPException(
            status_code=502,
            detail={
                "error_code": "GAS_ERROR",
                "message": payload.get("message") or "GASがエラーを返しました",
            },
        )
    return payload


async def call_gas_get(mode: str, extra_params: dict | None = None) -> dict:
    timeout = httpx.Timeout(REQUEST_TIMEOUT_SEC)
    params = {"mode": mode, "shared_secret": GAS_SHARED_SECRET}
    if extra_params:
        params.update(extra_params)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        try:
            response = await client.get(GAS_WEBHOOK_URL, params=params)
        except httpx.TimeoutException as exc:
            raise HTTPException(
                status_code=504,
                detail={"error_code": "GAS_TIMEOUT", "message": "GASタイムアウト"},
            ) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=502,
                detail={"error_code": "GAS_ERROR", "message": "GAS通信エラー"},
            ) from exc
    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail={"error_code": "GAS_ERROR", "message": "GAS応答エラー"},
        )
    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail={"error_code": "GAS_ERROR", "message": "GAS応答がJSONではありません"},
        ) from exc
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=502,
            detail={"error_code": "GAS_ERROR", "message": "GAS応答形式が不正です"},
        )
    if payload.get("ok") is False:
        raise HTTPException(
            status_code=502,
            detail={
                "error_code": "GAS_ERROR",
                "message": payload.get("message") or "GASがエラーを返しました",
            },
        )
    return payload


def _is_user_cache_fresh() -> bool:
    loaded_at = user_cache.get("loaded_at")
    if not isinstance(loaded_at, datetime):
        return False
    return (now_jst() - loaded_at).total_seconds() < USER_CACHE_TTL_SECONDS


async def get_user_rows_cached() -> list[UserRow]:
    with user_cache_lock:
        if _is_user_cache_fresh():
            by_id = user_cache.get("by_id")
            if isinstance(by_id, dict):
                return [UserRow(**v) for v in by_id.values()]

    if should_use_local_mock():
        rows = [
            UserRow(user_id="A12345", display_name="山田 太郎", active=True),
            UserRow(user_id="A12346", display_name="佐藤 花子", active=True),
            UserRow(user_id="B67891", display_name="鈴木 次郎", active=True),
        ]
    else:
        payload = await call_gas_get("users")
        items = payload.get("items", [])
        rows = [UserRow(**item) for item in items]

    with user_cache_lock:
        user_cache["loaded_at"] = now_jst()
        user_cache["by_id"] = {r.user_id: r.model_dump() for r in rows}
    return rows


async def get_user_by_id(user_id: str) -> UserRow | None:
    rows = await get_user_rows_cached()
    for row in rows:
        if row.user_id == user_id:
            return row
    return None


def should_use_local_mock() -> bool:
    return APP_ENV == "dev" and (
        not GAS_WEBHOOK_URL or "REPLACE_ME" in GAS_WEBHOOK_URL
    )


def next_local_action(user_id: str) -> str:
    with last_action_lock:
        prev = last_action_store.get(user_id)
        action = "退勤" if prev == "出勤" else "出勤"
        last_action_store[user_id] = action
        return action


@app.get("/")
def root() -> RedirectResponse:
    """トップ URL は定義がなく 404 になりやすいので Swagger UI へ誘導する。"""
    return RedirectResponse(url="/docs")


@app.get("/api/healthz")
def healthz() -> dict:
    return {"ok": True}


@app.post("/api/scan", response_model=ScanResponse)
async def scan(payload: ScanRequest) -> ScanResponse:
    request_id = normalize_request_id(payload.client_request_id)
    validate_user_id(payload.user_id)
    if not should_use_local_mock():
        user = await get_user_by_id(payload.user_id)
        if user is None:
            raise HTTPException(
                status_code=400,
                detail={"error_code": "UNKNOWN_USER", "message": "未登録のIDです"},
            )
        if not user.active:
            raise HTTPException(
                status_code=400,
                detail={"error_code": "INACTIVE_USER", "message": "無効なユーザーです"},
            )
    remain = check_cooldown(payload.user_id)
    if remain is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "error_code": "COOLDOWN_ACTIVE",
                "message": "れんぞくだこくはできません",
                "request_id": request_id,
                "result": "blocked",
                "cooldown_remaining_sec": remain,
            },
        )

    scanned_dt = parse_scanned_at(payload.scanned_at)
    if should_use_local_mock():
        action = next_local_action(payload.user_id)
    else:
        gas_result = await call_gas_webhook(payload.user_id, iso_jst(scanned_dt), request_id)
        action = gas_result.get("action")
    if action not in {"出勤", "退勤"}:
        raise HTTPException(
            status_code=502,
            detail={"error_code": "GAS_ERROR", "message": "GAS応答 action が不正です"},
        )
    if action == "出勤":
        result = "success_in"
        message = f"{payload.user_id} が けんきゅうしつ に あらわれた！"
    else:
        result = "success_out"
        message = f"{payload.user_id} は きょうの けんきゅう を おえた！ (HPがかいふくした)"

    touch_cooldown(payload.user_id)
    return make_response(
        ok=True,
        result=result,
        message=message,
        user_id=payload.user_id,
        action=action,
        cooldown_remaining_sec=None,
        request_id=request_id,
    )


@app.post("/api/mock-scan", response_model=ScanResponse)
async def mock_scan(payload: ScanRequest, x_mock_token: str | None = Header(default=None)) -> ScanResponse:
    if APP_ENV != "dev":
        raise HTTPException(status_code=404, detail="Not Found")
    _ = x_mock_token
    mock_payload = ScanRequest(user_id=payload.user_id, scanned_at=payload.scanned_at, source="mock")
    return await scan(mock_payload)


@app.get("/api/view/analytics/semester", response_model=list[AnalyticsRow])
async def analytics_semester() -> list[AnalyticsRow]:
    if should_use_local_mock():
        return [
            AnalyticsRow(user_id="A10001", display_name="山田 太郎", weekly_avg_hours=16.2),
            AnalyticsRow(user_id="A10002", display_name="佐藤 花子", weekly_avg_hours=13.4),
            AnalyticsRow(user_id="A10003", display_name="鈴木 次郎", weekly_avg_hours=9.8),
        ]
    payload = await call_gas_get("analytics_semester")
    items = payload.get("items", [])
    return [AnalyticsRow(**item) for item in items]


@app.get("/api/view/analytics/week-calendar", response_model=WeekCalendarResponse)
async def analytics_week_calendar() -> WeekCalendarResponse:
    if should_use_local_mock():
        return WeekCalendarResponse(
            week_start="2026-04-07",
            items=[
                WeekCalendarRow(
                    user_id="A10001", display_name="山田 太郎", week_total_hours=11.5, is_present=True
                ),
                WeekCalendarRow(
                    user_id="A10002", display_name="佐藤 花子", week_total_hours=8.2, is_present=False
                ),
                WeekCalendarRow(
                    user_id="A10003", display_name="鈴木 次郎", week_total_hours=3.0, is_present=False
                ),
            ],
        )
    payload = await call_gas_get("analytics_week_calendar")
    items = payload.get("items", [])
    rows = [_week_calendar_row_from_gas_item(x) for x in items]
    rows = [r for r in rows if r.user_id]
    return WeekCalendarResponse(
        week_start=str(payload.get("week_start") or ""),
        items=rows,
    )


@app.get("/api/view/users", response_model=list[UserRow])
async def users() -> list[UserRow]:
    return await get_user_rows_cached()
