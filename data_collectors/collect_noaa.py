# -*- coding: utf-8 -*-
"""
[참고사이트 #9] NOAA Climate.gov Maps & Data  →  실제 데이터는 NOAA NCEI / GML
  https://www.climate.gov/maps-data

키 불필요(완전 공개) 두 가지 핵심 데이터:
  (A) NOAA GML 마우나로아 월별 대기중 CO2  (전세계 기후 기준선)
  (B) NOAA NCEI GSOD 일자료 — 한국 주요 관측소 (Seoul/Busan/Incheon/Daegu/Jeju)
      * 본 대회 'KMA 관측데이터'와 동일 성격의 일 단위 기상관측을 키 없이 확보 가능

사용 :
  python collect_noaa.py --years 5
  python collect_noaa.py --simulate
"""
from __future__ import annotations
import argparse
import io
from datetime import date

import pandas as pd

import common
from common import (log, make_session, http_get, save_csv, banner,
                    validate_daily_complete, validate_monthly_complete, year_range)

GML_CO2_URL = "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_mlo.csv"
GSOD_BASE = "https://www.ncei.noaa.gov/data/global-summary-of-the-day/access"

# WMO번호(기상청) → GSOD 스테이션ID = "{wmo}099999"
KR_STATIONS = {
    "Seoul":   "47108099999",
    "Busan":   "47159099999",
    "Incheon": "47112099999",
    "Daegu":   "47143099999",
    "Jeju":    "47184099999",
}

# GSOD 결측 센티넬
SENTINELS = {"TEMP": 9999.9, "DEWP": 9999.9, "SLP": 9999.9, "STP": 9999.9,
             "VISIB": 999.9, "WDSP": 999.9, "MXSPD": 999.9, "GUST": 999.9,
             "MAX": 9999.9, "MIN": 9999.9, "PRCP": 99.99, "SNDP": 999.9}


# ----------------------------- (A) GML CO2 ------------------------------------
def parse_gml_co2(text: str) -> pd.DataFrame:
    df = pd.read_csv(io.StringIO(text), comment="#")
    df.columns = [c.strip() for c in df.columns]
    df["date"] = pd.to_datetime(dict(year=df["year"], month=df["month"], day=1))
    df = df.replace({-9.99: pd.NA, -0.99: pd.NA, -1: pd.NA})
    return df


def collect_gml_co2(session, years: int, end: date):
    log.info("[A] NOAA GML 마우나로아 월별 CO2")
    r = http_get(session, GML_CO2_URL)
    r.raise_for_status()
    df = parse_gml_co2(r.text)
    save_csv(df, "noaa_gml_co2_monthly_FULL.csv")
    start, _ = year_range(years, end)
    recent = df[df["date"] >= pd.Timestamp(start)].copy()
    save_csv(recent, f"noaa_gml_co2_monthly_recent{years}y.csv")
    rep = validate_monthly_complete(recent, "date", start, end)
    log.info("  검증(월 연속성): %s", rep)
    return rep


# ----------------------------- (B) GSOD daily ---------------------------------
def to_numeric_clean(df: pd.DataFrame) -> pd.DataFrame:
    for col, sent in SENTINELS.items():
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").replace(sent, pd.NA)
    # 편의 단위 변환 (°F→°C, inch→mm)
    for f, c in (("TEMP", "TEMP_C"), ("MAX", "MAX_C"), ("MIN", "MIN_C")):
        if f in df.columns:
            df[c] = (pd.to_numeric(df[f], errors="coerce") - 32) * 5.0 / 9.0
    if "PRCP" in df.columns:
        df["PRCP_mm"] = pd.to_numeric(df["PRCP"], errors="coerce") * 25.4
    return df


def fetch_gsod_year(session, station: str, year: int) -> pd.DataFrame | None:
    url = f"{GSOD_BASE}/{year}/{station}.csv"
    r = http_get(session, url)
    if r.status_code == 404:
        log.warning("    %d/%s 없음(404)", year, station)
        return None
    r.raise_for_status()
    return pd.read_csv(io.StringIO(r.text))


