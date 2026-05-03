---
id: PRD-PV-CORE
title: Polaris Vibe Spec — repo-local intent traceability checker
status: shipped
owner: miles-hs-lee
created: 2026-05-03
updated: 2026-05-04
intents:
  - REQ-PV-001
  - REQ-PV-002
  - REQ-PV-003
  - REQ-PV-004
  - REQ-PV-005
  - REQ-PV-006
  - REQ-PV-007
  - REQ-PV-008
  - REQ-PV-009
  - REQ-PV-010
  - REQ-PV-011
  - REQ-PV-012
  - REQ-PV-013
  - REQ-PV-014
  - REQ-PV-015
  - REQ-PV-016
  - API-PV-CHANGED
  - API-PV-REVIEW
  - API-PV-PRD-CHECK
  - API-PV-VALIDATE
  - API-PV-HEALTH
  - API-PV-DIFF
  - API-PV-DIAGRAM
  - API-PV-EXPORT-ALL
  - API-PV-RENAME
tags: [thesis, positioning, dogfood]
---

# Polaris Vibe Spec — core PRD

> English version: [CORE.md](CORE.md).

이 문서는 프로젝트 자체의 PRD이며, 프로젝트 자체의 `pv prd check`로
검증됩니다. *"PV가 무엇이고 왜 존재하며 무엇은 범위 안이고 무엇은
밖인가"* 라는 질문에 대한 단일 캐노니컬 답입니다 — 첫 PR을 올리기
전 컨트리뷰터, 도입을 망설이는 회의론자, 6개월 뒤 자기가 왜 그런
트레이드오프를 했는지 잊은 메인테이너를 위한.

## Problem

소프트웨어 프로젝트는 의도를 축적합니다 — *왜* 이 함수가 존재하는지,
이 서비스가 *무엇을* 해야 하는지, 이 워크플로가 *누구를* 위한
것인지. 이런 의도는 대부분 사람의 머릿속에 살아있죠. 작은 팀에서는
이게 작동합니다 — 시니어한테 묻고, Slack 검색하고, 지난 분기의
설계 문서를 읽으면 됩니다.

이 합의는 세 축에서 *동시에* 무너집니다:

1. **시간.** 6개월 뒤 원작자는 *자기 자신의* 결정을 코드만 보고
   재구성하지 못합니다.
2. **사람.** 신입은 적응에 몇 주를 쓰고, 시니어가 떠나면 조직의
   기억이 함께 사라집니다.
3. **AI 에이전트.** 에이전트는 우리 회사 Slack 히스토리도, 옆자리
   시니어도, 조직의 기억도 없습니다. 적혀있지 않은 의도는 환각이
   되거나 토큰을 태우는 탐색이 됩니다.

요구사항 엔지니어링 도구들 (DOORS, Polarion, Jama) 은 30년간 항공우주·
의료기기·자동차 같은 규제 산업에서 비슷한 문제를 풀어왔습니다. 하지만
일반 소프트웨어 개발에는 너무 무겁죠. 애자일은 형식적 요구사항을
티켓과 Confluence 페이지로 대체했고, 그 합의는 *오직 사람만 코드를
다룰 때* 까진 잘 작동했습니다. AI 코딩 에이전트가 셈법을 바꿨을 뿐 —
의도를 사람 머릿속에 두는 비용은 늘 있었던 것이고, 에이전트가 그
비용을 가시화시켰습니다.

PV는 그 격차를 메우는 작은 repo-local 의도 레이어입니다.

<!-- pv-intents: REQ-PV-001, REQ-PV-015 -->

## Goals

PV는 다음을 충족해야 합니다:

- **단일 source of truth** 제공 — 프로젝트 의도를 git으로 관리
  가능하면서 기계가 읽을 수 있는 형태로. 손으로 쓴 prose 문서는
  drift합니다; PV의 `.polaris/graph.json`은 구조화되어 있고
  검증됩니다.
- **PR 시점에 drift 잡기.** 코드가 바뀌면, 그 변경이 닿는 의도-레이어
  연결과 새로 생긴 갭을 surface합니다 — codemap에 등록 안 된 새
  파일, 삭제됐는데 여전히 참조되는 파일, Intent description은 그대로인데
  동작이 바뀐 함수. `pv changed`가 구조 게이트, `pv review --prompt`가
  의미 게이트.
- **사람 친화 view 자동 생성** — 노드별 `spec/<id>.md`, 인덱스, 옵션의
  Mermaid/Graphviz 다이어그램. 리뷰어와 신입은 이 view를 읽고, 손으로
  편집하지 않습니다.
