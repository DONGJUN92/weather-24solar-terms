# API 키 발급 가이드 (KMA · Copernicus · NASA)

무인증(키 불필요) 소스 — Our World in Data, NOAA, Open-Meteo(ERA5), ECMWF Open Data — 는
키 없이 바로 수집됩니다. 아래 3곳만 **무료 개인 키**가 필요합니다.

> Windows에서 `.netrc`, `.cdsapirc` 처럼 점(.)으로 시작하는 파일을 만들 때는
> 메모장 대신 다음처럼 만드세요(확장자 없이):
> ```powershell
> notepad $HOME\.cdsapirc      # 저장 시 "파일 형식: 모든 파일", 이름 끝에 . 안 붙도록
> ```
> 또는 본 폴더에서: `python -c "from pathlib import Path; print(Path.home())"` 로 홈 경로 확인.

---

## 1. 기상청 ASOS 일자료  ★본 대회 핵심★

기상청 데이터는 두 포털 중 한 곳에서 키를 받으면 됩니다. **둘 다 무료.**

### (A) 권장 — 공공데이터포털(data.go.kr) · `serviceKey`  → `--source datago`
프로그래밍 접근이 가장 안정적(JSON, 필드명 명확).

1. https://www.data.go.kr 회원가입 / 로그인
2. 검색창에 **"기상청 지상(종관, ASOS) 일자료"** 입력 →
   **`기상청_지상(종관, ASOS) 일자료 조회서비스`** 선택
3. **[활용신청]** 클릭 → 활용목적 입력 → 신청 (일반 인증키는 **자동승인**, 보통 즉시~1시간)
4. **마이페이지 → 오픈API → 인증키 발급현황**에서
   **일반 인증키(Decoding)** 값을 복사
   - ⚠️ **반드시 `Decoding` 키**를 사용하세요. `Encoding` 키를 쓰면 파이썬 `requests`가
     한 번 더 인코딩해 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(401)가 납니다.
5. 환경변수 설정 후 실행:
   ```powershell
   $env:KMA_SERVICE_KEY = "여기에_Decoding_키"
   python collect_kma_openapi.py --years 5 --source datago
   ```

### (B) 대안 — 기상청 API허브(apihub.kma.go.kr) · `authKey`  → `--source apihub`
기상자료개방포털(data.kma.go.kr)의 OpenAPI가 이 허브로 통합되었습니다.

1. https://apihub.kma.go.kr 회원가입 / 로그인 (기상청 통합계정)
2. **마이페이지 → 인증키 관리**에서 `authKey` 발급(즉시)
3. 실행:
   ```powershell
   $env:KMA_AUTH_KEY = "여기에_authKey"
   python collect_kma_openapi.py --years 5 --source apihub
   ```

> data.kma.go.kr(기상자료개방포털) 자체에 회원가입하면 웹에서 직접 다운로드도 가능하며,
> 프로그래밍 수집은 위 (A)/(B) 경로를 사용합니다. 본 대회 사전교육(7/22)에서 기상청 API 활용을 안내합니다.

---

## 2. Copernicus Climate Data Store (ERA5)  · `~/.cdsapirc`

> 키가 번거로우면 **`collect_openmeteo_era5.py`** 가 동일한 ERA5 데이터를 **무인증**으로
> 이미 받아 줍니다(검증 완료). CDS 공식 경로가 필요할 때만 아래를 진행하세요.

1. https://cds.climate.copernicus.eu 회원가입 / 로그인 (ECMWF 계정)
2. 우상단 프로필 → **"Your profile"** 페이지에서 **Personal Access Token** 복사
3. 받을 데이터셋 페이지(예: *ERA5 monthly averaged data on single levels*) 하단의
   **"Terms of use" → Accept** (데이터셋별 라이선스 동의 필수, 안 하면 403)
4. 홈 디렉터리에 **`.cdsapirc`** 파일 생성(신버전 형식):
   ```
   url: https://cds.climate.copernicus.eu/api
   key: <PERSONAL-ACCESS-TOKEN>
   ```
   - ⚠️ 2024 신 인프라부터 `url`은 `.../api`, `key`는 **토큰 한 줄**입니다.
     (구버전 `key: UID:APIKEY` 형식 아님)
5. 의존성 설치 후 실행:
   ```powershell
   pip install cdsapi xarray netcdf4
   python collect_copernicus_cds.py --years 5
   ```

---

## 3. NASA Earthdata (GPM IMERG)  · `~/.netrc` 또는 토큰

1. https://urs.earthdata.nasa.gov 회원가입 / 로그인
2. 로그인 → **Applications → Authorized Apps** 에서
   **"NASA GESDISC DATA ARCHIVE"** 승인(Approve) — 필수(안 하면 401)
3. 인증 방법(둘 중 하나):
   - **(a) `.netrc`** — 홈에 `.netrc` 파일 생성:
     ```
     machine urs.earthdata.nasa.gov login <아이디> password <비밀번호>
     ```
   - **(b) 토큰** — 프로필 → **Generate Token** → 환경변수:
     ```powershell
     $env:EARTHDATA_TOKEN = "발급된_토큰"
     ```
4. 의존성 설치 후 실행:
   ```powershell
   pip install earthaccess xarray netcdf4 h5netcdf
   python collect_nasa_gpm.py --years 5
   ```
   `earthaccess.login()` 이 `.netrc`/토큰을 자동 인식합니다.

---

## 키 없이 먼저 점검하기 (시뮬레이션)
모든 키 필요 수집기는 키 없이 코드 정상동작을 검증할 수 있습니다:
```powershell
python collect_kma_openapi.py --simulate
python collect_copernicus_cds.py --simulate
python collect_nasa_gpm.py --simulate
```
