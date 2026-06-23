# -*- coding: utf-8 -*-
"""
오케스트레이터 — 모든 수집기를 한 번에 실행/검증.

  python run_all.py --simulate     # 7개 수집기 전체 시뮬레이션(키 불필요) → 코드 정상동작 확인
  python run_all.py --keyless      # 무인증 소스 실제 수집(OWID/NOAA/Open-Meteo/ECMWF)
  python run_all.py --manifest     # output/ CSV 목록·행수 요약(MANIFEST.csv 생성)
"""
from __future__ import annotations
import argparse
import subprocess
import sys
from pathlib import Path

import common
from common import banner, log

HERE = Path(__file__).resolve().parent
PY = sys.executable

# (라벨, 스크립트, 무인증여부)
COLLECTORS = [
    ("OWID 기후데이터",         "collect_owid_climate.py",   True),
    ("NOAA(CO2+GSOD)",         "collect_noaa.py",            True),
    ("Open-Meteo(ERA5)",       "collect_openmeteo_era5.py",  True),
    ("ECMWF Open Data",        "collect_ecmwf_opendata.py",  True),
    ("IBTrACS 태풍경로",        "collect_ibtracs.py",         True),
    ("KMA ASOS(키필요)",        "collect_kma_openapi.py",     False),
    ("Copernicus CDS(키필요)",  "collect_copernicus_cds.py",  False),
    ("NASA GPM(키필요)",        "collect_nasa_gpm.py",        False),
]


def run_one(script, extra):
    r = subprocess.run([PY, str(HERE / script), *extra],
                       capture_output=True, text=True, encoding="utf-8")
    return r.returncode, r.stdout, r.stderr


def simulate_all():
    banner("전체 시뮬레이션 (키 불필요) — 코드 정상동작 검증")
    results = []
    for label, script, _ in COLLECTORS:
        code, out, err = run_one(script, ["--simulate"])
        ok = (code == 0) and ("✓" in out)
        results.append((label, ok))
        log.info("%-26s %s", label, "✅ PASS" if ok else "❌ FAIL")
        if not ok:
            print(out[-800:]); print(err[-800:])
    banner("시뮬레이션 결과")
    passed = sum(1 for _, ok in results if ok)
    for label, ok in results:
        print(f"  {'✅' if ok else '❌'}  {label}")
    print(f"\n  {passed}/{len(results)} 통과")
    return passed == len(results)


def keyless_collect():
    banner("무인증 소스 실제 수집")
    for label, script, keyless in COLLECTORS:
        if not keyless:
            continue
        args = ["--years", "5"] if script != "collect_ecmwf_opendata.py" else ["--steps", "0"]
        log.info("▶ %s", label)
        code, out, err = run_one(script, args)
        log.info("   %s (exit=%d)", "완료" if code == 0 else "오류", code)
        if code != 0:
            print(err[-800:])


def manifest():
    import pandas as pd
    out = common.OUTPUT_DIR
    rows = []
    for f in sorted(out.glob("*.csv")):
        try:
            n = sum(1 for _ in open(f, encoding="utf-8-sig")) - 1
        except Exception:
            n = -1
        rows.append({"file": f.name, "rows": n, "size_KB": round(f.stat().st_size / 1024, 1)})
    df = pd.DataFrame(rows)
    df.to_csv(out / "MANIFEST.csv", index=False, encoding="utf-8-sig")
    banner("output/ 매니페스트")
    print(df.to_string(index=False))
    print(f"\n  총 {len(df)}개 파일, {df['rows'].clip(lower=0).sum():,}행, {df['size_KB'].sum()/1024:.1f}MB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--simulate", action="store_true")
    ap.add_argument("--keyless", action="store_true")
    ap.add_argument("--manifest", action="store_true")
    a = ap.parse_args()
    if a.simulate:
        ok = simulate_all()
        sys.exit(0 if ok else 1)
    elif a.keyless:
        keyless_collect()
    elif a.manifest:
        manifest()
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
