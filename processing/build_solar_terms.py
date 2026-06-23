# -*- coding: utf-8 -*-
"""
24절기 프로토타입 데이터 빌더 (v3).
입력: data_collectors/output/allyears/kma_allyears_<지점>.csv  (1969~2026, 16지점)
산출: web_data/solar_terms_climatology.json + prototype/solar_terms_data.js
  - 16지점(8도시+8도) 좌표/타입
  - 과거(1969~1973)·현재(2022~2026) 일평년곡선 × 3지표(기온/습도/강수)
  - timeline: 연별(1969~2025) 연평균/연합계 × 3지표 (타임랩스용)
  - nationwide: 16지점 연별 평균 (개인화용)
  - 24절기 한자 字풀이 + 특징
"""
from __future__ import annotations
import sys, json
from datetime import date
from pathlib import Path
import numpy as np
import pandas as pd
try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

BASE = Path(__file__).resolve().parent.parent
SRC = BASE / "data_collectors" / "output" / "allyears"
OUT_JSON = BASE / "web_data" / "solar_terms_climatology.json"
OUT_JS = BASE / "prototype" / "solar_terms_data.js"

STATIONS = {
    "서울": (37.5714, 126.9658, "city"), "부산": (35.1047, 129.0320, "city"),
    "인천": (37.4777, 126.6249, "city"), "대구": (35.8780, 128.6526, "city"),
    "광주": (35.1729, 126.8916, "city"), "대전": (36.3722, 127.3719, "city"),
    "제주": (33.5141, 126.5297, "city"), "강릉": (37.7515, 128.8910, "city"),
    "경기": (37.2571, 126.9831, "do"), "충북": (36.6392, 127.4407, "do"),
    "충남": (36.7766, 126.4939, "do"), "전북": (35.8409, 127.1192, "do"),
    "전남": (34.8170, 126.3812, "do"), "경북": (36.0320, 129.3800, "do"),
    "경남": (35.1639, 128.0401, "do"), "강원": (37.9026, 127.7357, "do"),
}
PAST = (1969, 1973); PRESENT = (2022, 2026)
METRICS = [("temp", "avgTa", "기온", "℃", 1, False),
           ("humidity", "avgRhm", "습도", "%", 0, False),
           ("precip", "sumRn", "강수량", "mm/일", 1, True)]

