# 기상·기후 AI 해커톤 2026 — 데이터 작업 폴더

대회([weatherhackathon.kr](https://weatherhackathon.kr/))의 **"브라우저에서 실데이터를 직접 조작하며 학습"**
하는 인터랙티브 교육 도구 개발을 위한 데이터 수집·가공 결과물입니다.

## 폴더 구조
```
.
├─ 기상기후_AI_해커톤_2026_정보.md   ← 대회 공식 정보 추출본(목적·예시·일정·심사기준)
├─ data_collectors/                  ← 8개 소스 수집 코드 + 원시 데이터(output/)
│   ├─ README.md / API_KEY_발급_가이드.md
│   └─ collect_*.py  (KMA·CDS·NASA·OWID·NOAA·Open-Meteo·ECMWF·IBTrACS)
├─ processing/                       ← 가공 파이프라인
│   ├─ build_web_data.py             (원시 CSV → 웹용 JSON)
│   └─ verify_web_data.py            (물리 타당성 9종 검증)
└─ web_data/                         ← ★결과물에 바로 쓰는 가공 데이터(JSON)
    ├─ DATA_GUIDE.md                 (예시6종↔데이터 매핑·사용법)
    └─ *.json  (월평년값·연추세·일자료·기후변화·태풍·범위·극값)
```

## 한눈에 보기
- **원시 수집**: 8개 소스 · 34개 CSV · ~22MB (기상청 8지점 일자료, ERA5, NASA 위성강수, 태풍 120개, CO2, 해외기후 등) — 모두 최근 5개년, 내부결측 0
- **가공 산출**: `web_data/` 16개 JSON · ~0.9MB — 백엔드 없이 슬라이더·지도·차트에 즉시 바인딩
- **검증**: 수집기 시뮬레이션 + 가공물 물리 타당성 9종 통과

## 빠른 시작
```powershell
# 1) (원시 재수집이 필요할 때) — 무인증 소스
cd data_collectors && python run_all.py --keyless
# 2) 가공 JSON 생성 + 검증
cd ../processing && python build_web_data.py && python verify_web_data.py
# 3) 결과물 웹앱에서 web_data/*.json 을 fetch 하여 사용 (DATA_GUIDE.md 참고)
```

자세한 데이터 사용법 → [web_data/DATA_GUIDE.md](web_data/DATA_GUIDE.md)
키 발급 → [data_collectors/API_KEY_발급_가이드.md](data_collectors/API_KEY_발급_가이드.md)