- **CI가 차단할 수 있는 그래프 정합성 표면** 제공 — dangling 관계,
  orphan 소스 파일, 잘못된 ID, 삭제된 Intent를 PRD가 여전히 참조하는
  경우 등.
- **화요일 오후에 도입할 수 있을 만큼 작아야** 함. npm install 한 번,
  `pv bootstrap` 한 번. DB 없음, 데몬 없음, SaaS 계정 없음.

<!-- pv-intents: REQ-PV-002, REQ-PV-003, REQ-PV-008, REQ-PV-010, API-PV-CHANGED, API-PV-REVIEW, API-PV-DIAGRAM -->

## Non-goals

PV는 명시적으로 *아닙니다*:

- Notion/Confluence/위키의 대체재. PV는 *의도 레이어*를 가지지, 이미
  거기 사는 prose-heavy 문서를 가지지 않습니다.
- LLM API 소비자. PV는 구조화된 프롬프트를 emit합니다 (`pv generate
  --prompt`, `pv enrich --prompt`, `pv prd check --prompt`,
  `pv review --prompt`). 사용자가 자기 코딩 에이전트로 그걸 실행합니다.
  PV는 API 키를 관리하지 않고, 모델을 고르지 않고, 토큰값을 지불하지
  않습니다.
- 프로젝트 관리 도구. 티켓, 스프린트, approver, 번다운 차트 없음.
  GitHub/Linear/Jira가 이미 합니다.
- 코드 생성기. Codex/Claude Code가 코드를 만들고, PV는 그들이 잘
  만들 수 있도록 컨텍스트를 줍니다.
- GUI. PV는 CLI입니다. 다이어그램은 사용자의 기존 렌더러를 위해
  Mermaid/Graphviz로 emit됩니다.

<!-- pv-intents: REQ-PV-003, REQ-PV-012, API-PV-PRD-CHECK -->

## User stories

### PR 작성자로서, 푸시 전에 drift를 본다.

`pv changed origin/main`이 orphan 파일, 깨진 codemap entry, 그리고
연결된 PRD 섹션이 갱신을 필요로 할 수 있는 Intent 노드들을 한 번에
구조화된 보고로 줍니다. warn/error 시 exit 1 — git hook이나 CI step이
push를 차단할 수 있습니다.

큰 diff에 대한 깊은 review는 `pv review origin/main --prompt`. 내
코딩 에이전트가 읽을 Markdown 프롬프트를 emit합니다. 에이전트는
intent description 갱신, 새로 ship된 capability를 위한 새 Intent
노드, contradicting PRD 섹션 수정을 제안하고, 나는 각 patch를 검토 후
기존 graph mutation 명령으로 적용합니다.

<!-- pv-intents: API-PV-CHANGED, API-PV-REVIEW -->

### 코드 리뷰어로서, PR에서 그래프 단위 변경을 본다.

`pv diff main`이 추가/삭제/변경된 노드와 관계를 보고하고, breaking
change (제거된 `implements` 또는 `uses` 엣지) 를 검출합니다. 출력은
PR 코멘트에 그대로 붙여넣기 가능; CI는 `has_breaking`으로 머지를
차단할 수 있습니다. `pv changed`가 파일 단위 drift gate로 함께 돕니다.

<!-- pv-intents: REQ-PV-015, API-PV-DIFF -->

### 개발자로서, "이 파일이 뭐야?" 에 1초 만에 답한다.

`pv why src/auth/login.ts`가 그 파일을 자기 codemap에 가진 모든
Intent 노드와 관계를 반환합니다. 코드 archaeology 중 *"Bob한테
물어봐"* 반사를 대체합니다.

<!-- pv-intents: REQ-PV-015 -->

### AI 에이전트로서, 레포 grep 대신 focused 파일 집합을 받는다.

`pv impact <id>`가 `{impacted_nodes, impacted_files, inferred_files,
warnings, coverage}`를 반환합니다. 비대칭 BFS (depends_on / implements
/ uses는 reverse, affects는 forward)가 집합을 좁게 유지합니다.
`coverage` 필드는 에이전트에게 *이 리스트를 신뢰할지, 아니면 grep도
함께 돌릴지* 알려줍니다.

`pv ask "<intent>"`는 옵션의 single-shot 프리앰블입니다 — intent
분류, 그래프 쿼리, top hit에 대한 impact 실행을 한 번의 호출로 묶습니다.
known node id가 아니라 free-form intent에서 시작할 때 유용합니다.

<!-- pv-intents: REQ-PV-001, REQ-PV-004, REQ-PV-006, REQ-PV-007, REQ-PV-009 -->

### PM으로서, 내 PRD의 주장이 코드에서 여전히 holds 한지 확인한다.

