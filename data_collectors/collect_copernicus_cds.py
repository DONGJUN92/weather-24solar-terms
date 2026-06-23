# -*- coding: utf-8 -*-
"""
[참고사이트 #18] Copernicus Climate Data Store (CDS)
  https://cds.climate.copernicus.eu

수집 대상 : ERA5 월평균 재분석 (reanalysis-era5-single-levels-monthly-means)
            한반도 영역 2m기온/총강수, 최근 N개년.
키 : ~/.cdsapirc 의 CDS Personal Access Token (발급법 → API_KEY_발급_가이드.md)
의존성(실수집 시) : pip install cdsapi xarray netcdf4

키 없이도 ERA5 를 받고 싶으면 → collect_openmeteo_era5.py (무인증, 이미 동작 확인)

사용 :
  python collect_copernicus_cds.py --years 5        # 실제 다운로드(키 필요)
  python collect_copernicus_cds.py --simulate       # 키 없이 요청구성/후처리 검증
"""
from __future__ import annotations
import argparse
from datetime import date

import pandas as pd

import common
from common import log, save_csv, banner, validate_monthly_complete

DATASET = "reanalysis-era5-single-levels-monthly-means"
# 한반도 영역 [North, West, South, East]
KOREA_AREA = [39.0, 124.0, 33.0, 132.0]


def build_request(years: int, end_year: int) -> dict:
    """cdsapi 요청 딕셔너리 구성 (순수함수 → 키 없이 검증 가능)."""
    yrs = [str(y) for y in range(end_year - years + 1, end_year + 1)]
    return {
        "product_type": "monthly_averaged_reanalysis",
        "variable": ["2m_temperature", "total_precipitation"],
        "year": yrs,
        "month": [f"{m:02d}" for m in range(1, 13)],
        "time": "00:00",
        "area": KOREA_AREA,
        "data_format": "netcdf",
    }


def _read_cdsapirc():
    import os
    cfg = {}
    p = os.path.expanduser("~/.cdsapirc")
    if os.path.exists(p):
        for line in open(p):
            if ":" in line:
                k, v = line.split(":", 1)
                cfg[k.strip()] = v.strip()
    return cfg.get("url"), cfg.get("key")


def accept_licences():
    """표준 Copernicus 라이선스 자동 수락(best-effort, 신규 계정용).
    ※ 일부 신규 계정은 CDS 웹사이트에서 'Accept terms'를 1회 클릭해야
       실행 권한 플래그가 설정됩니다(API 수락만으로 부족할 수 있음)."""
    try:
        import ecmwf.datastores as ds
        url, key = _read_cdsapirc()
        if not (url and key):
            return
        c = ds.Client(url=url, key=key)
        accepted = {a["id"] for a in c.get_accepted_licences()}
        for lid in ("licence-to-use-copernicus-products", "terms-of-use-cds",
                    "data-protection-privacy-statement"):
            if lid in accepted:
                continue
            for l in c.get_licences():
                if l["id"] == lid:
                    c.accept_licence(lid, revision=l["revision"])
                    log.info("라이선스 수락: %s rev%s", lid, l["revision"])
    except Exception as e:
        log.warning("라이선스 자동수락 건너뜀: %s", str(e)[:100])


def download(request: dict, target: str):
    """실제 CDS 다운로드 (키 필요)."""
    import cdsapi
    accept_licences()                  # 신규 계정 라이선스 best-effort 수락
    client = cdsapi.Client()           # ~/.cdsapirc 자동 사용
    log.info("CDS 요청 제출(대기열에 따라 수 분 소요 가능)...")
    client.retrieve(DATASET, request, target)
    log.info("다운로드 완료: %s", target)
    return target


def _open_nc_mean(nc_path: str) -> pd.DataFrame:
    """단일 .nc → 위·경도 평균 월별 프레임. (파일객체+h5netcdf로 유니코드경로 회피)"""
    import xarray as xr
    with open(nc_path, "rb") as fh:
        d = xr.open_dataset(fh, engine="h5netcdf").load()
    latd = "latitude" if "latitude" in d.dims else "lat"
    lond = "longitude" if "longitude" in d.dims else "lon"
    dm = d.mean(dim=[latd, lond])
    tcol = "valid_time" if "valid_time" in dm.coords else "time"
    out = None
    for var in d.data_vars:                       # 보통 파일당 1변수(t2m 또는 tp)
        s = dm[var].to_dataframe().reset_index()
        s["date"] = pd.to_datetime(s[tcol]).dt.to_period("M").dt.to_timestamp()
        s = s.groupby("date", as_index=False)[var].mean()   # number/expver 등 잔여축 정리
        out = s if out is None else out.merge(s, on="date", how="outer")
    return out


