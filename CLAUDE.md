# CLAUDE.md — Coffee Platform

> 이 파일은 이 프로젝트의 **단일 사실 출처(single source of truth)**다.
> 코드·숫자·데이터 소스에 대해 추측하지 말고 항상 이 문서를 먼저 따른다.
> 여기 없는 사실이 필요하면 "확인 필요"로 표시하고 임의로 채우지 않는다.

---

## 0. 이 프로젝트가 무엇인가

데이터 기반 커피 플랫폼. 하나의 데이터 엔진을 두 제품이 공유한다.

- **B2C — 취향 추천 공간**: 사용자의 취향(6축)을 입력받아 원두를 큐레이션·추천. 재고 0으로 시작(직접 제조·판매 아님). 원두 사입/수입은 나중에 켜는 옵션.
- **B2B — 생두 원가 인텔리전스(SaaS)**: 로스터리/카페 대상. ICE Coffee C 선물 + 환율 + 산지 differential로 생두 도착원가를 재현 가능하게 계산. 포지셔닝은 "헤지"가 아니라 **원가 가시화 · 구매 타이밍 · 가격 협상 근거**.

신뢰 원칙: **모든 숫자에는 출처 · 기준일 · 계산식을 함께 노출한다.**

---

## 1. 다른 프로젝트와의 분리 (충돌 방지)

- 이 프로젝트는 주식 에이전트와 **별개의 git 저장소 · 별개의 가상환경**을 쓴다.
- Python 가상환경은 이 프로젝트 폴더 안 `.venv`만 사용한다. 전역 설치 금지.
- 환경변수(API 키)는 이 프로젝트의 `.env`에만 둔다. 절대 커밋하지 않는다.
- 웹 개발 서버 포트: 주식 에이전트가 3000을 쓰면 충돌하니, 커피 웹은 **3100** 사용 (`next dev -p 3100`).

---

## 2. 폴더 구조

```
coffee-platform/
├─ CLAUDE.md              # 이 파일
├─ .env                   # API 키 (커밋 금지)
├─ .env.example           # 키 이름만 기록 (커밋함)
├─ .gitignore
├─ data-engine/           # Python: 수집·정규화·전처리
│  ├─ .venv/              # 가상환경 (커밋 금지)
│  ├─ collectors/         # fx_collector.py, coffee_c_collector.py
│  ├─ processing/         # normalizer.py, bean_ingest.py
│  ├─ models/             # cost_model.py (도착원가 계산)
│  ├─ data/
│  │  ├─ raw/             # 원본 응답 보존 (감사용)
│  │  └─ clean/           # 정제본
│  └─ requirements.txt
├─ web/                   # Next.js (App Router, TS, Tailwind)
│  ├─ src/app/taste/      # B2C 추천 페이지
│  ├─ src/app/cost/       # B2B 원가 대시보드
│  └─ src/app/api/        # 서빙 API
└─ docs/                  # 설계 메모
```

---

## 3. 검증된 데이터 소스 (2026-06 기준, 임의 변경 금지)

### 3-1. 환율 (USD → KRW)
- **1차: 한국은행 ECOS Open API** (`https://ecos.bok.or.kr/api/`). 공식·무료. 인증키 필요. "한국은행 기준"이라는 신뢰가 B2B 영업에 중요.
- **폴백: 한국수출입은행 환율 API**. ⚠️ 2025-06-25부터 도메인이 `www.koreaexim.go.kr` → **`oapi.koreaexim.go.kr`** 로 변경됨. 옛 예제 URL 그대로 쓰지 말 것. 데이터 타입 `AP01`.
- **글로벌 폴백: ExchangeRate-API / Open Exchange Rates**. 무료는 USD 기준만 제공 → USD 경유로 KRW 계산하면 됨.

### 3-2. 생두 벤치마크 가격 (ICE Coffee C)
- Coffee C = **세계 아라비카 기준가**. ICE Futures U.S. 거래.
- 단위: **USD/lb (파운드당 달러)**. 계약 크기 37,500 lb.
- 물리적 인도 계약이며 **산지별 프리미엄/디스카운트(differential)** 가 명시됨 → 아래 origin_diff에 반영.
- MVP: 일 단위 종가로 충분(실시간 틱 불필요). 무료/조회 소스로 시작하되 출처·기준시각 화면 노출. 상용화 시 Databento 등 유료 ICE 피드 검토.

### 3-3. 산지 differential (ICE 공시 기준, 단위: point)
- **par(기준 0)**: Mexico, El Salvador, Nicaragua, Papua New Guinea, Panama, Tanzania, Uganda, Honduras, Peru
- **+1000 프리미엄**: Colombia, Costa Rica, Kenya
- **+500 프리미엄**: Guatemala
- **−100 디스카운트**: Burundi, Rwanda, Venezuela, India
- **−400 디스카운트**: Dominican Republic, Ecuador
- ※ 100 point = 1 cent/lb. 위 수치는 ICE 계약 명세 기준이며 실제 시장 differential과 다를 수 있으므로 "추정"으로 표기.

