# -*- coding: utf-8 -*-
"""
[참고사이트 #2] 기상자료개방포털 오픈 API (data.kma.go.kr)  ★본 대회 핵심 데이터★
  https://data.kma.go.kr/api/selectApiList.do?pgmNo=42

수집 대상 : 종관기상관측(ASOS) '일자료' — 한국 주요 지점 최근 N개년 일별
            (평균/최고/최저기온, 일강수량, 평균풍속, 습도, 일조 등)

지원 소스 (둘 중 키 가진 쪽으로) :
  --source datago : 공공데이터포털 AsosDalyInfoService(JSON)  · 키=serviceKey  ← 기본(권장, 필드명이 명확)
  --source apihub : 기상청 API허브 kma_sfcdd3.php(TEXT)        · 키=authKey

키 발급 : ./API_KEY_발급_가이드.md 참고
사용 :
  set KMA_SERVICE_KEY=...     (Windows)  /  export KMA_SERVICE_KEY=...  (bash)
  python collect_kma_openapi.py --years 5 --source datago
  python collect_kma_openapi.py --simulate          # 키 없이 파싱/검증 로직 점검
"""
from __future__ import annotations
import argparse
import os
import io
import time
from datetime import date, timedelta

import pandas as pd

import common
from common import (log, make_session, http_get, save_csv, banner,
                    validate_daily_complete)

DATAGO_URL = "http://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList"
APIHUB_URL = "https://apihub.kma.go.kr/api/typ01/url/kma_sfcdd3.php"

# ASOS 주요 지점 (지점번호)
STATIONS = {
    "서울": "108", "부산": "159", "인천": "112", "대구": "143",
    "광주": "156", "대전": "133", "제주": "184", "강릉": "105",
}

# datago JSON 에서 숫자로 변환할 주요 필드
NUMERIC_FIELDS = ["avgTa", "minTa", "maxTa", "sumRn", "avgWs", "maxWs",
                  "avgRhm", "avgPs", "sumSsHr", "ddMes", "avgTd"]


# ============================ (1) 공공데이터포털 JSON ===========================
def fetch_datago_year(session, service_key, stn, y, end: date):
    # ASOS는 '전날'까지만 제공 → 종료일을 어제로 캡
    yday = date.today() - timedelta(days=1)
    s_date, e_date = date(y, 1, 1), min(date(y, 12, 31), end, yday)
    if e_date < s_date:
        return pd.DataFrame()
    s, e = s_date.strftime("%Y%m%d"), e_date.strftime("%Y%m%d")
    params = {
        "serviceKey": service_key, "pageNo": 1, "numOfRows": 700,
        "dataType": "JSON", "dataCd": "ASOS", "dateCd": "DAY",
        "startDt": s, "endDt": e, "stnIds": stn,
    }
    r = http_get(session, DATAGO_URL, params=params)
    r.raise_for_status()
    j = r.json()
    body = j.get("response", {}).get("body")
    header = j.get("response", {}).get("header", {})
    if header.get("resultCode") not in (None, "00"):
        raise RuntimeError(f"API 오류: {header.get('resultCode')} {header.get('resultMsg')}")
    if not body or not body.get("items"):
        return pd.DataFrame()
    items = body["items"]["item"]
    items = items if isinstance(items, list) else [items]
    return pd.DataFrame(items)