`pv prd check`가 `docs/prd/` 안의 PRD Markdown을 읽고, Intent 참조를
찾고 (frontmatter, 섹션 디렉티브, 본문 멘션), `graph.json`과의 drift를
보고합니다. `--prompt`와 함께면 사용자의 에이전트로 의미적 정렬을
수행할 섹션별 LLM 프롬프트를 emit합니다.

<!-- pv-intents: REQ-PV-016 -->

### 신입으로서, 아키텍처를 평이한 한국어/영어로 읽는다.

`spec/README.md`는 도메인과 노드 타입에 걸친 자동 생성 인덱스입니다.
각 노드는 자기 `spec/<id>.md` 페이지를 가지며 description, 관계,
codemap 파일을 포함합니다. 입사 첫 날 tribal-knowledge 격차 없음.

<!-- pv-intents: REQ-PV-010 -->

### 기존 레포에 PV를 도입하는 메인테이너로서, 한 명령으로 그래프 초안을 받는다.

`pv bootstrap --prompt`가 `src/`를 휴리스틱으로 스캔한 뒤, 사용자
에이전트가 의미적으로 다듬을 프롬프트를 emit합니다. 결과는
`.polaris/graph.bootstrap.json`에 쓰이고; 메인테이너가 검토 후 만족하면
`graph.json`으로 rename합니다.

`pv promote`는 리뷰어가 `spec/<id>.md`의 prose를 편집하고 (PR diff가
읽기 좋습니다!) 변경을 `graph.json`으로 round-trip 시킵니다. 구조 편집은
명확한 메시지와 함께 거부되며 올바른 CLI 명령을 가리킵니다.

<!-- pv-intents: REQ-PV-011, REQ-PV-013 -->

## Success metrics

PV의 가치는 사용자가 처음 보는 순서로 세 곳에서 발생합니다:

1. **PR 시점에 잡힌 drift.** `pv changed`는 orphan 파일, 깨진 codemap
   entry, 그리고 PRD 섹션이 갱신을 필요로 할 수 있는 unlinked-but-relevant
   Intent 노드에 fire합니다. Self-host 증거: PV 자체 PR 파이프라인이
   *깨끗한 결과* (0 orphans, 0 broken codemap)를 보고함 — 그래프가 매
   commit에서 코드와 함께 갱신되니까. drift gate의 가치는 *예방* 에서
   오지 일회성 catch에서 오지 않습니다; 실증 anchor는 bench-006
   (Layer 3 PRD ↔ graph drift, planted drift에 대해 4/4 actionable)과
   bench-007 (`pv review --prompt`, 4/4 hit + aligned control에서 0/4
   false positive).

2. **살아있는 architecture documentation.** 그래프 + `spec/` +
   `validate` + `health` + `diff` + `diagram`은 에이전트 사용 여부와
   무관하게 모든 도입 팀에 적용됩니다. Self-host 증거: PV 자신의
   그래프는 50+ 노드, 0 validate 에러, 모든 다이어그램이 CI에서 깨끗하게
   재생성됩니다. 새 컨트리뷰터는 `spec/README.md`로 인덱스를 읽고; PR
   리뷰어는 그래프 diff를 사람-친화 형식으로 봅니다.

3. **AI 에이전트를 위한 focused 컨텍스트.** `pv impact <id>`가 노드
   변경에 영향받는 비대칭 파일 집합을 반환합니다. `coverage` 인디케이터
   (narrow / broad / global)가 에이전트에게 *이 집합을 신뢰할지 grep도
   할지* 알려줍니다. 실증적으로, PV-routed 파일 집합을 사용하는 에이전트는
   정답 파일이 파일명이 아니라 그래프 관계에 인코딩된 cross-domain 작업에서
   *덜 방어적으로* 읽습니다.

[`experiments/`](../../experiments/README.md) 의 bench들은 재현 가능합니다 —
각 bench는 자기 `setup-fixture.sh`와 `run.sh`를 가집니다.

PV는 사용자가 자기 *자신의* 사용량을 `.polaris/usage.jsonl`에서
집계할 `pv stats` 명령을 제공해, 우리 숫자를 신뢰하지 않고도 자기
숫자를 볼 수 있습니다.

<!-- pv-intents: REQ-PV-005, REQ-PV-014, API-PV-VALIDATE, API-PV-HEALTH, API-PV-DIFF, API-PV-DIAGRAM, API-PV-EXPORT-ALL -->

## Out of scope (명시적)

이건 결정이지 미래의 버그가 아닙니다:

- **외부 SaaS 통합** — Notion, Confluence, Jira, Linear, Aha,
  Productboard. PV는 어떤 API에도 손을 뻗지 않습니다. 그 시스템에
  사는 PRD는 먼저 Markdown으로 export해서 git에 commit해야 합니다.
