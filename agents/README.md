# 자율 조직 — 설치·인수 안내

이 디렉터리가 **동네 커피 노트를 사람 없이 운영하는 조직**이다. 러너 39개(.sh), 에이전트 헌법 27개(.md), launchd 템플릿 24개(`launchd/*.tmpl`).

> 🔴 **2026-10-18까지 이 디렉터리 전체가 git에 없었다**(`.gitignore`의 `/agents/`).
> 저장소를 넘겨도 조직이 없었고, 이 맥북이 고장나면 사라졌다. 그래서 추적으로 전환했다.
> 원래 제외 사유는 "배포 안 함"이었는데, Vercel은 `web/`만 빌드하므로 추적해도 배포물은 변하지 않는다.

## 무엇을 먼저 읽나

| 파일 | 내용 |
|---|---|
| `ORG-CHARTER.md` | 조직도·본부별 책임·보고 라인 |
| `PRINCIPLES.md` | 의사결정 원칙과 권한(DoA: L0~L3). **코드로 강제되는 부분은 `web/lib/jobContract.ts`** |
| `SCHEDULE.md` | 잡별 실행 시각·최근 가동 실측. 사이클마다 갱신된다 |
| `CEO-ORDERS.md` · `WORK-ORDER.md` | CEO 지시·작업 지시 누적 |
| `*-agent.md` | 각 에이전트의 헌법(프롬프트). `_run.sh`가 `--append-system-prompt-file`로 붙인다 |

## 새 머신에 세우는 순서

```bash
# 1) DB 스키마 (구조만 — 데이터는 재수집 대상이다)
psql "$DATABASE_URL" -f web/db/schema.sql

# 2) 환경변수 — 필요한 키 목록
cp web/.env.example web/.env.local && $EDITOR web/.env.local

# 3) 검증 — 여기서 통과해야 조직을 켤 자격이 있다
cd web && npm ci && npm run preflight     # 컬럼·인덱스 + 해자 테스트 46건 + sql 952개 스키마 검사

# 4) 조직 등록 (macOS)
./agents/launchd/install.sh --dry-run     # 무엇을 켤지 먼저 본다
./agents/launchd/install.sh               # 등록
node web/scripts/watchdog-launchd.mjs     # 등재 확인
```

**설치기는 `web/lib/jobTeams.ts`의 `RETIRED_JOBS`를 읽어 의도적 보류 잡을 건너뛴다.** 목록을 설치기에 따로 적지 않는다 — 두 곳이 갈라지면 안 켜야 할 잡이 켜진다.

## 인수자가 알아야 하는 제약

1. **macOS 전용(launchd).** 리눅스로 옮기려면 같은 스케줄로 cron/systemd timer를 만들면 된다 — 스케줄은 각 `launchd/*.tmpl`의 `StartCalendarInterval`에 그대로 적혀 있다.
2. **LLM 에이전트는 `claude -p`(구독)로 돈다.** 양수인은 자기 콘솔 키(`ANTHROPIC_API_KEY`)로 바꾸면 된다 — **양도 불가가 아니라 운영비가 생긴다.**
   ⚠️ 구독 토큰을 서버·백엔드에서 쓰면 ToS 위반이다(`CLAUDE.md` 불변규칙 1). 로컬 `claude -p`만 허용.
3. **러너가 절대경로를 쓴다**(`/Users/<사용자>/coffee-platform`). 새 머신에서는 그 경로를 맞추거나 러너의 경로를 바꿔야 한다.
4. **알림은 macOS `osascript`**를 쓴다(3곳). 다른 OS에서는 Slack·메일로 바꿔야 한다.
5. **산출물(`agent-reports/`)은 추적하지 않는다** — 매 사이클 갱신돼 git 충돌을 만든다.

## 조직이 멈췄는지 확인하는 법

```bash
node web/scripts/watchdog-launchd.mjs          # launchd 등재 + 당일 실행량 붕괴 감시
cd web && node --import tsx scripts/morning-sweep-report.mjs   # 아침 종합(잡 가동·정합성·유입)
```

🔴 **2026-10-04~15에 조직이 하루 1건으로 떨어졌는데 12일간 경보가 0건이었다** — 비용 비상으로 크론을 전부 닫을 때 감시자도 같이 닫혔기 때문이다. 재발 방지로 `cron-selfaudit`을 관문 밖(`web/proxy.ts`의 `CRON_ALWAYS`)으로 빼고, plist 파일을 진실원본으로 보는 등재 워치독을 만들었다. **감시자는 감시 대상과 같은 스위치에 두지 않는다.**
