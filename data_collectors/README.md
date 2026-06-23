# 데이터 수집기 — 기상·기후 AI 해커톤 참고사이트

`weatherhackathon.kr` 의 **"아이디어를 참고할 사이트들"(참고 웹사이트 22개)** 중
**실데이터를 받을 수 있는 소스**에 대해 최근 3~5개년 데이터를 수집하는 코드 모음입니다.
모든 수집기는 **시뮬레이션(`--simulate`)으로 코드 정상동작을 검증**한 뒤 실수집합니다.

---

## 1. 22개 참고사이트 분류 (데이터 vs UX·교육)

| 데이터 수집 가능(코드 작성) | 성격 |
|---|---|
| ② 기상자료개방포털 오픈API(data.kma.go.kr) | ASOS 일자료 — **키 필요** |
| ⑨ NOAA Climate.gov(→ NCEI/GML) | CO2·GSOD 일자료 — 무인증 |
| ⑮ Our World in Data | CO2·기온·해수면 — 무인증 |
| ⑱⑲ Copernicus CDS(ERA5) | 재분석 — **키 필요** (무인증 대체: Open-Meteo) |
| ⑯⑰ ECMWF | 오픈예보 무인증 / 과거=ERA5 |
| ⑫ NASA GPM(IMERG) | 위성강수 — **키 필요(Earthdata)** |

| 데이터 API 없음 → .md 메타정보로만 정리 (시각화·교육용) |
|---|
| ① 날씨누리, ③ 분석일기도(이미지), ④ earth.nullschool, ⑤ Windy, ⑥ Ventusky, ⑦ NWS Radar, ⑧ MetEd/COMET, ⑩ NWS Learning, ⑪ NASA Climate Interactives, ⑬ En-ROADS, ⑭ PhET, ⑳ Copernicus Atlas, ㉑ Met Office Learn, ㉒ Met Office for Schools |

> ①③(기상청 날씨누리/분석일기도)의 **수치 관측데이터**는 ②(기상자료개방포털 API)로 동일하게 수집됩니다.

---

## 2. 수집기 7종

| 스크립트 | 소스 | 키 | 수집 내용 | 상태 |
|---|---|---|---|---|
| `collect_owid_climate.py` | Our World in Data | 불필요 | 국가별 CO2, 기온이상치, 해수면온도, 해수면상승 | ✅ 실수집 완료 |
| `collect_noaa.py` | NOAA GML/NCEI | 불필요 | 마우나로아 월별 CO2 + 한국 5개 관측소 GSOD 일자료 | ✅ 실수집 완료 |
| `collect_openmeteo_era5.py` | Open-Meteo(ERA5) | 불필요 | 한국 7개 도시 일별 기온/강수/바람/일사 (ERA5 재분석) | ✅ 실수집 완료 |
| `collect_ecmwf_opendata.py` | ECMWF Open Data | 불필요 | 최신 IFS 오픈예보(2t/tp) GRIB | ✅ 실수집 완료 |
| `collect_kma_openapi.py` | 기상청 ASOS 일자료 | 키 사용 | 한국 8개 지점 일자료 2022~2026 | ✅ **실수집 완료** (8지점·각 1,632일·내부결측 0) |
| `collect_nasa_gpm.py` | NASA GPM IMERG | 키 사용 | 한반도 월별 위성강수 | ✅ **실수집 완료** (2022~2025·45개월·내부결측 0) |
| `collect_copernicus_cds.py` | Copernicus CDS | 키 사용 | ERA5 월평균(한반도) t2m·강수 | ✅ **실수집 완료** (2022~2026·53개월·내부결측 0) |

키 발급 → **[API_KEY_발급_가이드.md](API_KEY_발급_가이드.md)**

---

## 3. 빠른 시작

```powershell
pip install -r requirements.txt

# (1) 7개 수집기 전체 코드 검증 — 키 불필요, 네트워크 최소
python run_all.py --simulate

# (2) 무인증 소스 실제 수집 (OWID/NOAA/Open-Meteo/ECMWF)
python run_all.py --keyless

# (3) 수집 결과 요약표 생성
python run_all.py --manifest

# 개별 실행 예
python collect_owid_climate.py --years 5
python collect_noaa.py --years 5 --stations Seoul Busan
python collect_openmeteo_era5.py --years 5

# 키 필요 소스 (키 세팅 후)
$env:KMA_SERVICE_KEY="..."; python collect_kma_openapi.py --years 5 --source datago
```

공통 옵션: `--years N`(기본 5), `--simulate`(코드만 검증).

---

## 4. 수집 결과 (실데이터, `output/`)

- **32개 CSV · 약 98,000행 · 21MB** + ECMWF GRIB 1개
- 대표 산출물
  - `kma_asos_daily_<지점>_2022_2026.csv` (기상청 8개 지점 일자료, 각 1,632일, **내부결측 0**) ★대회 핵심
  - `cds_era5_korea_monthly_2022_2026.csv` (Copernicus ERA5 한반도 월평균 기온·강수 53개월, **내부결측 0**)
  - `nasa_gpm_imerg_korea_monthly_2022_2026.csv` (위성강수 45개월, **내부결측 0**)
  - `owid_co2_by_country_FULL.csv` (50,411행, 1750~2024 전세계 CO2)
  - `noaa_gsod_<도시>_2021_2026.csv` (서울/부산/인천/대구/제주 일자료, 내부결측 0.7%)
  - `openmeteo_era5_ALLCITIES_2022_2026.csv` (7개 도시 11,396행, **내부결측 0**, =Copernicus ERA5)
  - `noaa_gml_co2_monthly_FULL.csv` (1958~ 마우나로아 월별 CO2)
- `output/_simulated/` : 시뮬레이션 산출물(합성데이터)
- `output/MANIFEST.csv` : 전체 파일 목록·행수

---

## 5. "빠짐 없이" 검증 방식

`common.py` 의 검증기가 **실제 커버 구간 내부의 결측(internal_missing)** 을 핵심 지표로 계산합니다.
- 데이터 제공기관의 최신자료 지연(`trailing_lag`)·시작 지연(`leading_lag`)은 **분리 보고** →
  "아직 발행 안 된 최신월"을 결측으로 오판하지 않음.
- 일/월 단위 모두 누락 날짜를 샘플로 출력(`missing_sample`).
- 각 `--simulate` 는 **고의로 1일을 누락시켜** 결측 탐지가 작동함을 assert로 증명합니다.

---

## 6. 폴더 구조
```
data_collectors/
├─ common.py                  # 공통: HTTP세션·검증·저장·UTF-8
├─ collect_owid_climate.py    # ✅ 무인증 실수집
├─ collect_noaa.py            # ✅ 무인증 실수집
├─ collect_openmeteo_era5.py  # ✅ 무인증 실수집(ERA5)
├─ collect_ecmwf_opendata.py  # ✅ 무인증 실수집(예보)
├─ collect_kma_openapi.py     # 🔑 키 필요 + 시뮬검증
├─ collect_copernicus_cds.py  # 🔑 키 필요 + 시뮬검증
├─ collect_nasa_gpm.py        # 🔑 키 필요 + 시뮬검증
├─ run_all.py                 # 오케스트레이터(--simulate/--keyless/--manifest)
├─ requirements.txt
├─ API_KEY_발급_가이드.md
└─ output/                    # 수집 CSV + _simulated/
```
