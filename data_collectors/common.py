# -*- coding: utf-8 -*-
"""
공통 유틸리티 모듈 — 모든 수집 스크립트가 공유.
- UTF-8 콘솔/파일 보장 (Windows cp949 회피)
- 재시도가 내장된 requests 세션
- 출력 경로 / CSV 저장 / 로깅
- 날짜 연속성(빠짐 없는지) 검증기
"""
from __future__ import annotations

import sys
import io
import os
import time
import logging
from datetime import date, datetime, timedelta
from pathlib import Path

# ---- UTF-8 콘솔 강제 (Windows에서 한글 깨짐/인코딩 오류 방지) -------------------
try:
    sys.stdout.reconfigure(encoding="utf-8")          # py3.7+
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:  # pragma: no cover
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# ---- 경로 ---------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "output"
SIM_DIR = OUTPUT_DIR / "_simulated"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
SIM_DIR.mkdir(parents=True, exist_ok=True)


# ---- 로깅 ---------------------------------------------------------------------
def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        h = logging.StreamHandler(sys.stdout)
        h.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s",
                                         datefmt="%H:%M:%S"))
        logger.addHandler(h)
        logger.setLevel(logging.INFO)
    return logger


log = get_logger("common")


# ---- HTTP 세션 (재시도 포함) ---------------------------------------------------
def make_session(retries: int = 4, backoff: float = 1.5, timeout: int = 60):
    import requests
    from requests.adapters import HTTPAdapter
    try:
        from urllib3.util.retry import Retry
    except Exception:                                  # pragma: no cover
        from requests.packages.urllib3.util.retry import Retry

    s = requests.Session()
    retry = Retry(
        total=retries, connect=retries, read=retries,
        backoff_factor=backoff,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET", "POST"]),
        raise_on_status=False,
    )
    ad = HTTPAdapter(max_retries=retry, pool_maxsize=16)
    s.mount("https://", ad)
    s.mount("http://", ad)
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (compatible; WeatherHackathonCollector/1.0; +https://weatherhackathon.kr)"
    })
    s.request_timeout = timeout
    return s


def http_get(session, url, **kw):
    """timeout 기본값을 세션에 묶어 호출."""
    kw.setdefault("timeout", getattr(session, "request_timeout", 60))
    return session.get(url, **kw)


# ---- 기간 헬퍼 -----------------------------------------------------------------
def year_range(years: int, end: date | None = None):
    """최근 N개년 (end 기준). 반환: (start_date, end_date)."""
    end = end or date.today()
    start = end.replace(year=end.year - years)
    return start, end


def daterange_days(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


# ---- 검증 ---------------------------------------------------------------------
def validate_daily_complete(df, date_col: str, start: date, end: date,
                            allow_missing_ratio: float = 0.0):
    """
    일 단위 데이터의 '빠짐 없는지' 검사.
    핵심 지표 = 실제 커버 구간[첫날~마지막날] 내부의 누락(internal_missing).
    데이터가 최신까지 안 오는 지연(trailing_lag)/시작 지연(leading_lag)은 분리 보고.
    """
    import pandas as pd
    if len(df) == 0:
        return {"rows": 0, "ok": False, "note": "빈 데이터"}
    have = sorted(set(pd.to_datetime(df[date_col]).dt.date))
    first_present, last_present = have[0], have[-1]
    have_set = set(have)
    lo, hi = max(start, first_present), min(end, last_present)
    internal_expected = list(daterange_days(lo, hi)) if lo <= hi else []
    internal_missing = [d for d in internal_expected if d not in have_set]
    ratio = len(internal_missing) / max(1, len(internal_expected))
    return {
        "rows": int(len(df)),
        "present_days": len(have),
        "coverage_first": str(first_present),
        "coverage_last": str(last_present),
        "internal_expected": len(internal_expected),
        "internal_missing": len(internal_missing),
        "internal_missing_ratio": round(ratio, 4),
        "ok": bool(ratio <= allow_missing_ratio),
        "leading_lag_days": max(0, (first_present - start).days),
        "trailing_lag_days": max(0, (end - last_present).days),
        "missing_sample": [str(d) for d in internal_missing[:10]],
    }


def validate_monthly_complete(df, date_col: str, start: date, end: date):
    """월 단위 데이터의 빠짐 없음 검사 (실제 커버 구간 내부 기준)."""
    import pandas as pd
    if len(df) == 0:
        return {"rows": 0, "ok": False, "note": "빈 데이터"}
    months = sorted(set(pd.to_datetime(df[date_col]).dt.to_period("M").astype(str)))
    lo = max(pd.Period(start, "M"), pd.Period(months[0], "M"))
    hi = min(pd.Period(end, "M"), pd.Period(months[-1], "M"))
    exp = pd.period_range(lo, hi, freq="M").astype(str)
    missing = [m for m in exp if m not in set(months)]
    return {
        "rows": int(len(df)),
        "coverage_first": months[0], "coverage_last": months[-1],
        "internal_expected_months": len(exp),
        "internal_missing_months": len(missing),
        "ok": len(missing) == 0,
        "trailing_lag_months": max(0, (pd.Period(end, "M") - pd.Period(months[-1], "M")).n),
        "missing_sample": missing[:12],
    }


# ---- 저장 ---------------------------------------------------------------------
def save_csv(df, name: str, simulated: bool = False) -> Path:
    import pandas as pd
    out = (SIM_DIR if simulated else OUTPUT_DIR) / name
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False, encoding="utf-8-sig")  # utf-8-sig: 엑셀 한글 호환
    log.info("저장 완료: %s  (%d행, %s)", out.name, len(df), _human(out.stat().st_size))
    return out


def _human(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f}{unit}"
        n /= 1024
    return f"{n:.1f}TB"


def banner(title: str):
    line = "=" * 70
    print(f"\n{line}\n  {title}\n{line}")
