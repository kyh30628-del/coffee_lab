// 🗜️ 공용 관제 다이제스트 — 결정론·토큰0. 모든 에이전트가 '관제 먼저'로 제각각 20~30번 DB 조회하던 걸
//   1회 미리 계산해 agent-reports/DIGEST.md 한 장으로. 에이전트는 이걸 한 번 Read → 턴·캐시재독 급감(품질 무영향, 데이터 동일).
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { BOT_ANON_IDS_SQL } from "../lib/behaviorBot.ts"; // 트래픽/유입 단일출처(#503 후속, CEO "모든 기준을 그걸로") — 모든 러너가 --import tsx로 실행돼 .ts import 안전
const AR = "/Users/wangwida/coffee-platform/agent-reports";
const env = readFileSync("/Users/wangwida/coffee-platform/web/.env.local", "utf8");
const url = env.match(/DATABASE_URL="?([^"\n]+)/)[1].trim();
const sql = neon(url);
const one = async (q) => Number((await q)[0].c);
const today = new Date().toISOString().slice(0, 10);

(async () => {
  const L = [];
  L.push(`# 🗜️ 관제 다이제스트 (결정론 사전계산 · 에이전트 공용)`);
  L.push(`> 생성 ${new Date().toISOString()} · **이 파일을 먼저 읽어라. 관제·수치·백로그가 다 있다. DB 재쿼리는 여기 없는 것만 묶어서 최소 턴으로.**\n`);

  // 0.5) 🚦 사람 대기(인간 게이트 SLA) — 하네스 L6(2026-08-08).
  //    CEO가 눌러야 진행되는 일이 **조용히 갇히는 것**을 막는다. 2026-08-08 배포대기 4건이 27h 정체했는데
  //    원인은 "경고는 접힌 화면·버튼은 펼친 화면"이었다. 큐를 진실의 원천으로 삼아 여기 **최상단**에 띄운다.
  //    🔴 자동승인 절대 없음 — 표시만 한다(L3는 CEO 전용).
  try {
    const gates = await sql`
      SELECT id, LEFT(title,70) title, status, action_params->>'dev_status' ds,
             ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(decided_at, created_at)))/3600) h
      FROM decisions
      WHERE (status='pending' AND COALESCE(tier,'L3')='L3')
         OR (status='approved' AND action_type='dev_task' AND action_params->>'dev_status'='배포대기')
      ORDER BY h DESC LIMIT 12`;
    if (gates.length) {
      const late = gates.filter((g) => Number(g.h) >= 24);
      L.push(`## 🚦 사람 대기 ${gates.length}건${late.length ? ` — ⚠️ 24h+ 지연 ${late.length}건` : ""}`);
      for (const g of gates.slice(0, 8)) {
        const sla = Number(g.h) >= 72 ? "🔴심각" : Number(g.h) >= 24 ? "🟠지연" : Number(g.h) >= 6 ? "🟡주의" : "🟢";
        L.push(`- ${sla} #${g.id} ${g.ds ?? g.status} · ${g.h}h · ${g.title}`);
      }
      L.push(`> 조치 위치: /admin/org → 🛠 개발 파이프라인(배포대기는 정체 목록에 🚀배포·폐기 버튼이 함께 있음)\n`);
    }
  } catch { /* graceful */ }

  // 1) 크론 건강 — 실패(ok=false) + 정지의심(EXPECT_MAX_H 초과) 둘 다 본다(2026-07-02 수리:
  //    과거 실패만 봐서 "전 크론 정상"이 정지를 가림). 감시 계약은 lib/jobTeams.ts 단일 출처.
  //    (tsx 없이 plain node로 돌면 staleness 생략 — 러너는 --import tsx 사용)
  let EXPECT = {};
  try { ({ EXPECT_MAX_H: EXPECT } = await import("../lib/jobTeams.ts")); } catch {}
  try {
    const runs = await sql`SELECT DISTINCT ON (job) job, ok, detail, EXTRACT(EPOCH FROM (now()-ran_at))/3600 h FROM agent_runs ORDER BY job, ran_at DESC`;
    const bad = runs.filter((r) => !r.ok);
    const stale = runs.filter((r) => r.ok && EXPECT[r.job] != null && +r.h > EXPECT[r.job]);
    L.push(`## 🤖 크론 건강 (${runs.length}개)`);
    if (!bad.length && !stale.length) L.push(`- ✅ 전 크론 정상`);
    if (bad.length) L.push(bad.map((r) => `- ❌ **${r.job}** (${(+r.h).toFixed(1)}h전): ${(r.detail || "").slice(0, 80)}`).join("\n"));
    if (stale.length) L.push(stale.map((r) => `- ⏸️ **${r.job} 정지의심** (${(+r.h).toFixed(1)}h전 — 정상주기 ${EXPECT[r.job]}h 초과)`).join("\n"));
    L.push(runs.map((r) => `${!r.ok ? "❌" : (EXPECT[r.job] != null && +r.h > EXPECT[r.job]) ? "⏸️" : "✅"}${r.job}(${(+r.h).toFixed(0)}h)`).join(" · ") + "\n");
  } catch (e) { L.push(`(크론 조회 실패)\n`); }

  // 1.5) 🚨 제안서 미인입 감시 (협업#187·#219 재발 원인 — 결재 #419, coord#221~224 재발 원인 — 결재 #421) —
  //    팀이 agent-reports/*-proposals-*.md로 P0 제안을 올려도 coordConsumer(lib/coordConsumer.ts)·
  //    coordinationLifecycle(lib/issues.ts) 둘 다 coordination DB 테이블만 스캔하고 이 파일 자체는 읽지 않아,
  //    사람이 놓치면 방치되는 사각이 반복 재발했다(coord#187 07-12, coord#219 07-19/20, coord#221→224 07-20~21).
  //    ⚠️ #421 근본원인: coordination 행 존재만으로 "인입됨"으로 오판했다 — 팀간 핸드오프(coord#221→222→223→224)가
  //    12h+ 왕복해도 실제 decisions 행이 생성된 적이 없는 채로 "연결됨" 취급돼 감시망을 통과했다. 진짜 인입 완료는
  //    decisions 행 생성뿐 — coordination만 있으면 "핸드오프 루프 중"으로 여전히 표시한다.
  //    결정론 감시만(자동 결재/협업 생성 없음, lib/issues.ts 동결 무관) — 여기 걸리면 다음 self-audit·기조실장
  //    사이클이 이 DIGEST를 읽고 판단한다. 12h~168h(7일) 미해결만 표시(정상 검토시간엔 안 뜨고, 몇 주 전 이력까지
  //    훑는 노이즈도 방지). 48h→168h로 확장한 이유: P47/P48(rulegap-proposals-20260719-0813.md)이 생성 후 47h대에
  //    걸려있어 기존 48h 캡이 실제 방치를 창밖으로 밀어내 숨기기 직전이었다 — #421 재발 원인 중 하나.
  //    ⚠️ #427 근본원인: title/detail ILIKE 매치가 "이 제안서를 실제로 다룬 결재행"과 "이 제안서 미인입 문제를
  //    논의만 하는 메타 결재행"(#421처럼 "감시 로직을 고쳤다"는 내용에서 대상 파일명을 나열)을 구분 못 해, 메타
  //    결재행이 나오는 순간 그 안에 언급된 모든 제안서가 "인입완료"로 오판되고 감시망에서 사라졌다(P46/47/48+id1032
  //    가 #421 배포 후 실제로 그렇게 사라짐 — 재확인 결재 #427이 발견). 같은 창(window) 안에서 서로 다른 제안서
  //    stem을 2개 이상 동시에 언급하는 결재행은 "제안서 개별 처리"가 아니라 "메타 논의"로 보고 인입 증거에서 제외한다.
  //    ⚠️ #450 근본원인(#427 수정의 잔여 오탐): 위 "stem 2개+ = 메타" 휴리스틱이 #428처럼 "여러 제안서를 한 결재행에
  //    묶어 실제로 다 구현한" 정상 배치 처리까지 메타로 오판했다(P46 파일 stem + P47/P48 파일 stem 동시 언급 → 즉시
  //    제외). 실측: #421·#427(진짜 메타 — 이 감시 로직 자체 make-digest.mjs를 고친 결재행이 예시로 대상 파일명을
  //    나열)과 #428(진짜 구현 — lib/criteriaListsBase.ts·lib/reviewQuality.ts에 실제 코드 반영)을 "몇 개 stem을
  //    언급했나"로는 구분 불가 — 둘 다 2개+ 언급. 대신 "그 결재행 자신의 action_params가 make-digest.mjs(이 감시
  //    스크립트 자신)를 고쳤는가"로 판별한다: 감시 로직 자기수정 결재행은 대상 제안서를 실제로 구현한 게 아니므로
  //    항상 메타 제외. 그 외(감시 스크립트를 안 건드린) 결재행은 stem 여러 개 동시 언급 + 코드 배포 완료(dev_status
  //    deployed/built) 조합이면 배치 구현으로 인정한다(#428류 재발 방지).
  //    ⚠️ #502 근본재설계(#450 수정에도 3주+ 재발): 위 stem ILIKE 매치 계열 전부가 같은 잘못된 전제 위에 있었다 —
  //    "이 제안서를 처리한 결재행은 파일명 문자열을 그대로 담고 있을 것"이라는 가정. 실측(risk-proposals-20260720/
  //    23·b2b-sales-proposals-20260718 등 25건 표본)해보니 사실이 아니었다: (a) risk-proposals류는 신규 제안이
  //    아니라 **기존 결재#356/#398처럼 번호로 이미 콕 집어 촉구**하는 재확인 리포트라 파일명이 결재문에 실릴 이유가
  //    없고(집행대기는 이미 백로그 섹션에 별도 표출 중 — 중복 신호), (b) selfaudit-proposals·rulegap-proposals류는
  //    아예 처음부터 "## decisions#421 —"·"(사전추가, decisions#477)"처럼 **자기가 상신한 결재 번호를 헤딩/본문에
  //    스스로 명시**하는 관행인데 stem 매칭은 이걸 못 읽고, (c) selfaudit-proposals-20260722-0800.md처럼 "결재
  //    상신: 없음"(참고만, 애초에 신규 인입 대상 아님)인 파일까지 후보에 넣고 있었다. 세 경우 다 stem 문자열 매칭을
  //    아무리 정교화해도(#421→#427→#450) 원리상 못 잡는다 — 근본원인은 "파일명 재인용 여부"를 신호로 쓴 것 자체.
  //    재설계: 매칭 신호를 **팀이 스스로 남긴 결재 번호 인용**(1차, 결정론)으로 바꾸고, stem ILIKE는 번호 인용이
  //    없는 순수 신규 제안만 잡는 2차 폴백으로 유지한다(id1032류처럼 인용 없이 신규 제안됐다가 나중에 메타 결재행에
  //    언급만 되는 케이스는 여전히 #427/#450 폴백이 필요). 1차: 파일 텍스트에서 `결재#N`/`decisions#N`(체인 표기
  //    `decisions#477/#478/#479` 포함) 인용을 (i) 헤딩 앞부분(40자 이내) 또는 (ii) "완료·등재·승인·기존·이미" 인접
  //    어휘로만 한정 추출(단순 배경설명 인용은 제외 — b2b-sales-proposals-20260722/24가 결재#416·#398을 "이 결정은
  //    막은 적 없다"는 배경으로만 언급한 건 안 걸려야 함, 실측 확인됨) → 그 번호가 decisions 테이블에 실존하면
  //    "이미 스스로 추적 중"으로 보고 제외. 파일 전체가 "상신: 없음"(승인 필요 문구도 없음)이면 애초에 인입 대상이
  //    아니므로 통째로 제외. 실DB 재현검증(07-25): 기존 22건 stale → 신규 10건(전부 인용 없는 순수 신규 제안,
  //    redteam-proposals-20260719~23·b2b-sales-proposals-20260722/24·rulegap-proposals-20260723-0820) 확인, 제거된
  //    12건은 전부 결재#356/#465~479/#421/#422/#429/#444 등 자기인용 확인 또는 "상신 없음" 순수참고 파일.
  try {
    const CITE = /(?:결재|decisions?)\s*#\s*\d+(?:\s*[/·,]\s*#\s*\d+)*/gi;
    const CITE_INDICATOR = /완료|등재|승인|기존|이미/;
    const extractSelfCitedIds = (text) => {
      const ids = new Set();
      for (const line of text.split("\n")) {
        const isHeadingLine = /^#{1,6}\s/.test(line);
        let m;
        CITE.lastIndex = 0;
        while ((m = CITE.exec(line))) {
          const chain = m[0];
          let qualifies = isHeadingLine && m.index < 40;
          if (!qualifies) {
            const before = line.slice(Math.max(0, m.index - 15), m.index);
            const after = line.slice(m.index + chain.length, m.index + chain.length + 15);
            qualifies = CITE_INDICATOR.test(before) || CITE_INDICATOR.test(after);
          }
          if (qualifies) (chain.match(/\d+/g) || []).forEach((n) => ids.add(n));
        }
      }
      return ids;
    };
    // ⚠️ #763 근본원인(9차 재발 계열): (a) "오늘 신규 승인 요청 없음"처럼 "요청"이 "없음" 바로 앞에 오는
    //   phrasing을 "상신"/"제안"만 잡던 alt가 놓쳤다 — "요청"을 alt에 추가. (b) 더 근본적으로, b2b-sales
    //   팀 리포트의 고정 템플릿 제목(H1) 자체가 항상 "승인 필요 제안 — DATE"라서, 부정조건 !/승인\s*필요/를
    //   전체 텍스트에 걸면 본문에 어떤 no-proposal 문구를 써도 제목의 "승인 필요" 때문에 매번 걸려 b2b-sales
    //   팀은 영구적으로 isExplicitNoProposal=false로 고정되는 구조였다. 부정조건만 H1 제목 줄(고정 보일러
    //   플레이트)을 뺀 본문으로 스코프를 축소한다 — 긍정조건은 그대로 전체 텍스트(제목 자체가 "제안 없음"인
    //   rulegap류 파일이 있어 축소하면 역회귀).
    const isExplicitNoProposal = (text) => {
      const bodyNoH1 = text.split("\n").filter((l) => !/^#\s/.test(l)).join("\n");
      return /(?:상신|제안|요청)\s*[:\s]*(?:없음|0건)/.test(text) && !/승인\s*필요/.test(bodyNoH1);
    };

    // ⚠️ #518 근본전환(coord#255, #421→#427→#450→#502 5차 재발): #502가 "번호 인용"으로 1차 신호를
    //    고쳤지만, 인용 없는 순수 신규 제안의 2차 폴백은 여전히 "파일명 stem이 결재문에 그대로 실린다"는
    //    틀린 전제(#502가 이미 폐기했어야 할 가정)에 머물러 있었다 — 실측(coord#255) 결과 결재행은 파일명이
    //    아니라 팀이 다루는 대상 자체(카페id·룰갭 P번호·브랜드명)로 타이틀링된다(예: "id1032 블루보틀 인천롯데
    //    팝업", "[룰갭 P52] ..."). 폴백 신호를 "파일명 문자열"에서 "제안서 본문(헤딩)이 실제로 다루는 대상
    //    토큰"으로 교체한다: (a) 카페id(id\d+), (b) 룰갭 번호(P\d{2,} — "P0/P1" 같은 우선순위 라벨과 겹치지
    //    않게 2자리+만), (c) 헤딩에 등장하는 한글 고유명사류 단어(2자+, 불용어 제외 = 브랜드명·주제어). id·P는
    //    단 1개만 겹쳐도 확정 매치(고유 식별자), 브랜드명류 단어는 우연 일치 방지를 위해 2개 이상 동시 겹쳐야
    //    매치로 인정한다.
    const TOKEN_STOPWORDS = new Set([
      "신규", "제안", "배경", "현황", "결함", "유형", "근거", "권장", "요청", "승인", "필요", "예상", "영향",
      "범위", "확인", "실제", "예시", "실측", "기존", "오늘", "현재", "분류", "대상", "방식", "리스크", "위치",
      "등급", "검토", "진행", "완료", "실패", "참고", "조치", "결론", "정리", "요약", "제안서", "사이클",
      // 도메인 보일러플레이트 — 거의 모든 결재행·제안서에 등장해 브랜드 식별력이 없다(카페 리뷰 플랫폼 특성상
      // "카페"·"리뷰"·"방문" 등은 사실상 불용어다). #518 1차수정에서 이 단어들이 무관 결재행 대량 오탐매치를
      // 일으켜(예: 저번호 decisions가 "인천"·"카페" 우연 일치로 걸림) 발견, 추가.
      "카페", "리뷰", "방문", "브랜드", "매장", "지점", "점포", "레드팀", "룰갭", "결재", "협업", "감시",
      "재상신", "연속", "폐업", "종료", "재합성", "합성", "재요청", "후보", "사례", "조사", "오염", "교차",
      "매칭", "형제", "동명",
    ]);
    const extractContentTokens = (text) => {
      const ids = new Set();
      const brands = new Set();
      // ⚠️ #558 근본원인: 헤딩전용 추출은 카페id를 헤딩이 아니라 마크다운 **표**(| id | 이름 | ... |)로
      // 나열하는 레드팀 제안서(예: redteam-proposals-20260729-0815.md)에서 tokens.ids가 완전히 비어
      // 영구 "루프 의심" 오탐을 낳았다(decisions#540이 이미 정확히 처리했는데도). 표 데이터행도 스캔하되,
      // 표 헤더의 첫 컬럼명이 정확히 "id"인 표만 대상으로 한정한다(순번·순위 등 무관한 숫자 컬럼을 카페id로
      // 오매핑하는 새 오탐을 막기 위함 — 헤더 확인 없이 "첫 컬럼이 숫자면 id"로만 판별하면 표마다 의미가
      // 달라 위험).
      // ⚠️ #646 근본원인(self-audit 08-10): #558은 "표 형식"에만 특화 패치를 얹었을 뿐, id\d+/P\d{2,}
      // 추출 자체는 여전히 "## " 헤딩 줄에만 갇혀 있었다 — 불릿·중첩목록·코드블록 등 새 마크다운 구조로
      // id를 적는 제안서가 나오면 6번째 재발이 예정돼 있었다(#421→#427→#450→#502→#518→#558). id\d+·
      // P\d{2,}는 고유 식별자라 우연일치 위험이 낮다(아래 decisionMatchesTokens가 1개만 겹쳐도 확정
      // 처리하는 이유가 바로 이거다) — 헤딩 제한을 풀고 문서 전체 어느 줄에서든 추출한다. 표의 "순수
      // 숫자" id 컬럼(셀 자체엔 "id" 접두가 없고 헤더로만 의미가 정해지는 경우)만은 구조 정보 없인
      // 일반 정규식으로 복원 불가능해 그 갈래(표 헤더 인식)는 그대로 남긴다.
      let tableHasIdColumn = false;
      for (const line of text.split("\n")) {
        const row = line.match(/^\s*\|(.+)\|\s*$/);
        if (row) {
          const firstCell = row[1].split("|")[0].trim();
          if (/^-+$/.test(firstCell)) continue; // 헤더 구분행(|---|---|)은 상태 유지
          if (/^id$/i.test(firstCell)) { tableHasIdColumn = true; continue; } // 표 헤더행 확인
          if (tableHasIdColumn && /^\d+$/.test(firstCell)) ids.add(`id${firstCell}`);
        } else {
          tableHasIdColumn = false; // 표 블록 종료 — 다음 표를 위해 리셋
        }
        // id\d+·P\d{2,}는 헤딩 여부와 무관하게 줄 전체에서 추출(일반화) — 불릿·중첩목록·표 셀 인라인
        // 표기("| id1032 | ... |")·코드블록까지 커버.
        (line.match(/\bid\d+\b/gi) || []).forEach((t) => ids.add(t.toLowerCase()));
        (line.match(/\bP\d{2,}\b/g) || []).forEach((t) => ids.add(t));
        if (!/^#{2,6}\s/.test(line)) continue; // ## 이상만 — 브랜드 단어류는 우연일치 위험이 높아 헤딩으로 한정 유지(#518 교훈), 파일 H1은 전 파일 공통 보일러플레이트라 제외
        const heading = line.replace(/^#{2,6}\s*/, "");
        (heading.match(/[가-힣]{2,}/g) || []).forEach((w) => { if (!TOKEN_STOPWORDS.has(w)) brands.add(w); });
      }
      return { ids, brands };
    };
    const decisionMatchesTokens = (d, tok) => {
      const text = `${d.title || ""} ${d.detail || ""} ${d.action_params?.ref || ""}`;
      if ([...tok.ids].some((id) => text.includes(id))) return true; // 고유 식별자는 1개만 겹쳐도 확정
      return [...tok.brands].filter((b) => text.includes(b)).length >= 2; // 일반 단어는 2개+ 동시 일치만 인정
    };

    const files = existsSync(AR) ? readdirSync(AR).filter((f) => /-proposals-\d{8}/.test(f) && f.endsWith(".md")) : [];
    const candidates = [];
    for (const f of files) {
      const ageH = (Date.now() - statSync(`${AR}/${f}`).mtimeMs) / 3.6e6;
      if (ageH < 12 || ageH > 168) continue;
      let text = ""; try { text = readFileSync(`${AR}/${f}`, "utf8"); } catch {}
      candidates.push({ f, ageH, stem: f.replace(/\.md$/, ""), text, cited: extractSelfCitedIds(text), noProposal: isExplicitNoProposal(text), tokens: extractContentTokens(text) });
    }
    const allCitedIds = [...new Set(candidates.flatMap((c) => [...c.cited]))].map(Number);
    const existingCited = allCitedIds.length ? await sql`SELECT id FROM decisions WHERE id = ANY(${allCitedIds})`.catch(() => []) : [];
    const existingCitedIds = new Set(existingCited.map((r) => String(r.id)));

    const stale = [];
    for (const c of candidates) {
      const selfCovered = c.noProposal || [...c.cited].some((id) => existingCitedIds.has(id));
      if (selfCovered) continue;
      const tokenList = [...c.tokens.ids, ...c.tokens.brands];
      // ⚠️ LIMIT을 걸면 흔한 단어(과거엔 "카페"·"인천" 등) 우연일치 행이 먼저 채워져 진짜 대상 결재행이
      // 잘려나갈 수 있다(#518 1차수정 실측 재현). decisions 전체가 500행 남짓이라 LIMIT 없이 전부 받아
      // JS에서 정확히 판별하는 편이 더 싸고 안전하다.
      const hitDecision = tokenList.length
        ? await sql`
            SELECT title, detail, action_params FROM decisions d
            WHERE EXISTS (
              SELECT 1 FROM unnest(${tokenList}::text[]) t
              WHERE d.title ILIKE '%' || t || '%' OR d.detail ILIKE '%' || t || '%' OR d.action_params->>'ref' ILIKE '%' || t || '%'
            )
            ORDER BY d.id DESC`.catch(() => [])
        : [];
      const realHit = hitDecision.some((d) => {
        const ap = d.action_params || {};
        const selfChange = `${ap.summary || ""} ${ap.branch || ""} ${ap.file || ""}`;
        if (/make-digest\.mjs/i.test(selfChange)) return false; // 감시 로직 자기수정 — 대상 제안서 미구현
        if (!decisionMatchesTokens(d, c.tokens)) return false;
        // 배치 처리(#428류) 판정은 오직 고유 식별자(id\d+/P\d{2,})로만, 그것도 **title에 실제로 명시된
        // 대상**만 센다 — detail 본문은 "id11208/18854와 동일 구조적 갭" 처럼 다른 건을 배경비교로만 지나가듯
        // 언급하는 경우가 흔해(#494 실측), 본문까지 포함하면 무관한 후보가 무더기로 "같은 배치"로 오판된다
        // (#518 1차수정 실측: id1032 단일건이 무관 후보 4개와 "겹침" 오판). title은 결재행이 실제로 "이 건에
        // 대한" 결정임을 선언하는 자리라 훨씬 신뢰도 높은 신호.
        const decisionTitle = d.title || "";
        const idMatchedCandidates = c.tokens.ids.size
          ? candidates.filter((o) => o.tokens.ids.size && [...o.tokens.ids].some((id) => decisionTitle.includes(id))).length
          : 1; // 이 후보 자체가 식별자 없이 브랜드 단어만으로 히트한 경우(예: 코드제안류) — 배치판정 대상 아님, 단일 취급
        if (idMatchedCandidates <= 1) return true;
        return (ap.dev_status === "deployed" || ap.dev_status === "built") && !!ap.summary; // 배치 구현 인정
      });
      if (realHit) continue;
      const hitCoord = await sql`SELECT 1 FROM coordination WHERE topic ILIKE ${"%" + c.stem + "%"} OR detail ILIKE ${"%" + c.stem + "%"} LIMIT 1`.catch(() => []);
      const first = c.text.split("\n").find((l) => l.trim()) || "";
      stale.push({ f: c.f, ageH: c.ageH, first: first.replace(/^#+\s*/, "").slice(0, 70), coordOnly: hitCoord.length > 0 });
    }
    L.push(`## 🚨 제안서 미인입 감시 (12h+ · decisions행 미생성)`);
    // ⚠️ coord#255 톤다운 권고: 토큰 매칭도 완벽하진 않다(브랜드명 추출 실패 등) — 확정 단정("미인입 의심")
    //    대신 대사 후 판단을 요구하는 어조로 유지해 오탐이 남더라도 closure-agent 등이 성급히 "파이프라인
    //    점검 시급"으로 오판하지 않게 한다.
    if (!stale.length) L.push(`- ✅ 없음\n`);
    else L.push(stale.map((s) => `- ⚠️ **${s.f}** (${s.ageH.toFixed(0)}h전${s.coordOnly ? ", 협업 핸드오프 중이나 결재행 미생성 — 루프 의심" : ", 미인입 가능성(오탐 가능성 있음 — decisions 직접 대사 후 판단)"}): ${s.first}`).join("\n") + "\n");
  } catch (e) { L.push(`(제안서 감시 실패)\n`); }

  // 2) 핵심 수치
  try {
    const m = (await sql`SELECT count(*) FILTER(WHERE published) pub, count(*) FILTER(WHERE published AND synth_grade='검증') v, count(*) FILTER(WHERE published AND synth_grade='참고') r, count(*) FILTER(WHERE synth_updated IS NULL) q, count(*) FILTER(WHERE needs_llm) nl FROM cafes`)[0] ?? {};
    const mm = (await sql`SELECT count(*) FILTER(WHERE published) pub, count(*) FILTER(WHERE published AND synth_grade='검증') v, count(*) FILTER(WHERE published AND synth_grade='참고') r, count(*) FILTER(WHERE synth_updated IS NULL) q, count(*) FILTER(WHERE needs_llm) nl FROM cafes`);
    const x = mm[0];
    L.push(`## 📈 핵심 수치`);
    L.push(`- 공개 ${(+x.pub).toLocaleString()} (검증 ${(+x.v).toLocaleString()} · 참고 ${(+x.r).toLocaleString()}) · 합성대기 ${x.q} · needs_llm ${x.nl}\n`);
  } catch (e) { L.push(`(수치 조회 실패)\n`); }

  // 3) 백로그
  L.push(`## 📦 백로그`);
  try {
    // 관제탑과 같은 기준(L3만 CEO 결재)으로 — 화면 간 수치 갈림 방지(2026-07-02). L2 pending은 별도 표기.
    const pend = await sql`SELECT id,title,team,severity FROM decisions WHERE status='pending' AND COALESCE(tier,'L3')='L3' ORDER BY id`;
    const pendL2 = await sql`SELECT id,title,action_type FROM decisions WHERE status='pending' AND tier='L2' ORDER BY id`.catch(() => []);
    // ⚠️ autoCorrect()의 L2 자동승인은 unpublish·requeue_resynth만 대상(lib/issues.ts). investigate 등 나머지는
    //   자동승인이 절대 안 되는데도 예전엔 여기서 전부 "자동승인 예정"으로 뭉뚱그려 29~81h 방치를 낳았다(#534).
    const L2_AUTO_TYPES = new Set(["unpublish", "requeue_resynth"]);
    const pendL2Auto = pendL2.filter((p) => L2_AUTO_TYPES.has(p.action_type));
    const pendL2Manual = pendL2.filter((p) => !L2_AUTO_TYPES.has(p.action_type));
    const appr = await sql`SELECT id,title,team FROM decisions WHERE status='approved' ORDER BY id`;
    const defr = await sql`SELECT id,title,team FROM decisions WHERE status IN ('deferred','resolved') ORDER BY id`.catch(() => []);
    const coord = await sql`SELECT id,from_team,to_team,topic, round(EXTRACT(EPOCH FROM (now()-created_at))/86400,1) d FROM coordination WHERE status IN ('open','in_progress') ORDER BY created_at`.catch(() => []);
    const af = await sql`SELECT cafe_id,cafe_name,detail FROM audit_flags WHERE issue!='audit_complete' AND COALESCE(resolved,false)=false ORDER BY flagged_at DESC LIMIT 10`.catch(() => []);
    const gr = await one(sql`SELECT count(*) c FROM grounding_checks WHERE grounded=false`.catch(() => [{ c: 0 }]));
    const offc = await one(sql`SELECT count(*) c FROM cafes WHERE published AND offctx_rate>=0.5 AND COALESCE(offctx_ok,false)=false`.catch(() => [{ c: 0 }]));
    const clo = await one(sql`SELECT count(*) c FROM cafes WHERE published AND closure_misses>=3`.catch(() => [{ c: 0 }]));
    const supp = await one(sql`SELECT count(*) c FROM cafe_supplements WHERE status='new'`.catch(() => [{ c: 0 }]));
    L.push(`- **CEO 결재 대기(L3) ${pend.length}**: ${pend.map((p) => `#${p.id} ${p.title.slice(0, 30)}(${p.team})`).join(" / ") || "없음"}`);
    if (pendL2Auto.length) L.push(`- L2 전결 대기(자동승인 예정) ${pendL2Auto.length}: ${pendL2Auto.map((p) => `#${p.id}`).join(",")}`);
    if (pendL2Manual.length) L.push(`- L2 전결 대기(자동승인 미대상 — 기조실장 수동 조치 필요) ${pendL2Manual.length}: ${pendL2Manual.map((p) => `#${p.id}(${p.action_type})`).join(",")}`);
    L.push(`- **집행 대기(approved) ${appr.length}**: ${appr.map((a) => `#${a.id} ${a.title.slice(0, 30)}(${a.team})`).join(" / ") || "없음"}`);
    if (defr.length) L.push(`- **⏸️ 보류(deferred/resolved) ${defr.length} — 생애주기 확인 필요**: ${defr.map((a) => `#${a.id} ${a.title.slice(0, 30)}(${a.team})`).join(" / ")}`);
    L.push(`- **미해결 협업 ${coord.length}**: ${coord.map((c) => `#${c.id} ${c.topic}(${c.from_team}→${c.to_team}·${c.d}일)`).join(" / ") || "없음"}`);
    L.push(`- **품질오염 audit_flags ${af.length}**: ${af.map((a) => `#${a.cafe_id} ${a.cafe_name}(${(a.detail || "").slice(0, 24)})`).join(" / ") || "없음"}`);
    L.push(`- 그라운딩 의심 ${gr} · 맥락watchlist ${offc} · 폐업 검토대기 ${clo}${supp ? ` · 🆕 사장님 보완제보 ${supp}건(cafe_supplements — 운영본부 검토)` : ""}\n`);
  } catch (e) { L.push(`(백로그 조회 실패)\n`); }

  // 4) 오늘 리포트 목록 + 첫 줄
  try {
    const files = existsSync(AR) ? readdirSync(AR).filter((f) => f.endsWith(".md") && f.includes(today.replace(/-/g, ""))) : [];
    L.push(`## 📄 오늘 리포트 (${files.length})`);
    for (const f of files.slice(0, 25)) {
      let first = "";
      try { first = readFileSync(`${AR}/${f}`, "utf8").split("\n").find((l) => l.trim()) || ""; } catch {}
      L.push(`- ${f}: ${first.replace(/^#+\s*/, "").slice(0, 60)}`);
    }
    L.push("");
  } catch (e) { L.push(`(리포트 목록 실패)\n`); }

  // 5) self-audit 토큰 추세 (레이트리밋 감시 — 대표님 지시 2026-06-30). 결정론·읽기전용. chief-manager가 EXECUTIVE에 포함.
  try {
    const up = `${AR}/USAGE.tsv`;
    if (existsSync(up)) {
      const rows = readFileSync(up, "utf8").trim().split("\n").map((r) => r.split("\t")).filter((r) => r[1] && r[1].includes("self-audit"));
      const byDay = {};
      for (const r of rows) { const d = (r[0] || "").slice(0, 10); const t = parseInt(r[5]) || 0; (byDay[d] = byDay[d] || { n: 0, t: 0 }); byDay[d].n++; byDay[d].t += t; }
      const days = Object.entries(byDay).slice(-5);
      L.push(`## 🔎 self-audit 토큰 추세 (레이트리밋 감시)`);
      L.push(days.map(([d, v]) => `${d.slice(5)}: ${v.n}회·${v.t}턴`).join(" · ") || "데이터 없음");
      if (days.length >= 3) { const last = days[days.length - 1][1].t; const avg = days.slice(0, -1).reduce((s, [, v]) => s + v.t, 0) / (days.length - 1); if (last > avg * 1.8 && last > 120) L.push(`⚠️ 오늘 self-audit 턴(${last})이 최근 평균(${Math.round(avg)})의 1.8배+ — 주기(현 09·15·21시+일간사이클+이벤트5분) 재검토 권고`); }
      L.push("");
    }
  } catch (e) { /* graceful */ }

  // 6) 위치동의 기기 실사용 패턴 — EXECUTIVE 정기보고서(08:00/17:00) 신규 섹션(#315). 위치동의(region 보유)+내부(대표·팀)
  //    제외 기기 중 최근7일 페이지뷰 2회+(핑 1회뿐인 기기는 노이즈라 제외)만. traffic_events 조인으로 세션길이·핵심행동 산출.
  try {
    const rows = await sql`
      SELECT uc.anon_id, uc.region,
             CASE WHEN uc.user_agent ~* 'Mobile|iPhone|Android|iPad' THEN '모바일' ELSE '데스크톱' END AS device,
             COALESCE(NULLIF(uc.src,''),'미상') AS src,
             array_agg(json_build_object('p', te.path, 't', te.ts) ORDER BY te.ts) AS events
      FROM user_consents uc
      JOIN traffic_events te ON te.anon_id = uc.anon_id
      WHERE uc.region IS NOT NULL AND NOT COALESCE(uc.internal,false) AND te.ts > now() - interval '7 days'
        AND uc.anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)})
      GROUP BY uc.anon_id, uc.region, uc.user_agent, uc.src
      HAVING COUNT(te.*) >= 2
      ORDER BY MAX(te.ts) DESC
      LIMIT 15`;
    // ⚠️ "/cafe" 단독(강동·구리 소비자용 취향퀴즈 페이지)까지 잡히지 않게 "/cafe/register"만 사장님 버킷으로.
    const bucket = (p) => (!p || p === "/") ? "홈" : p.startsWith("/c/") ? "카페상세" : p.startsWith("/area") ? "지역" : p.startsWith("/taste") ? "취향" : (p.startsWith("/owner") || p.startsWith("/cafe/register")) ? "사장님" : "기타";
    // 30분 무활동 갭 = 새 세션(표준 웹분석 관례). 7일 통짜 활동폭(수천분)을 '세션'으로 잘못 표기하지 않도록 클러스터링.
    const SESSION_GAP_MS = 30 * 60 * 1000;
    const sessionize = (events) => {
      const sessions = [[events[0]]];
      for (let i = 1; i < events.length; i++) {
        const gap = new Date(events[i].t) - new Date(events[i - 1].t);
        if (gap > SESSION_GAP_MS) sessions.push([events[i]]);
        else sessions[sessions.length - 1].push(events[i]);
      }
      return sessions;
    };
    L.push(`## 📍 위치동의 기기 실사용 패턴 (최근7일 · 핑1회뿐 제외 · ${rows.length}대)`);
    if (!rows.length) {
      L.push(`- 최근7일 내 조건(위치동의+2PV↑) 만족 기기 없음\n`);
    } else {
      L.push(`| 지역 | 기기 | 유입경로 | 세션(분) | PV | 핵심행동 |`);
      L.push(`|---|---|---|---|---|---|`);
      let sumSession = 0, sumPv = 0;
      for (const r of rows) {
        const counts = {};
        for (const e of r.events) counts[bucket(e.p)] = (counts[bucket(e.p)] || 0) + 1;
        const behavior = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k}×${v}`).join(", ");
        const sessions = sessionize(r.events);
        const avgSessionMin = sessions.reduce((s, ss) => s + (new Date(ss[ss.length - 1].t) - new Date(ss[0].t)) / 60000, 0) / sessions.length;
        sumSession += avgSessionMin; sumPv += r.events.length;
        L.push(`| ${r.region} | ${r.device} | ${r.src} | ${avgSessionMin.toFixed(1)} | ${r.events.length} | ${behavior} |`);
      }
      const topRegion = Object.entries(rows.reduce((a, r) => ((a[r.region] = (a[r.region] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1])[0];
      L.push(`- 한줄 해설: ${topRegion[0]} 지역 기기 최다(${topRegion[1]}대) · 평균세션 ${(sumSession / rows.length).toFixed(1)}분 · 평균PV ${(sumPv / rows.length).toFixed(1)}\n`);
    }
  } catch (e) { L.push(`(위치동의 기기 패턴 조회 실패)\n`); }

  // 7) 오늘 일일 분석요약 — 페이지 조회순위·체류시간·유의미 사용자(#350 심층화). EXECUTIVE 17시 일일보고서가
  //    이 DIGEST를 읽으므로, 여기서 매 사이클 재계산해야 별도 수동 트리거 없이 당일 최신 데이터로 맞물린다(#351).
  //    쿼리·문장 로직은 lib/dailySummary.ts 단일출처(app/api/admin/analytics/route.ts와 공유).
  try {
    const { getTodayInsight, formatTodayInsightLines } = await import("../lib/dailySummary.ts");
    const todayInsight = await getTodayInsight(sql);
    const lines = formatTodayInsightLines(todayInsight);
    L.push(`## 🧾 오늘 일일 분석요약 (페이지 조회순위·체류시간·유의미 사용자)`);
    L.push(lines.length ? lines.map((l) => `- ${l}`).join("\n") : "- 오늘 표본 부족으로 요약 문장 생략(숫자 날조 금지)");
    L.push("");
  } catch (e) { L.push(`(일일 분석요약 조회 실패: ${String(e).slice(0, 100)})\n`); }

  const out = L.join("\n");
  writeFileSync(`${AR}/DIGEST.md`, out);
  console.log(`✅ DIGEST.md 생성 (${out.length}자, ${(out.length / 1024).toFixed(1)}KB)`);
})();