from importlib import import_module
TERMS = None
# 24절기(한자풀이/특징) — v2와 동일
TERMS = [
    ("소한","小寒",1,6,"본격 추위 시작","winter","작을 소(小)+찰 한(寒)","‘작은 추위’라는 이름과 달리 실제로는 한 해 중 가장 추운 시기. ‘대한이 소한 집에 놀러 갔다 얼어 죽는다’는 속담이 있다."),
    ("대한","大寒",1,20,"가장 추운 때","winter","클 대(大)+찰 한(寒)","‘큰 추위’. 겨울 추위의 매듭을 짓는 마지막 절기로, 이 무렵을 지나면 추위가 누그러진다."),
    ("입춘","立春",2,4,"봄의 시작","spring","설 립(立)+봄 춘(春)","봄이 시작되는 첫 절기. 대문에 ‘입춘대길(立春大吉)’을 써 붙여 한 해의 복과 풍년을 기원했다."),
    ("우수","雨水",2,19,"눈이 녹아 비가 됨","spring","비 우(雨)+물 수(水)","눈이 녹아 비가 되고 얼음이 풀려 물이 많아지는 때. 본격적으로 봄기운이 돈다."),
    ("경칩","驚蟄",3,6,"겨울잠 깬 벌레","spring","놀랄 경(驚)+숨을 칩(蟄)","겨울잠 자던 벌레와 개구리가 놀라 깨어나는 때. 만물이 활동을 시작한다."),
    ("춘분","春分",3,21,"낮과 밤이 같음(봄)","spring","봄 춘(春)+나눌 분(分)","봄의 한가운데로 낮과 밤의 길이가 같아진다. 이후로 낮이 점점 길어진다."),
    ("청명","淸明",4,5,"맑고 밝음","spring","맑을 청(淸)+밝을 명(明)","하늘이 맑고 밝아 농사 준비(논밭갈이)를 시작하는 때. 한식과 시기가 겹친다."),
    ("곡우","穀雨",4,20,"농사를 돕는 봄비","spring","곡식 곡(穀)+비 우(雨)","곡식을 윤택하게 하는 봄비가 내린다. 못자리를 마련하며 본격 농사철이 시작된다."),
    ("입하","立夏",5,6,"여름의 시작","summer","설 립(立)+여름 하(夏)","여름이 시작되는 절기. 초목이 무성해지고 농작물이 빠르게 자란다."),
    ("소만","小滿",5,21,"만물이 차오름","summer","작을 소(小)+찰 만(滿)","햇볕이 풍부해 만물이 점차 자라 가득 차기 시작한다. 보리가 익고 모내기를 준비한다."),
    ("망종","芒種",6,6,"씨 뿌리는 때","summer","까끄라기 망(芒)+씨 종(種)","보리처럼 까끄라기 있는 곡식을 거두고 벼를 심는 때. 농가가 일 년 중 가장 바쁘다."),
    ("하지","夏至",6,21,"낮이 가장 긴 날","summer","여름 하(夏)+이를 지(至)","여름의 절정에 ‘이른다’는 뜻. 낮이 일 년 중 가장 길다."),
    ("소서","小暑",7,7,"작은 더위","summer","작을 소(小)+더울 서(暑)","‘작은 더위’. 본격적인 더위가 시작되며 장마가 이어진다."),
    ("대서","大暑",7,23,"가장 더운 때","summer","클 대(大)+더울 서(暑)","‘큰 더위’. 장마가 끝나고 일 년 중 가장 무더운 시기로 폭염이 절정에 이른다."),
    ("입추","立秋",8,8,"가을의 시작","autumn","설 립(立)+가을 추(秋)","가을이 시작되는 절기. 한낮은 덥지만 아침저녁으로 서늘한 기운이 돌기 시작한다."),
    ("처서","處暑",8,23,"더위가 그침","autumn","곳·그칠 처(處)+더울 서(暑)","더위가 한풀 꺾여 ‘그치는’ 때. ‘처서가 지나면 모기 입이 비뚤어진다’는 말이 있다."),
    ("백로","白露",9,8,"흰 이슬이 맺힘","autumn","흰 백(白)+이슬 로(露)","밤 기온이 내려가 풀잎에 흰 이슬이 맺힌다. 가을 기운이 완연해진다."),
    ("추분","秋分",9,23,"낮과 밤이 같음(가을)","autumn","가을 추(秋)+나눌 분(分)","가을의 한가운데로 낮과 밤의 길이가 같아진다. 이후로 밤이 점점 길어진다."),
    ("한로","寒露",10,8,"차가운 이슬","autumn","찰 한(寒)+이슬 로(露)","찬 이슬이 맺히는 때. 단풍이 짙어지고 추수가 한창이다."),
    ("상강","霜降",10,24,"서리가 내림","autumn","서리 상(霜)+내릴 강(降)","서리가 내리기 시작한다. 첫서리로 단풍이 절정에 이르고 가을걷이를 마무리한다."),
    ("입동","立冬",11,7,"겨울의 시작","winter","설 립(立)+겨울 동(冬)","겨울이 시작되는 절기. 김장을 담그고 겨울 채비를 한다."),
    ("소설","小雪",11,22,"첫눈이 옴","winter","작을 소(小)+눈 설(雪)","첫눈이 내리기 시작하는 때. 살얼음이 얼고 본격적인 추위에 대비한다."),
    ("대설","大雪",12,7,"큰 눈이 옴","winter","클 대(大)+눈 설(雪)","‘큰 눈’이 내리는 때. 한 해 중 눈이 가장 많이 온다고 여겨졌다."),
    ("동지","冬至",12,22,"밤이 가장 긴 날","winter","겨울 동(冬)+이를 지(至)","겨울의 절정에 ‘이른다’는 뜻. 밤이 일 년 중 가장 길며 팥죽을 먹는 풍습이 있다."),
]


def md_to_doy(m, d): return date(2023, m, d).timetuple().tm_yday
def csmooth(a, half=7):
    n=len(a); out=np.empty(n)
    for i in range(n): out[i]=np.nanmean([a[(i+k)%n] for k in range(-half,half+1)])
    return out

def load(name):
    df = pd.read_csv(SRC / f"kma_allyears_{name}.csv")
    df["date"] = pd.to_datetime(df["date"])
    df["year"] = df["date"].dt.year
    return df

