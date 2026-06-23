# -*- coding: utf-8 -*-
"""
[참고사이트 #16/#17] ECMWF Forecasts / Charts
  https://www.ecmwf.int/en/forecasts

ECMWF 무인증(Open Data) = '최신 예보' GRIB (단기). 키 불필요.
  → 이 스크립트: 최신 IFS 오픈 예보(2m기온/총강수) GRIB 다운로드 (실데이터, 키 없음)
의존성 : pip install ecmwf-opendata   (다운로드용, 순수 파이썬)
         GRIB→배열 파싱까지 원하면 추가로 cfgrib/eccodes 필요(선택)

※ '최근 3~5개년 시계열'은 예보가 아니라 ERA5 재분석 영역입니다.
   → collect_openmeteo_era5.py (무인증, 이미 수집완료) 또는 collect_copernicus_cds.py 사용.

사용 :
  python collect_ecmwf_opendata.py            # 최신 오픈예보 GRIB 실제 다운로드
  python collect_ecmwf_opendata.py --simulate # 네트워크 없이 요청구성 검증
"""
from __future__ import annotations
import argparse

import common
from common import log, banner, OUTPUT_DIR


def build_request(steps):
    """retrieve 파라미터 구성 (순수함수 → 키/네트워크 없이 검증 가능)."""
    return {
        "type": "fc",                       # forecast
        "param": ["2t", "tp"],              # 2m기온, 총강수
        "step": list(steps),
        "target": str(OUTPUT_DIR / "ecmwf_opendata_latest_2t_tp.grib2"),
    }


def run(steps):
    banner("ECMWF Open Data — 최신 오픈 예보(2t/tp) GRIB 다운로드")
    from ecmwf.opendata import Client
    client = Client(source="ecmwf")
    req = build_request(steps)
    latest = client.latest(type="fc", param=["2t"])
    log.info("최신 가용 사이클: %s", latest)
    log.info("요청: param=%s step=%s", req["param"], req["step"])
    client.retrieve(type=req["type"], param=req["param"], step=req["step"], target=req["target"])
    from pathlib import Path
    p = Path(req["target"])
    log.info("다운로드 완료: %s (%.1f MB)", p.name, p.stat().st_size / 1024 / 1024)
    print("\n  ※ GRIB 배열 파싱은 cfgrib/eccodes 설치 후 xarray.open_dataset(engine='cfgrib')")
    return p


def simulate():
    banner("[SIMULATE] ECMWF Open Data — 네트워크 없이 요청구성 검증")
    req = build_request([0, 24, 48])
    assert req["type"] == "fc"
    assert req["param"] == ["2t", "tp"]
    assert req["step"] == [0, 24, 48]
    assert req["target"].endswith("ecmwf_opendata_latest_2t_tp.grib2")
    print(f"  ✓ 요청구성 정상 (type={req['type']}, param={req['param']}, step={req['step']})")
    try:
        import ecmwf.opendata  # noqa
        print("    - 의존성 ecmwf-opendata: 설치됨 (실다운로드 가능)")
    except Exception:
        print("    - 의존성 ecmwf-opendata: 미설치 → pip install ecmwf-opendata")
    print("    - 과거 3~5년 시계열은 collect_openmeteo_era5.py(ERA5) 사용 권장")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", nargs="*", type=int, default=[0, 24, 48])
    ap.add_argument("--simulate", action="store_true")
    a = ap.parse_args()
    if a.simulate:
        simulate()
    else:
        try:
            run(a.steps)
        except ImportError as e:
            raise SystemExit(f"의존성 누락: {e}. → pip install ecmwf-opendata")


if __name__ == "__main__":
    main()
