# -*- coding: utf-8 -*-
"""
[추가 수집] 태풍 경로 — NOAA IBTrACS (International Best Track Archive)
  서태평양(WP) 분지, 최근 5개년. 키 불필요(완전 공개).
  → 대회 결과물 예시 #1 '태풍 형성·발달 원리 시뮬레이터'의 실데이터 기반.

사용 :
  python collect_ibtracs.py --years 5
  python collect_ibtracs.py --simulate
"""
from __future__ import annotations
import argparse
import io
from datetime import date

import pandas as pd

import common
from common import log, make_session, http_get, save_csv, banner

WP_URL = ("https://www.ncei.noaa.gov/data/"
          "international-best-track-archive-for-climate-stewardship-ibtracs/"
          "v04r01/access/csv/ibtracs.WP.list.v04r01.csv")

KEEP = ["SID", "SEASON", "NUMBER", "BASIN", "SUBBASIN", "NAME", "ISO_TIME",
        "NATURE", "LAT", "LON", "WMO_WIND", "WMO_PRES", "USA_WIND", "USA_PRES",
        "DIST2LAND", "LANDFALL"]


def parse_ibtracs(text: str, y0: int, y1: int) -> pd.DataFrame:
    df = pd.read_csv(io.StringIO(text), low_memory=False)
    df = df.iloc[1:].copy()                        # 1행=단위행 제거
    for c in ["SEASON", "LAT", "LON", "WMO_WIND", "WMO_PRES", "USA_WIND",
              "USA_PRES", "DIST2LAND", "LANDFALL"]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df[(df["SEASON"] >= y0) & (df["SEASON"] <= y1)].copy()
    df["ISO_TIME"] = pd.to_datetime(df["ISO_TIME"], errors="coerce")
    # 풍속/기압: WMO(도쿄 RSMC) 우선, 없으면 USA 보완
    df["wind_kt"] = df["WMO_WIND"].fillna(df.get("USA_WIND"))
    df["pres_mb"] = df["WMO_PRES"].fillna(df.get("USA_PRES"))
    keep = [c for c in KEEP if c in df.columns] + ["wind_kt", "pres_mb"]
    return df[keep].reset_index(drop=True)


def run(years: int, end_year: int):
    banner("NOAA IBTrACS — 서태평양 태풍 경로 수집")
    y0 = end_year - years + 1
    session = make_session()
    log.info("다운로드(약 110MB)…")
    r = http_get(session, WP_URL)
    r.raise_for_status()
    df = parse_ibtracs(r.text, y0, end_year)
    save_csv(df, f"ibtracs_wp_typhoons_{y0}_{end_year}.csv")
    n_storms = df["SID"].nunique()
    by_season = df.groupby("SEASON")["SID"].nunique()
    log.info("기간 %d~%d | 관측점 %d개 | 태풍 %d개", y0, end_year, len(df), n_storms)
    log.info("연도별 태풍 수:\n%s", by_season.to_string())
    return df


def simulate():
    banner("[SIMULATE] IBTrACS — 합성 CSV로 파싱 검증")
    txt = ("SID,SEASON,NUMBER,BASIN,SUBBASIN,NAME,ISO_TIME,NATURE,LAT,LON,WMO_WIND,WMO_PRES,USA_WIND,USA_PRES,DIST2LAND,LANDFALL\n"
           "Year,Year,#,BB,BB,Name,ISO,Nat,deg,deg,kts,mb,kts,mb,km,km\n"
           "2023123N12150,2023,11,WP,MM,KHANUN,2023-07-28 00:00:00,TS,18.0,130.0,65,975,70,972,200,150\n"
           "2023123N12150,2023,11,WP,MM,KHANUN,2023-07-28 06:00:00,TS,18.6,129.2,,,80,965,180,120\n"
           "2019200N10130,2019,5,WP,MM,OLD,2019-07-01 00:00:00,TS,12.0,140.0,50,990,55,988,300,250\n")
    df = parse_ibtracs(txt, 2021, 2026)
    assert df["SEASON"].min() >= 2021, "연도 필터 실패"           # 2019 제거 확인
    assert df["NAME"].iloc[0] == "KHANUN" and len(df) == 2
    assert df["wind_kt"].iloc[1] == 80, "WMO 결측 시 USA 보완 실패"  # 2번째행 WMO_WIND 비어→USA 80
    save_csv(df, "ibtracs_wp_typhoons_SIM.csv", simulated=True)
    print(f"  ✓ 단위행 제거·연도필터·풍속 coalesce(WMO→USA) 정상 ({len(df)}개 관측점)")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, default=5)
    ap.add_argument("--end-year", type=int, default=date.today().year)
    ap.add_argument("--simulate", action="store_true")
    a = ap.parse_args()
    if a.simulate:
        simulate()
    else:
        run(a.years, a.end_year)


if __name__ == "__main__":
    main()