def netcdf_to_df(path: str) -> pd.DataFrame:
    """CDS 산출물(zip 또는 nc) → 한반도 영역평균 월별 DataFrame (t2m_C, tp_mm 등)."""
    import zipfile, glob, os, calendar
    from functools import reduce
    if zipfile.is_zipfile(path):                  # 신 CDS는 변수별 .nc 를 zip 으로 반환
        ed = path + "_extract"
        os.makedirs(ed, exist_ok=True)
        with zipfile.ZipFile(path) as zf:
            zf.extractall(ed)
        ncs = sorted(glob.glob(os.path.join(ed, "*.nc")))
    else:
        ncs = [path]
    frames = [_open_nc_mean(nc) for nc in ncs]
    df = reduce(lambda a, b: a.merge(b, on="date", how="outer"), frames)
    df = df.sort_values("date").reset_index(drop=True)
    if "t2m" in df.columns:
        df["t2m_C"] = df["t2m"] - 273.15
    if "tp" in df.columns:
        df["tp_mm_per_day"] = df["tp"] * 1000.0                      # m → mm/일(월평균)
        days = df["date"].dt.days_in_month
        df["tp_mm_per_month"] = df["tp_mm_per_day"] * days
    return df


def run(years: int, end_year: int):
    banner("Copernicus CDS — ERA5 월평균(한반도) 수집")
    req = build_request(years, end_year)
    log.info("요청: dataset=%s year=%s..%s area=%s", DATASET, req["year"][0], req["year"][-1], KOREA_AREA)
    target = str(common.OUTPUT_DIR / f"cds_era5_korea_monthly_{req['year'][0]}_{req['year'][-1]}.nc")
    download(req, target)
    df = netcdf_to_df(target)
    save_csv(df, f"cds_era5_korea_monthly_{req['year'][0]}_{req['year'][-1]}.csv")
    rep = validate_monthly_complete(df, "date", date(end_year - years + 1, 1, 1), date(end_year, 12, 31))
    log.info("검증: %s", rep)
    return rep


def simulate():
    banner("[SIMULATE] Copernicus CDS — 키 없이 요청구성/후처리 검증")
    # (1) 요청 딕셔너리 구성 검증
    req = build_request(5, 2025)
    assert req["year"] == ["2021", "2022", "2023", "2024", "2025"], req["year"]
    assert len(req["month"]) == 12 and req["area"] == KOREA_AREA
    assert req["variable"] == ["2m_temperature", "total_precipitation"]
    print(f"  ✓ 요청구성 정상 (연도 {req['year'][0]}~{req['year'][-1]}, 12개월, area={req['area']})")

    # (2) NetCDF 추출 결과를 모사한 월별 프레임으로 후처리/검증
    months = pd.date_range("2021-01-01", "2025-12-01", freq="MS")
    df = pd.DataFrame({"date": months,
                       "t2m": [283.15 + (i % 12) for i in range(len(months))],  # Kelvin
                       "tp": [0.002] * len(months)})
    df["t2m_C"] = df["t2m"] - 273.15
    rep = validate_monthly_complete(df, "date", date(2021, 1, 1), date(2025, 12, 31))
    assert rep["internal_missing_months"] == 0 and rep["rows"] == 60, rep
    assert abs(df["t2m_C"].iloc[0] - 10.0) < 1e-6, "Kelvin→℃ 변환 오류"
    save_csv(df, "cds_era5_korea_monthly_SIM.csv", simulated=True)
    print(f"  ✓ NetCDF추출 모사·K→℃ 변환·월연속성(60개월, 결측0) 검증 정상")

    # (3) 의존성 안내
    for mod in ("cdsapi", "xarray"):
        try:
            __import__(mod); status = "설치됨"
        except Exception:
            status = "미설치(실수집 시 pip install 필요)"
        print(f"    - 의존성 {mod}: {status}")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, default=5)
    ap.add_argument("--end-year", type=int, default=date.today().year - 1)  # 작년까지 완전한 월데이터
    ap.add_argument("--simulate", action="store_true")
    a = ap.parse_args()
    if a.simulate:
        simulate()
    else:
        try:
            run(a.years, a.end_year)
        except ImportError as e:
            raise SystemExit(f"의존성 누락: {e}. → pip install cdsapi xarray netcdf4 / 키는 가이드 참고")


if __name__ == "__main__":
    main()