def climatology(df, col, fill0):
    d = df[(df["year"]>=PAST[0])]  # placeholder; filtered by caller
    s = pd.to_numeric(df[col], errors="coerce")
    if fill0: s = s.fillna(0.0)
    g = pd.DataFrame({"m":df["date"].dt.month,"dd":df["date"].dt.day,"v":s})
    g = g[~((g["m"]==2)&(g["dd"]==29))]
    md = g.groupby(["m","dd"])["v"].mean()
    arr = np.full(365, np.nan)
    for (m,dd),v in md.items(): arr[md_to_doy(m,dd)-1]=v
    arr = pd.Series(arr).interpolate(limit_direction="both").to_numpy()
    return csmooth(arr,7)

def annual_series(df, col, agg):
    s = pd.to_numeric(df[col], errors="coerce")
    if agg=="sum": s=s.fillna(0.0)
    tmp = pd.DataFrame({"year":df["year"],"v":s})
    out={}
    for y,grp in tmp.groupby("year"):
        if len(grp) < 350: continue           # 불완전 연도 제외(2026 등)
        out[int(y)] = (grp["v"].sum() if agg=="sum" else grp["v"].mean())
    return out


def main():
    cities={}; year_lo, year_hi = 1969, 2025
    for name,(lat,lon,typ) in STATIONS.items():
        if not (SRC / f"kma_allyears_{name}.csv").exists():
            print(f"  (건너뜀: {name} 아직 미수집)"); continue
        df = load(name)
        e={"lat":lat,"lon":lon,"type":typ}
        # 일평년곡선(과거/현재)
        for mk,col,lab,unit,nd,f0 in METRICS:
            e[mk]={}
            for pk,(y0,y1) in (("past",PAST),("present",PRESENT)):
                sub=df[(df["year"]>=y0)&(df["year"]<=y1)]
                e[mk][pk]=[round(float(x),nd if nd else 1) for x in climatology(sub,col,f0)]
        # timeline 연별
        tl={"years":[]}
        series={mk:annual_series(df,col,"sum" if mk=="precip" else "mean") for mk,col,_,_,_,_ in [(m[0],m[1],0,0,0,0) for m in METRICS]}
        yrs=sorted(set(range(year_lo,year_hi+1)) & set().union(*[set(series[mk]) for mk in series]))
        tl["years"]=yrs
        for mk,col,lab,unit,nd,f0 in METRICS:
            tl[mk]=[ (round(series[mk][y],1) if y in series[mk] else None) for y in yrs ]
        e["timeline"]=tl
        cities[name]=e
        print(f"  {name}({typ}): timeline {yrs[0]}~{yrs[-1]} ({len(yrs)}년), 기온 {tl['temp'][0]}→{tl['temp'][-1]}℃")

    # nationwide 연별 평균(16지점)
    allyears=sorted(set().union(*[set(cities[n]['timeline']['years']) for n in cities]))
    nat={"years":allyears}
    for mk,*_ in METRICS:
        vals=[]
        for y in allyears:
            xs=[]
            for n in cities:
                tl=cities[n]['timeline']
                if y in tl['years']:
                    v=tl[mk][tl['years'].index(y)]
                    if v is not None: xs.append(v)
            vals.append(round(sum(xs)/len(xs),2) if xs else None)
        nat[mk]=vals

    terms=[{"name":n,"hanja":h,"date":f"{m}/{d}","doy":md_to_doy(m,d),"meaning":mean,
            "season":s,"hanja_gloss":hg,"desc":ds} for (n,h,m,d,mean,s,hg,ds) in TERMS]

    data={"meta":{"title":"24절기: 조상의 약속 vs 실제 기후","source":"기상청 ASOS 16지점 일자료(1969~2026)"},
          "periods":{"past":"1969–1973","present":"2022–2026"},
          "metrics":[{"key":k,"label":l,"unit":u,"promise":(k=="temp")} for (k,_,l,u,_,_) in METRICS],
          "cities":cities,"nationwide":nat,"terms":terms}
    OUT_JSON.parent.mkdir(parents=True,exist_ok=True)
    json.dump(data,open(OUT_JSON,"w",encoding="utf-8"),ensure_ascii=False,separators=(",",":"))
    with open(OUT_JS,"w",encoding="utf-8") as f:
        f.write("window.SOLAR_DATA = "); json.dump(data,f,ensure_ascii=False,separators=(",",":")); f.write(";\n")
    print(f"\n  ✓ {OUT_JSON.name} ({OUT_JSON.stat().st_size//1024} KB), nationwide {nat['years'][0]}~{nat['years'][-1]}")


if __name__ == "__main__":
    main()