- **비-Markdown PRD 포맷** — HWP, docx, PDF, Google Docs. 같은
  이야기: 외부에서 변환하고 Markdown을 commit.
- **코드에서 PRD 자동 생성** — 동어반복을 만듭니다 ("이 시스템은 로그인
  엔드포인트를 가진다"). PRD는 *forward-looking* 이며, 기존 코드의
  archaeology는 Intent 노드의 description에 들어갑니다.
- **PRD 작성 UX** — 에디터 없음, 옵션 템플릿이 emit하는 것 외의
  스캐폴딩 없음. 팀은 자기 PRD 작성 흐름을 그대로 유지합니다.
- **PRD 리뷰 워크플로** — 코멘트, approver, sign-off, lifecycle gate.
  GitHub PR이 git-tracked Markdown에 대해 이미 제공합니다.
- **PV 안의 LLM** — API 키 관리 없음, 모델 선택 없음, 벤더 lock-in
  없음. PV는 프롬프트를 emit하고; 사용자 에이전트가 실행합니다.
- **Cross-PRD 중복/충돌 검출** — Layer 3의 섹션별 프롬프트를 넘어,
  PV는 PRD 사이의 관계를 모델링하지 않습니다.
- **Multi-repo 의도 통합** — repo 당 `.polaris/graph.json` 하나.
  Cross-repo 의도는 이 도구가 풀려고 하지 않는 조직적 문제입니다.

<!-- pv-intents: REQ-PV-016 -->

## Open questions

현재 출시 시점에서 미해결. 답은 *지금 추측* 이 아니라 실제 도입을
관찰해서 나옵니다.

- **PRD 레이어 Phase 2** — `pv prd template`, `pv prd decompose
  --prompt`, `pv prd lint`, `pv prd link`. 모두
  [`docs/PRD-DESIGN.md`](../PRD-DESIGN.md)에 설계되어 있지만, Phase 1로
  부족하다는 증거가 있을 때만 출시.
- **Multi-file PRD (도입 gradient의 Level 5)** — 복잡도를 감수할
  만한가? 매우 큰 PRD를 가진 팀의 실제 수요 vs 이론적 스케일링 우려.
- **`pv review --prompt`의 huge PR 비용.** 프롬프트 크기가 diff 크기 +
  linked 노드 + PRD 섹션 수에 비례. 50+ file PR에서 50K-200K 토큰
  도달 가능. chunked-review 아키텍처 (per-section prompts)가 huge
  codebase의 답이지만 미구현.
- **`pv changed` 자동화.** 매 PR에서 `pv changed`를 자동 실행하고
  결과를 코멘트로 게시하는 GitHub Action이 자연스러운 다음 단계지만
  미구현.
- **Health metric 임계값** — `pv health`는 raw 숫자를 보고합니다.
  결국 그래프가 *"너무 sparse"* 또는 *"너무 dense"* 일 때 경고해야
  하는가? 현재 입장: 해석은 사용자에게 위임.

<!-- pv-intents: API-PV-RENAME, API-PV-HEALTH -->

## Roadmap

계획되었지만 일정이 정해지지 않은 것:

- **PRD 레이어 Phase 2** — `template`, `decompose --prompt`, `lint`.
  달력 날짜가 아닌 도입 신호 (요청하는 issue) 가 트리거.
- **`pv changed`용 GitHub Action** — 매 PR에서 구조 drift gate를
  자동화, 결과를 코멘트 봇으로.
- **Huge PR을 위한 chunked `pv review`** — 어떤 모델의 working window
  에도 편하게 들어가는 per-section 프롬프트, 한 보고로 집계.
- **Multi-file PRD** — Phase 2의 `decompose`가 한 파일이 너무 거친
  패턴을 드러내면 자연스러운 확장.
- **에디터 통합** — Intent ID를 `spec/<id>.md` 링크로 highlight하는
  VS Code 확장. core 아님; 별도 패키지가 될 것.

의도적으로 *roadmap에 없는* 것:

- PV의 web-hosted 버전. git-native가 핵심이라.
- SaaS 제품. PV는 MIT이고 npm으로 배포; 상업적 derivative는 다른
  사람의 프로젝트이지 이게 아님.

## 이 PRD가 존재하는 이유

이 문서는 anchor입니다: scope creep이 어떤 feature를 유혹할 때,
컨트리뷰터가 *"X는 PV의 관심사인가?"* 를 물을 때, 메인테이너가 이
시점에서 6개월 + 10번의 대화 떨어져 있을 때 — 이걸 읽으세요. Intent
그래프는 *아키텍처*를 운반하고; 이 PRD는 *thesis*를 운반합니다.