def collect_gsod(session, years: int, end: date, stations: dict):
    start, _ = year_range(years, end)
    yrs = list(range(start.year, end.year + 1))
    summary = []
    for name, sid in stations.items():
        log.info("[B] GSOD 일자료: %s (%s) %d~%d", name, sid, yrs[0], yrs[-1])
        frames = []
        for y in yrs:
            d = fetch_gsod_year(session, sid, y)
            if d is not None and len(d):
                frames.append(d)
        if not frames:
            log.error("    ✗ %s: 수집된 연도 없음", name)
            continue
        df = pd.concat(frames, ignore_index=True)
        df = to_numeric_clean(df)
        df["DATE"] = pd.to_datetime(df["DATE"])
        df = df.sort_values("DATE").reset_index(drop=True)
        save_csv(df, f"noaa_gsod_{name}_{yrs[0]}_{yrs[-1]}.csv")
        rep = validate_daily_complete(df, "DATE", start, end, allow_missing_ratio=0.05)
        log.info("    검증: 커버 %s~%s | 내부결측 %d/%d (%.1f%%) | 최신지연 %d일 | ok=%s",
                 rep["coverage_first"], rep["coverage_last"],
                 rep["internal_missing"], rep["internal_expected"],
                 rep["internal_missing_ratio"] * 100, rep["trailing_lag_days"], rep["ok"])
        summary.append((name, rep))
    return summary


# ----------------------------- 시뮬레이션 -------------------------------------
def simulate():
    banner("[SIMULATE] NOAA — 합성 데이터로 코드 경로 검증")
    # (A) CO2 텍스트 모사 (주석+헤더+데이터)
    co2_text = ("# comment line\n"
                "year,month,decimal date,average,deseasonalized,ndays,sdev,unc\n"
                "2024,1,2024.04,422.0,421.0,29,0.2,0.1\n"
                "2024,2,2024.12,423.5,421.5,27,0.3,0.1\n")
    co2 = parse_gml_co2(co2_text)
    assert {"date", "average"}.issubset(co2.columns) and len(co2) == 2
    save_csv(co2, "noaa_gml_co2_monthly_FULL.csv", simulated=True)
    print("  ✓ (A) CO2 주석/헤더 파싱 정상")

    # (B) GSOD 한 해치 모사 (전체 1년, 중간 1일 누락 + 센티넬 포함)
    rng = pd.date_range("2024-01-01", "2024-12-31", freq="D")
    g = pd.DataFrame({
        "STATION": ["47108099999"] * len(rng),
        "DATE": rng.astype(str),
        "TEMP": [50.0] * (len(rng) - 1) + [9999.9],   # 마지막 1개 센티넬
        "MAX": [60.0] * len(rng), "MIN": [40.0] * len(rng),
        "PRCP": [0.04] * len(rng),
    })
    g = g[g["DATE"] != "2024-06-15"].reset_index(drop=True)   # 중간 1일 일부러 누락
    g = to_numeric_clean(g)
    g["DATE"] = pd.to_datetime(g["DATE"])
    assert abs(g["TEMP_C"].iloc[0] - 10.0) < 1e-6, "°F→°C 변환 오류"
    assert pd.isna(g["TEMP"].iloc[-1]), "센티넬(9999.9) 결측 처리 실패"
    assert abs(g["PRCP_mm"].iloc[0] - 1.016) < 1e-3, "inch→mm 변환 오류"
    rep = validate_daily_complete(g, "DATE", date(2024, 1, 1), date(2024, 12, 31),
                                  allow_missing_ratio=0.05)
    assert rep["internal_missing"] == 1, f"내부 결측 탐지 오류: {rep}"
    assert rep["missing_sample"] == ["2024-06-15"], f"결측일 식별 오류: {rep}"
    save_csv(g, "noaa_gsod_Seoul_SIM.csv", simulated=True)
    print(f"  ✓ (B) GSOD 단위변환·센티넬·내부결측 탐지 정상 (누락일 {rep['missing_sample']} 정확히 식별)")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, default=5)
    ap.add_argument("--end", type=str, default=date.today().isoformat())
    ap.add_argument("--stations", nargs="*", default=list(KR_STATIONS))
    ap.add_argument("--simulate", action="store_true")
    a = ap.parse_args()
    if a.simulate:
        simulate(); return
    end = date.fromisoformat(a.end)
    sel = {k: KR_STATIONS[k] for k in a.stations if k in KR_STATIONS}
    banner("NOAA NCEI / GML 수집")
    session = make_session()
    collect_gml_co2(session, a.years, end)
    res = collect_gsod(session, a.years, end, sel)
    banner("요약")
    for name, rep in res:
        print(f"  - GSOD {name:8s} {rep['coverage_first']}~{rep['coverage_last']}  "
              f"{rep['rows']:>5d}행  내부결측 {rep['internal_missing']:>3d}일  "
              f"최신지연 {rep['trailing_lag_days']:>3d}일  ok={rep['ok']}")


if __name__ == "__main__":
    main()