def clean_datago(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    if "tm" in df.columns:
        df = df.rename(columns={"tm": "date"})
    for c in NUMERIC_FIELDS:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    df["date"] = pd.to_datetime(df["date"])
    return df.sort_values("date").reset_index(drop=True)


def collect_datago(session, service_key, years, end, stations):
    start = date(end.year - years + 1, 1, 1)
    summary = []
    for name, stn in stations.items():
        log.info("[datago] %s(%s) %d~%d", name, stn, start.year, end.year)
        frames = []
        for y in range(start.year, end.year + 1):
            try:
                d = fetch_datago_year(session, service_key, stn, y, end)
                if len(d):
                    frames.append(d)
            except Exception as ex:
                log.error("   %d년 실패: %s", y, ex)
            time.sleep(0.4)
        if not frames:
            log.error("   ✗ %s 수집 0건", name); continue
        df = clean_datago(pd.concat(frames, ignore_index=True))
        save_csv(df, f"kma_asos_daily_{name}_{start.year}_{end.year}.csv")
        rep = validate_daily_complete(df, "date", start, end, allow_missing_ratio=0.03)
        log.info("   검증: 커버 %s~%s | 내부결측 %d/%d | ok=%s",
                 rep["coverage_first"], rep["coverage_last"],
                 rep["internal_missing"], rep["internal_expected"], rep["ok"])
        summary.append((name, rep))
    return summary


# ============================ (2) 기상청 API허브 TEXT ===========================
def parse_apihub_text(text: str) -> pd.DataFrame:
    """kma_sfcdd3.php 텍스트 → DataFrame. '#'/마커/빈줄 제거 후 공백분할(위치기반)."""
    rows = []
    for ln in text.splitlines():
        s = ln.strip()
        if not s or s.startswith("#") or "7777" in s:
            continue
        rows.append(s.split())
    if not rows:
        return pd.DataFrame()
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    df = pd.DataFrame(rows, columns=[f"col_{i:02d}" for i in range(width)])
    # 신뢰 가능한 선두 컬럼 별칭
    df = df.rename(columns={"col_00": "TM", "col_01": "STN"})
    df["date"] = pd.to_datetime(df["TM"], format="%Y%m%d", errors="coerce")
    return df


def collect_apihub(session, auth_key, years, end, stations):
    start = date(end.year - years + 1, 1, 1)
    summary = []
    for name, stn in stations.items():
        log.info("[apihub] %s(%s) %d~%d", name, stn, start.year, end.year)
        frames = []
        yday = date.today() - timedelta(days=1)
        for y in range(start.year, end.year + 1):
            e_date = min(date(y, 12, 31), end, yday)
            if e_date < date(y, 1, 1):
                continue
            tm1, tm2 = f"{y}0101", e_date.strftime("%Y%m%d")
            params = {"tm1": tm1, "tm2": tm2, "stn": stn, "help": 0, "authKey": auth_key}
            try:
                r = http_get(session, APIHUB_URL, params=params)
                r.raise_for_status()
                d = parse_apihub_text(r.text)
                if len(d):
                    frames.append(d)
            except Exception as ex:
                log.error("   %d년 실패: %s", y, ex)
            time.sleep(0.4)
        if not frames:
            log.error("   ✗ %s 수집 0건", name); continue
        df = pd.concat(frames, ignore_index=True).sort_values("date").reset_index(drop=True)
        save_csv(df, f"kma_asos_daily_apihub_{name}_{start.year}_{end.year}.csv")
        rep = validate_daily_complete(df, "date", start, end, allow_missing_ratio=0.03)
        log.info("   검증: 커버 %s~%s | 내부결측 %d/%d | ok=%s",
                 rep["coverage_first"], rep["coverage_last"],
                 rep["internal_missing"], rep["internal_expected"], rep["ok"])
        summary.append((name, rep))
    return summary


# ============================== 시뮬레이션 ====================================
def simulate():
    banner("[SIMULATE] KMA ASOS — 키 없이 파싱/검증 로직 점검")

    # (1) datago JSON 모사 (1년치, 중간 1일 누락)
    rng = [d for d in pd.date_range("2023-01-01", "2023-12-31") if d.strftime("%Y-%m-%d") != "2023-07-10"]
    item = lambda d: {"tm": d.strftime("%Y-%m-%d"), "stnId": "108", "stnNm": "서울",
                      "avgTa": "12.3", "minTa": "5.1", "maxTa": "19.8", "sumRn": "0.0",
                      "avgWs": "2.1", "avgRhm": "60.0"}
    fake = {"response": {"header": {"resultCode": "00", "resultMsg": "NORMAL_SERVICE"},
                         "body": {"items": {"item": [item(d) for d in rng]}}}}
    body = fake["response"]["body"]["items"]["item"]
    df = clean_datago(pd.DataFrame(body))
    assert df["avgTa"].dtype.kind == "f", "숫자 변환 실패"
    rep = validate_daily_complete(df, "date", date(2023, 1, 1), date(2023, 12, 31),
                                  allow_missing_ratio=0.03)
    assert rep["internal_missing"] == 1 and rep["missing_sample"] == ["2023-07-10"], rep
    save_csv(df, "kma_asos_daily_서울_SIM.csv", simulated=True)
    print(f"  ✓ (datago) JSON파싱·숫자변환·결측탐지 정상 (누락 {rep['missing_sample']} 식별)")

    # (2) apihub TEXT 모사
    txt = ("#START7777\n"
           "# TM STN TA_AVG TA_MAX TA_MIN RN_DAY\n"
           "20230101 108 -1.2 3.4 -5.6 0.0\n"
           "20230102 108 0.5 5.1 -3.2 1.2\n"
           "#7777END\n")
    d2 = parse_apihub_text(txt)
    assert len(d2) == 2 and d2["STN"].iloc[0] == "108", "apihub 위치파싱 실패"
    assert str(d2["date"].iloc[0].date()) == "2023-01-01", "날짜 파싱 실패"
    save_csv(d2, "kma_asos_daily_apihub_서울_SIM.csv", simulated=True)
    print("  ✓ (apihub) 텍스트 마커제거·위치기반 파싱·날짜 변환 정상")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, default=5)
    ap.add_argument("--end", type=str, default=date.today().isoformat())
    ap.add_argument("--source", choices=["datago", "apihub"], default="datago")
    ap.add_argument("--stations", nargs="*", default=list(STATIONS))
    ap.add_argument("--service-key", default=os.environ.get("KMA_SERVICE_KEY"))
    ap.add_argument("--auth-key", default=os.environ.get("KMA_AUTH_KEY"))
    ap.add_argument("--simulate", action="store_true")
    a = ap.parse_args()
    if a.simulate:
        simulate(); return

    end = date.fromisoformat(a.end)
    sel = {k: STATIONS[k] for k in a.stations if k in STATIONS}
    session = make_session()
    banner(f"KMA ASOS 일자료 수집 (source={a.source})")
    if a.source == "datago":
        if not a.service_key:
            raise SystemExit("KMA_SERVICE_KEY(공공데이터포털 serviceKey)가 필요합니다. "
                             "발급법은 API_KEY_발급_가이드.md 참고. (--simulate 로 코드 점검 가능)")
        res = collect_datago(session, a.service_key, a.years, end, sel)
    else:
        if not a.auth_key:
            raise SystemExit("KMA_AUTH_KEY(기상청 API허브 authKey)가 필요합니다. "
                             "발급법은 API_KEY_발급_가이드.md 참고. (--simulate 로 코드 점검 가능)")
        res = collect_apihub(session, a.auth_key, a.years, end, sel)
    banner("요약")
    for name, rep in res:
        print(f"  - {name} {rep['coverage_first']}~{rep['coverage_last']} "
              f"내부결측 {rep['internal_missing']}일 ok={rep['ok']}")


if __name__ == "__main__":
    main()
