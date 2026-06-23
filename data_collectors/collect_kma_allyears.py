# -*- coding: utf-8 -*-
"""
타임랩스용 — 기상청 ASOS 일자료 1969~2026 전 연도 수집 (16개 지점).
8개 도시 + 8개 도(道) 대표지점. 10년 단위 페이지네이션(numOfRows=999).
저장: output/allyears/kma_allyears_<지점>.csv  (date, avgTa, avgRhm, sumRn)
"""
from __future__ import annotations
import os, time
from datetime import date, timedelta
import pandas as pd
import common
from common import log, make_session, http_get, banner

URL = "http://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList"
KEY = os.environ.get("KMA_SERVICE_KEY")

# name -> (stn, lat, lon, type)
STATIONS = {
    "서울": ("108", 37.5714, 126.9658, "city"), "부산": ("159", 35.1047, 129.0320, "city"),
    "인천": ("112", 37.4777, 126.6249, "city"), "대구": ("143", 35.8780, 128.6526, "city"),
    "광주": ("156", 35.1729, 126.8916, "city"), "대전": ("133", 36.3722, 127.3719, "city"),
    "제주": ("184", 33.5141, 126.5297, "city"), "강릉": ("105", 37.7515, 128.8910, "city"),
    "경기": ("119", 37.2571, 126.9831, "do"), "충북": ("131", 36.6392, 127.4407, "do"),
    "충남": ("129", 36.7766, 126.4939, "do"), "전북": ("146", 35.8409, 127.1192, "do"),
    "전남": ("165", 34.8170, 126.3812, "do"), "경북": ("138", 36.0320, 129.3800, "do"),
    "경남": ("192", 35.1639, 128.0401, "do"), "강원": ("101", 37.9026, 127.7357, "do"),
}
CHUNKS = [(1969, 1978), (1979, 1988), (1989, 1998), (1999, 2008), (2009, 2018), (2019, 2026)]
KEEP = ["tm", "avgTa", "avgRhm", "sumRn"]


def fetch_page(session, stn, s, e, page):
    p = {"serviceKey": KEY, "pageNo": page, "numOfRows": 999, "dataType": "JSON",
         "dataCd": "ASOS", "dateCd": "DAY", "startDt": s, "endDt": e, "stnIds": stn}
    r = http_get(session, URL, params=p, timeout=90)
    j = r.json()
    h = j["response"]["header"]
    if h.get("resultCode") not in (None, "00"):
        return None, h.get("resultMsg")
    b = j["response"].get("body")
    if not b or not b.get("items"):
        return [], "empty"
    it = b["items"]["item"]
    return (it if isinstance(it, list) else [it]), "ok"


def collect_station(session, name, stn):
    yday = date.today() - timedelta(days=1)
    rows = []
    for y0, y1 in CHUNKS:
        s = f"{y0}0101"
        ed = min(date(y1, 12, 31), yday)
        e = ed.strftime("%Y%m%d")
        page = 1
        while True:
            for attempt in range(3):
                try:
                    items, msg = fetch_page(session, stn, s, e, page)
                    break
                except Exception as ex:
                    log.warning("   %s %s-%s p%d 재시도(%d): %s", name, s, e, page, attempt+1, str(ex)[:40])
                    items, msg = None, str(ex)[:40]
                    time.sleep(2)
            if items is None:
                log.error("   %s %s-%s p%d 실패: %s", name, s, e, page, msg); break
            for it in items:
                rows.append({k: it.get(k) for k in KEEP})
            if len(items) < 999:
                break
            page += 1
            time.sleep(0.25)
        time.sleep(0.25)
    df = pd.DataFrame(rows).rename(columns={"tm": "date"})
    df = df.drop_duplicates("date").sort_values("date").reset_index(drop=True)
    return df


def main():
    if not KEY:
        raise SystemExit("KMA_SERVICE_KEY 환경변수가 필요합니다.")
    outdir = common.OUTPUT_DIR / "allyears"; outdir.mkdir(exist_ok=True)
    banner("KMA ASOS 1969~2026 전연도 수집 (16지점)")
    session = make_session()
    for name, (stn, lat, lon, typ) in STATIONS.items():
        t0 = time.time()
        df = collect_station(session, name, stn)
        out = outdir / f"kma_allyears_{name}.csv"
        df.to_csv(out, index=False, encoding="utf-8-sig")
        yrs = pd.to_datetime(df["date"]).dt.year
        log.info("✓ %s(%s): %d행 %d~%d (%.0fs)", name, stn, len(df), yrs.min(), yrs.max(), time.time()-t0)
    banner("완료")


if __name__ == "__main__":
    main()
