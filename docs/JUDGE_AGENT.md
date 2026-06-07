# Sonnet 리뷰 판정 에이전트 (Claude Max 구독, 로컬 배치)

> "경계 리뷰"(카페명은 불명확하나 후기 맥락이 뚜렷한 글)를 **Claude Sonnet이 내용·맥락을 읽어**
> 진짜 양질 후기인지 판정 → 양질만 공개. **Max 구독으로 실행**(추가 API 비용 0).
> 웹앱(Vercel)은 LLM 호출 없이 결과만 서빙. 품질은 Sonnet급(최상).

## 구조
```
[사장님 맥]  scripts/judge-batch.mjs  ──(Agent SDK + Max 구독)──▶  Claude Sonnet 판정
     │  GET /api/judge-candidates  (경계 리뷰 있는 카페 + 스니펫, LLM 없음)
     └▶ POST /api/judge-apply      (양질 key 적용 → 재합성·공개)  ──▶  공유 DB
```
- 서버는 규칙으로 경계 리뷰만 추려 내려주고, **판정은 사장님 머신의 Sonnet**이 한다(구독으로 정당).
- `llm_judged_at`로 진행을 추적 — 매일 돌면 새/갱신된 카페부터 순회 판정.

## 최초 셋업 (한 번)
```bash
cd ~/coffee-platform/web

# 1) Agent SDK 설치
npm i @anthropic-ai/claude-agent-sdk

# 2) Max 구독 토큰 발급 (1년 유효)
claude setup-token            # 출력된 토큰 복사

# 3) 비밀 env 작성
cp scripts/.judge.env.example scripts/.judge.env
#   scripts/.judge.env 열어서 채우기:
#     CLAUDE_CODE_OAUTH_TOKEN="발급토큰"
#     ADMIN_PASSWORD="관리자 비밀번호"
#     (APP_URL은 기본값 프로덕션이면 그대로)
```
> ⚠️ `ANTHROPIC_API_KEY`가 설정돼 있으면 구독 대신 그 키로 가버립니다. 래퍼(run-judge.sh)가
> 실행 시 `unset` 하지만, 수동 실행 시엔 직접 `unset ANTHROPIC_API_KEY` 후 돌리세요.

## 수동 실행 (테스트)
```bash
source scripts/.judge.env && unset ANTHROPIC_API_KEY
node scripts/judge-batch.mjs
```

## 매일 자동 실행 (launchd, 컴퓨터 켜져 있을 때)
```bash
# 1) plist의 run-judge.sh 절대경로가 맞는지 확인(필요시 수정)
# 2) 설치
cp scripts/com.coffee.judge.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.coffee.judge.plist
# 매일 04:00 자동 실행. 로그: /tmp/coffee-judge.log

# 즉시 한 번 돌려보기:  launchctl start com.coffee.judge
# 해제:  launchctl unload ~/Library/LaunchAgents/com.coffee.judge.plist
```
> 노트북이 잠자기면 그 시간 실행은 건너뛰고 다음 깨어났을 때 launchd가 보충 실행합니다.

## 동작·비용
- 1회 실행 상한 `JUDGE_MAX`(기본 400곳). 모델 `claude-sonnet-4-5`(env로 변경 가능).
- Max 월 크레딧(5x=$100 / 20x=$200) 내에서 차감. 판정은 짧은 프롬프트라 가벼움.
- 실패/토큰만료 시 그 회차만 멈추고, 서버 데이터는 규칙 결과로 안전 유지(무회귀).
- `raw_reviews` 캐시가 채워진 카페만 후보 — 재합성(cron-resynth/cron-grow)이 돌며 점차 늘어남.