### 3-4. 관능/추천 데이터 (CQI)
- **CQI(Coffee Quality Institute) 큐핑 데이터베이스**. 아라비카 ~1312종 + 로부스타 28종. 변수: Aroma, Flavor, Aftertaste, Acidity, Body, Balance, Uniformity, Clean Cup, Sweetness, 가공방식, 산지, 고도, 품종.
- 공개 출처: GitHub `jldbc/coffee-quality-database`, Kaggle CQI 2023-05 스크랩본.
- ⚠️ **편향 주의**: 대부분 스페셜티 등급(80점+). 절대 품질 비교용 아님. **"산지·가공·품종 → 관능 프로파일" 매핑 규칙의 근거**로만 사용.

### 3-5. 표준 어휘
- **SCA Coffee Taster's Flavor Wheel** (World Coffee Research Sensory Lexicon 기반). 향미 대분류: 과일/꽃/견과/초콜릿/향신료 등. 추천 "왜" 설명은 반드시 이 표준어 사용.

---

## 4. 핵심 계산식 (B2B 도착원가)

```
생두 추정원가(원/kg) =
  ( (CoffeeC_USD_per_lb ± origin_diff_cent/100) × 2.2046  ← lb→kg
    × USDKRW )
  + CIF가산(운임·보험)
  + 관세·부가세
  + 통관·국내물류
  + 수입사마진(추정 레인지)

로스팅 후 원가(원/kg) = 생두원가 ÷ (1 − 로스팅수율손실률)   # 통상 0.15~0.20
```
- 각 가정값(CIF, 관세율, 마진, 손실률)은 상수로 분리하고 화면에 출처/가정 명시.
- 2.2046 = 1 kg의 파운드 환산값.

---

## 5. 취향 6축 모델 (B2C)

```
산미 acidity   ← CQI Acidity, min-max 정규화 [0,1]
바디 body      ← CQI Body, 정규화
단맛 sweetness ← CQI Sweetness, 정규화
로스팅 roast   ← 산지/가공 관례 + 로스팅 단계 매핑
향 flavor_tags ← Flavor Wheel 대분류 멀티핫
가공 process   ← washed/natural/honey 원핫
```
추천: 사용자 6축 벡터 ↔ 원두 6축 벡터 거리(코사인/유클리드) → 가까운 순 + 표준어 설명.

전처리 필수 처리:
- 고도 단위(ft/m) 혼재 → 통일·이상치 클리핑
- 산지/품종 철자 불일치 → 매핑 테이블 표준화
- 결측(variety/process) → 산지 최빈값 보간 또는 "정보없음" 분리
- 점수 편향 → 절대점수 대신 분포 내 상대 위치로 변환

---

## 6. 모듈(에이전트) 책임

| 모듈 | 트리거 | 책임 |
|---|---|---|
| fx_collector | 매일(cron) | ECOS 환율 수집·적재 (폴백 수출입은행) |
| coffee_c_collector | 영업일 종가 후 | Coffee C 일종가 수집·적재 |
| normalizer | 수집 직후 | 단위·통화·영업일 보정, 이상치 플래깅, raw→clean |
| bean_ingest | 1회 배치 | CQI 적재 + 6축 전처리 → bean catalog |
| cost-api | 요청 시 | 저장값 → §4 모델로 산지별 원가 반환 |
| recommend-api | 요청 시 | 사용자 6축 → 매칭·정렬·설명 |
| explain-agent | 선택(LLM) | 시세/추천을 자연어로 설명 |

---

## 7. 안티-환각 / 충돌 방지 규칙 (반드시 준수)

1. **숫자를 지어내지 않는다.** 가격·환율·점수는 전부 DB의 수집·계산값에서만 나온다.
2. **LLM은 설명만, 계산은 금지.** explain-agent는 DB값을 인용해 말로 풀 뿐, 가격/점수를 생성하지 않는다.
3. **raw 보존.** 모든 외부 응답 원본을 `data/raw/`에 저장한 뒤 정제한다(감사·재현용).
4. **출처·기준일 동반.** 화면·API 응답에 source와 as-of date를 함께 담는다.
5. **멱등 수집.** 같은 날짜 중복 적재 금지. 실패 시 재시도 + 로그.
6. **시크릿 금지.** API 키는 `.env`에만. 코드·커밋·로그에 노출 금지.
7. **데이터 소스 변경 시 이 문서 먼저 갱신** 후 코드 수정.

---

## 8. 현재 상태 / 다음 할 일

- [ ] 저장소·구조·CLAUDE.md 세팅
- [ ] (1순위) fx_collector(ECOS) — 환율 수집·적재
- [ ] (1순위) coffee_c_collector + origin_diff 테이블
- [ ] cost_model.py — §4 도착원가 함수
- [ ] (2순위) bean_ingest(CQI) + 6축 전처리
- [ ] recommend-api
- [ ] web: cost 페이지 / taste 페이지
- [ ] Vercel 배포 + cron

> 진행하며 이 체크리스트와 §3 데이터 소스를 최신으로 유지할 것.
