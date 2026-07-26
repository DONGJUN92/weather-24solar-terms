# -*- coding: utf-8 -*-
"""
배포 데이터 회귀 검증 게이트 (레드팀 RC-I).

기존 verify_web_data.py는 구 자산(web_data/*.json)만 검사했고, 정작 배포본이 유일하게 읽는
prototype/solar_terms_data.js에 대한 assert가 0개였다. 이 스크립트가 그 공백을 메운다.

검사 항목
  A. 구조     — 16지점, 곡선 365개, None/NaN 없음, 임계값 그리드가 화면 슬라이더 전 범위를 덮는가
  B. 표본     — 불완결 연도(2026 등)가 평년 비교에 섞이지 않았는가, 연도 목록이 기록되었는가
  C. 단조성   — 기준이 높아질 때 '기준 이상 일수'가 늘어나지 않는가
  D. 실측대조 — 사전계산값이 원시 CSV에서 다시 센 값과 일치하는가 (RC-A의 핵심 회귀 테스트)
  E. 방향     — 강수·습도 지표의 증감 방향이 실측과 일치하는가 (평활 곡선 시절의 부호 역전 재발 방지)
  F. 하드코딩 — verify.js·교사_학습지.html·데모_대본.md에 박힌 수치가 현재 데이터와 일치하는가

실행: python verify_solar_terms.py   (실패 시 exit code 1)
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path
import numpy as np
import pandas as pd
try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

BASE = Path(__file__).resolve().parent.parent
JS = BASE / "prototype" / "solar_terms_data.js"
SRC = BASE / "data_collectors" / "output" / "allyears"
MIN_DAYS = 350
GRIDS = {"temp": range(20, 35), "humidity": range(55, 96), "precip": range(1, 21)}
FILL0 = {"precip"}
COL = {"temp": "avgTa", "humidity": "avgRhm", "precip": "sumRn"}

fails, warns, checks = [], [], [0]


def ck(cond, msg):
    checks[0] += 1
    if not cond:
        fails.append(msg)


def load_data():
    raw = JS.read_text(encoding="utf-8")
    return json.loads(raw[raw.index("=") + 1: raw.rstrip().rstrip(";").rindex("}") + 1])


def raw_frame(name):
    df = pd.read_csv(SRC / f"kma_allyears_{name}.csv")
    df["date"] = pd.to_datetime(df["date"])
    df["year"] = df["date"].dt.year
    return df


def recompute(df, metric, years):
    """build_solar_terms.exceed_stats와 독립적으로 다시 센다(같은 규칙, 다른 코드 경로)."""
    col = COL[metric]
    sub = df[df["year"].isin(years)].copy()
    s = pd.to_numeric(sub[col], errors="coerce")
    if metric in FILL0:
        s = s.fillna(0.0)
    sub = sub.assign(_v=s)
    sub = sub[~((sub["date"].dt.month == 2) & (sub["date"].dt.day == 29))]
    doy = sub["date"].dt.dayofyear.to_numpy()
    leap = sub["date"].dt.is_leap_year.to_numpy() & (sub["date"].dt.month.to_numpy() > 2)
    doy = np.where(leap, doy - 1, doy)
    yr, val = sub["year"].to_numpy(), sub["_v"].to_numpy(dtype=float)
    days, last = {}, {}
    for thr in GRIDS[metric]:
        hit = val >= thr
        cnt, lst = [], []
        for y in years:
            h = hit & (yr == y)
            cnt.append(int(h.sum()))
            if h.any():
                lst.append(int(doy[h].max()))
        days[str(thr)] = round(float(np.mean(cnt)), 1)
        last[str(thr)] = [int(round(float(np.mean(lst)))), len(lst)] if lst else None
    return days, last


def main():
    print("=" * 70)
    print("  solar_terms_data.js 회귀 검증 (RC-I)")
    print("=" * 70)
    ck(JS.exists(), "prototype/solar_terms_data.js 가 없습니다")
    if fails:
        return report()
    D = load_data()
    cities = D["cities"]

    # ── A. 구조 ────────────────────────────────────────────────
    ck(len(cities) == 16, f"A: 지점이 16개가 아닙니다 ({len(cities)}개)")
    for name, c in cities.items():
        ck("station" in c and "sid" in c, f"A: {name} 관측소 실명/지점번호 누락 (RC-J: '도' 칩 고지에 필요)")
        for mk in GRIDS:
            ck(mk in c, f"A: {name}.{mk} 누락")
            if mk not in c:
                continue
            for pk in ("past", "present"):
                arr = c[mk][pk]
                ck(len(arr) == 365, f"A: {name}.{mk}.{pk} 길이 {len(arr)} (365 아님)")
                ck(all(v is not None for v in arr), f"A: {name}.{mk}.{pk} None 포함")
                grid = c[mk]["exceedDays"][pk]
                missing = [t for t in GRIDS[mk] if str(t) not in grid]
                ck(not missing, f"A: {name}.{mk}.exceedDays.{pk} 임계값 누락 {missing[:5]}")
            if mk == "temp":
                ck("lastDoy" in c[mk], f"A: {name}.temp.lastDoy 누락 (화면 showLast가 참조)")
                for pk in ("past", "present"):
                    for t, v in c[mk]["lastDoy"][pk].items():
                        ck(v is None or (isinstance(v, list) and len(v) == 2 and 1 <= v[0] <= 365),
                           f"A: {name}.temp.lastDoy.{pk}[{t}] 형식 오류 {v}")
            else:
                ck("lastDoy" not in c[mk], f"A: {name}.{mk}에 lastDoy가 있습니다(화면은 쓰지 않음)")

    # ── B. 표본 (RC-C) ─────────────────────────────────────────
    for name, c in cities.items():
        y = c.get("years", {})
        ck(y.get("past") and y.get("present"), f"B: {name} years 기록 누락 (표본 수 표기에 필요)")
        for pk in ("past", "present"):
            for yr in y.get(pk, []):
                df = raw_frame(name)
                n = int((df["year"] == yr).sum())
                ck(n >= MIN_DAYS, f"B: {name} {pk}에 불완결 연도 {yr}({n}일) 포함 — RC-C 위반")
        ck(2026 not in y.get("present", []), f"B: {name} present에 2026(부분연도) 포함 — RC-C 위반")
        ck(len(y.get("present", [])) == 5, f"B: {name} present 완결 연도 {len(y.get('present', []))}개 (5개 기대)")
    ck(D["periods"]["present"] == "2021–2025", f"B: periods.present = {D['periods']['present']} (2021–2025 기대)")

    # ── C. 단조성 ──────────────────────────────────────────────
    for name, c in cities.items():
        for mk in GRIDS:
            for pk in ("past", "present"):
                g = c[mk]["exceedDays"][pk]
                seq = [g[str(t)] for t in GRIDS[mk]]
                bad = [(GRIDS[mk][i], seq[i], seq[i + 1]) for i in range(len(seq) - 1) if seq[i + 1] > seq[i] + 1e-9]
                ck(not bad, f"C: {name}.{mk}.{pk} 기준↑인데 일수↑ {bad[:3]}")

    # ── D. 실측 대조 (RC-A 핵심) ────────────────────────────────
    sample = ["서울", "제주", "강원", "경남", "충북"]
    for name in sample:
        df = raw_frame(name)
        for mk in GRIDS:
            for pk in ("past", "present"):
                years = cities[name]["years"][pk]
                days, last = recompute(df, mk, years)
                for t in GRIDS[mk]:
                    got = cities[name][mk]["exceedDays"][pk][str(t)]
                    ck(abs(got - days[str(t)]) < 0.05,
                       f"D: {name}.{mk}.{pk} thr={t} 일수 불일치 (데이터 {got} vs 실측 {days[str(t)]})")
                if mk == "temp":
                    for t in GRIDS[mk]:
                        got = cities[name][mk]["lastDoy"][pk][str(t)]
                        ck(got == last[str(t)],
                           f"D: {name}.temp.{pk} thr={t} 마지막초과 불일치 ({got} vs {last[str(t)]})")

    # ── E. 방향 (부호 역전 재발 방지) ────────────────────────────
    for name, c in cities.items():
        df = raw_frame(name)
        for mk in GRIDS:
            for t in list(GRIDS[mk])[::5]:
                p = c[mk]["exceedDays"]["past"][str(t)]
                q = c[mk]["exceedDays"]["present"][str(t)]
                dp, _ = recompute(df, mk, c["years"]["past"])
                dq, _ = recompute(df, mk, c["years"]["present"])
                real = dq[str(t)] - dp[str(t)]
                shown = q - p
                ck(real == 0 or shown == 0 or (real > 0) == (shown > 0),
                   f"E: {name}.{mk} thr={t} 증감 방향 역전 (화면 {shown:+.1f} vs 실측 {real:+.1f})")

    # ── F. 하드코딩 수치 일치 ───────────────────────────────────
    s = cities["서울"]["temp"]
    d_past, d_now = s["exceedDays"]["past"]["25"], s["exceedDays"]["present"]["25"]
    l_past, l_now = s["lastDoy"]["past"]["25"], s["lastDoy"]["present"]["25"]
    drift = l_now[0] - l_past[0]
    print(f"\n  현재 기준값(서울·25℃): 연평균 {d_past}일 → {d_now}일 · 마지막초과 doy {l_past[0]} → {l_now[0]} (시차 {drift:+d}일)")
    for f in [BASE / "prototype" / "교사_학습지.html", BASE / "데모_대본.md"]:
        if not f.exists():
            continue
        txt = f.read_text(encoding="utf-8")
        stale = [m for m in ("과거 33일", "현재 82일", "+25일", "25일 늦", "2022–26", "2022-26", "2022–2026") if m in txt]
        if stale:
            warns.append(f"F: {f.name} 에 구버전 수치·기간 표기가 남아 있습니다 {stale} "
                         f"→ 현재값 {d_past}/{d_now}/{drift:+d}일, 기간 2021–25로 갱신 필요")
    vjs = (BASE / "prototype" / "verify.js").read_text(encoding="utf-8")
    for pat, why in [(r"1969–73 vs 2022–26", "무결성 문구의 현재 기간(2021–25)과 불일치"),
                     (r"2022–2026", "AI 증거카드 period가 현재 기간과 불일치"),
                     (r"lastExceed\('past', 25, city, 'temp'\)", "고향카드가 평활 곡선 함수를 직접 호출")]:
        if re.search(pat, vjs):
            warns.append(f"F: verify.js 에 '{pat}' — {why}")
    return report()


def report():
    print()
    if fails:
        print(f"  ✗ 실패 {len(fails)}건 / 검사 {checks[0]}건")
        for m in fails[:40]:
            print("    -", m)
        if len(fails) > 40:
            print(f"    … 외 {len(fails) - 40}건")
    else:
        print(f"  ✓ 전체 통과 — 검사 {checks[0]}건")
    if warns:
        print(f"\n  ⚠ 경고 {len(warns)}건 (배포 차단은 아니지만 반드시 확인)")
        for m in warns:
            print("    -", m)
    print("=" * 70)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
