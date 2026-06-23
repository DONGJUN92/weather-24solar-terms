# -*- coding: utf-8 -*-
"""
[참고사이트 #12] NASA GPM (Global Precipitation Measurement)
  https://gpm.nasa.gov/education/interactive/weather-climate-iquest

수집 대상 : GPM IMERG 월별 강수 (GPM_3IMERGM) — 한반도 영역, 최근 N개년.
키 : NASA Earthdata 로그인 (무료). ~/.netrc 또는 EARTHDATA_TOKEN.
     발급법 → API_KEY_발급_가이드.md
의존성(실수집 시) : pip install earthaccess xarray netcdf4 h5netcdf

사용 :
  python collect_nasa_gpm.py --years 5        # 실제 다운로드(Earthdata 로그인 필요)
  python collect_nasa_gpm.py --simulate       # 키 없이 검색조건/후처리 검증
"""
from __future__ import annotations
import argparse
import calendar
import glob
import os
from datetime import date

import pandas as pd

import common
from common import log, save_csv, banner, validate_monthly_complete

SHORT_NAME = "GPM_3IMERGM"     # IMERG Final, monthly
# earthaccess bounding_box = (West, South, East, North)
KOREA_BBOX = (124.0, 33.0, 132.0, 39.0)


def build_search(years: int, end_year: int) -> dict:
    """earthaccess 검색 파라미터 (순수함수 → 키 없이 검증 가능)."""
    start = f"{end_year - years + 1}-01-01"
    end = f"{end_year}-12-31"
    return {"short_name": SHORT_NAME, "temporal": (start, end), "bounding_box": KOREA_BBOX}


def granule_to_row(path: str, bbox=KOREA_BBOX) -> dict:
    """IMERG 월 granule(HDF5) → 한반도 영역평균 강수 1행.
    유니코드 경로 회피를 위해 파일객체+h5netcdf 사용, group='Grid'."""
    import xarray as xr
    W, S, E, N = bbox
    with open(path, "rb") as fh:
        d = xr.open_dataset(fh, engine="h5netcdf", group="Grid").load()
    sub = d["precipitation"].sel(lon=slice(W, E), lat=slice(S, N))
    rate = float(sub.mean())                       # mm/hr (월평균률)
    t = pd.to_datetime(str(d["time"].values[0])).normalize()
    hours = calendar.monthrange(t.year, t.month)[1] * 24
    return {"date": t, "precip_mm_per_hr": rate, "precip_mm_per_month": rate * hours}


def collect_imerg(years: int, end_year: int, bbox=KOREA_BBOX, keep_files=False) -> pd.DataFrame:
    """연도별 검색→다운로드→추출→(정리). Earthdata 로그인 필요."""
    import earthaccess
    earthaccess.login(strategy="environment")      # EARTHDATA_USERNAME/PASSWORD
    tmp = common.OUTPUT_DIR / "_gpm_tmp"
    tmp.mkdir(exist_ok=True)
    start_year = end_year - years + 1
    today = date.today().isoformat()
    rows = []
    for y in range(start_year, end_year + 1):
        t_end = min(f"{y}-12-31", today)
        res = earthaccess.search_data(short_name=SHORT_NAME,
                                      temporal=(f"{y}-01-01", t_end), bounding_box=bbox)
        log.info("  %d년: granule %d개 다운로드", y, len(res))
        if not res:
            continue
        files = earthaccess.download(res, str(tmp))
        for f in sorted(map(str, files)):
            try:
                rows.append(granule_to_row(f, bbox))
            except Exception as ex:
                log.error("   추출 실패(%s): %s", os.path.basename(f), ex)
        if not keep_files:
            for f in glob.glob(str(tmp / "*.HDF5")):
                os.remove(f)
    return pd.DataFrame(rows).sort_values("date").reset_index(drop=True)


def run(years: int, end_year: int):
    banner("NASA GPM IMERG — 월별 강수(한반도) 수집")
    log.info("기간: %d~%d, 영역 bbox=%s", end_year - years + 1, end_year, KOREA_BBOX)
    df = collect_imerg(years, end_year)
    if df.empty:
        raise SystemExit("수집 0건 — Earthdata 로그인/ GESDISC 앱 승인 확인 필요.")
    save_csv(df, f"nasa_gpm_imerg_korea_monthly_{end_year - years + 1}_{end_year}.csv")
    rep = validate_monthly_complete(df, "date", date(end_year - years + 1, 1, 1), date(end_year, 12, 31))
    log.info("검증: 커버 %s~%s | 내부결측 %d개월 | 최신지연 %d개월 | ok=%s",
             rep["coverage_first"], rep["coverage_last"], rep["internal_missing_months"],
             rep["trailing_lag_months"], rep["ok"])
    return rep


def simulate():
    banner("[SIMULATE] NASA GPM — 키 없이 검색조건/후처리 검증")
    # (1) 검색 파라미터 검증
    s = build_search(5, 2025)
    assert s["short_name"] == "GPM_3IMERGM"
    assert s["temporal"] == ("2021-01-01", "2025-12-31"), s["temporal"]
    assert s["bounding_box"] == KOREA_BBOX
    print(f"  ✓ 검색조건 정상 (기간 {s['temporal']}, bbox={s['bounding_box']})")

    # (2) 파일 추출 결과 모사 → 월별 검증/저장
    months = pd.date_range("2021-01-01", "2025-12-01", freq="MS")
    df = pd.DataFrame({"date": months,
                       "precip_mean": [0.1 + (i % 12) * 0.02 for i in range(len(months))]})
    rep = validate_monthly_complete(df, "date", date(2021, 1, 1), date(2025, 12, 31))
    assert rep["internal_missing_months"] == 0 and rep["rows"] == 60, rep
    save_csv(df, "nasa_gpm_imerg_korea_monthly_SIM.csv", simulated=True)
    print("  ✓ 영역평균 추출 모사·월연속성(60개월, 결측0) 검증 정상")

    for mod in ("earthaccess", "xarray"):
        try:
            __import__(mod); st = "설치됨"
        except Exception:
            st = "미설치(실수집 시 pip install 필요)"
        print(f"    - 의존성 {mod}: {st}")
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
        try:
            run(a.years, a.end_year)
        except ImportError as e:
            raise SystemExit(f"의존성 누락: {e}. → pip install earthaccess xarray netcdf4 / 로그인은 가이드 참고")


if __name__ == "__main__":
    main()
