# PRD 레이어 — 디자인

> English version: [PRD-DESIGN.md](PRD-DESIGN.md).

이 문서는 *PRD 레이어* — PV의 옵트인 확장 — 의 설계를 기록합니다.
사람이 작성한 Product Requirements 문서와 Intent 그래프 사이의 drift를
검출하는 기능입니다.

이 문서는 **디자인 문서** 이지 사용 가이드가 아닙니다. 도입 가이드는
[ADOPTION.ko.md](ADOPTION.ko.md) 참고.

## 범위

**범위 안:** 코드와 같은 git 저장소에 commit된 Markdown 파일 형태의
PRD. PV가 그것을 읽고, Intent 노드로의 링크를 추출하고, 불일치를
보고합니다.

**명시적으로 범위 밖:**

- Notion, Confluence, Google Docs, 기타 SaaS API 통합
- HWP, docx, PDF 등 비-Markdown 포맷 파싱
- 기존 소스코드에서 PRD 자동 생성
- PRD 작성 UX 소유 ("PV 전용 PRD 에디터" 같은 것)
- PRD 리뷰/승인 워크플로 관리 (이건 GitHub PR의 일)

PRD가 Notion이나 HWP에 있다면, 먼저 Markdown으로 변환해서 git에
commit해야 합니다. PV는 거기서부터 시작합니다.

## 왜 옵트인 PRD 레이어인가

PV의 핵심 가치 (Intent 그래프 + codemap + 검증) 는 PRD 없이도 작동합니다.
PRD 레이어는 *이미 PRD를 작성하는* 팀이 한 가지 특정 실패 모드를
잡고 싶을 때를 위한 것:

> PRD는 우리가 X를 만든다고 적었는데, 코드베이스는 X를 모델링하지
> 않음 — 또는 그 반대.

작은 팀에서는 사람의 기억으로 잡힙니다. 기억이 작동을 멈추는 순간 —
신입 입사, 시간 경과, AI agent의 코드 편집 — 이 격차는 누가 회귀를
발견할 때까지 *보이지 않습니다*. PRD 레이어는 그 격차를 *PR 시점과
CI 시점에* 보이게 합니다.

## 두 가지 시나리오

### Scenario A: 기존 코드베이스, PRD 없음

**권장: 기존 코드에서 PRD를 retrofit하지 마세요.** PRD는 *앞으로
무엇을 만들 것인가* 에 대한 forward-looking 문서입니다. 완성된 코드에서
PRD를 생성하면 동어반복이 됩니다 ("이 시스템은 로그인 엔드포인트를
가진다" — 알고 있어요).

기존 코드의 archaeology — *왜 이렇게 짰는가?* — 는 가짜 PRD가 아니라
Intent 노드의 `description` 필드에 들어가야 합니다.
`pv bootstrap --prompt` 로 `src/` 에서 Intent 그래프를 scaffold하고,
PRD는 *새로운 이니셔티브* 부터 작성하세요.

### Scenario B: git에 Markdown 형태로 PRD가 이미 있음

이게 지원하는 도입 경로입니다. 아래 "도입 단계" 참고.

## 아키텍처

PRD 레이어는 작습니다. 추가하는 것:

- 디렉티브 컨벤션 (`<!-- pv-intents: ... -->` HTML 주석)
- 두 개의 새 모듈 (`src/prd/parse.ts`, `src/prd/check.ts`)
- 한 개의 새 명령 (`pv prd check`)
- 한 개의 옵트인 모드 (`pv prd check --prompt`)

추가하지 **않는** 것:

- 새 source-of-truth 파일 (PRD는 있던 자리에 그대로 둠)
- PV가 소유하는 스키마 (PRD 작성은 사용자 책임)
- `graph.json` 의 새 노드 타입 (PRD는 그래프 *구성원이 아니라*
  외부 bookmark)

## 디렉티브 컨벤션

PRD가 Intent 그래프에 링크하는 세 가지 방법, 우선순위 순:

1. **Frontmatter `intents:`** — 전체 PRD에 대한 글로벌 요약

   ```yaml
   ---
   id: PRD-AUTH-PASSKEY
   title: 패스워드리스 인증
   intents: [REQ-AUTH-001, REQ-AUTH-002, API-AUTH-PASSKEY]
   ---
   ```

2. **섹션 디렉티브** — H2 섹션 단위 링크. `--prompt` 모드가 한
   거대한 프롬프트 대신 *섹션별 focused 프롬프트* 를 emit하게 만듦

   ```markdown
   ## Story: 엔터프라이즈 관리자가 패스키 정책 설정

   ...prose...

   <!-- pv-intents: API-AUTH-CONFIG, REQ-AUTH-003 -->
   <!-- pv-claim: enterprise-admin-config -->
   ```

3. **본문 멘션** — prose 안에서 발견된 ID (정규식 매칭)

   ```markdown
   이 스토리는 [REQ-AUTH-002](../spec/REQ-AUTH-002.md) 를 조직 단위
   강제로 확장한다.
   ```

같은 ID가 여러 출처에 나타나면 frontmatter > 섹션 디렉티브 > 본문
멘션 순으로 우선순위. 이 우선순위 덕에 `pv prd check` 가 각 참조에
대해 가장 권위 있는 출처를 보고할 수 있습니다.

## 3-레이어 검사 모델

### Layer 1: 구조 — `pv prd check`

결정적, LLM-free, CI 친화적. 잡는 것:

- **dangling**: PRD가 graph에 없는 Intent ID를 참조
- **malformed**: PRD가 ID처럼 보이는데 schema에 안 맞는 문자열을
  참조 (예: `REQ-X` — 끝의 번호 없음)
- **orphan PRD** (warning): PRD에 Intent 참조가 *하나도 없음*

이 레이어만으로 표면 drift는 잡힙니다 — 이름이 바뀐 Intent, 삭제된
Intent를 PRD가 여전히 참조, 오타. *의미적* drift는 못 잡습니다.

### Layer 2: 휴리스틱 — `pv prd check --fuzzy` (미래)

표면적 키워드/path 매칭. 현재는 보류. 메모:

- API path 멘션 (`POST /auth/passkey`) 이 어떤 API 노드 title과도
  매치 안 되는 경우 — 이건 Layer 1 의 warning으로 이미 구현됨
- 도메인 키워드 추출은 노이즈 큼 (일반 단어 false positive). 명확한
  수요 보이기 전엔 만들 가치 낮음.

### Layer 3: LLM 보조 — `pv prd check --prompt`

사용자가 자기 코딩 agent (Claude Code, Codex 등) 으로 실행할 수 있는
구조화된 Markdown 프롬프트를 emit. 프롬프트는 LLM에게 다음을 식별하라고
요청:

1. PRD prose의 주장 중 Intent 노드로 표현 안 된 것
2. prose의 주장과 모순되는 Intent 노드
3. 동의어 (PRD는 "패스워드리스", graph는 "패스키")
4. PRD가 참조해야 할 것 같은데 안 하는 Intent 노드

agent는 구조화된 JSON 보고서를 반환. 사용자가 검토 후 행동: `pv generate`
로 노드 추가, 이름 변경, prose 수정 등.

PV는 **직접 LLM을 호출하지 않습니다.** `pv generate --prompt`,
`pv enrich --prompt` 와 같은 패턴. 이유:

- PV가 API 키를 관리할 필요 없음
- 모델 벤더 lock-in 없음
- 사용자가 자기 토큰 비용 부담
- agent가 이미 Read/Edit 도구를 가지고 제안을 적용 가능

## 섹션 단위 분해 — 왜 중요한가

섹션 디렉티브 없이는 `--prompt` 모드가 *전체 PRD + 전체 Intent 그래프*
를 LLM에 보내야 합니다. 이건:

- PRD 크기가 조금만 커져도 token 비용 폭발
- Noisy (대부분의 그래프 노드가 특정 주장과 무관)
- 부정확 (LLM이 무엇이 관련 있는지 직접 추론해야 함)

섹션 디렉티브는 PV가 *섹션당 한 프롬프트* 를 emit하게 합니다. 각 프롬프트
포함 내용:

- 그 섹션의 prose만
- `<!-- pv-intents: ... -->` 에 적힌 Intent 노드들
- 그것들의 1-hop 그래프 이웃 (옵션)
- 그것들의 codemap 파일

섹션 5개 PRD가 *5개 작은 focused 프롬프트* 가 되지 *1개 거대한 unfocused
프롬프트* 가 안 됩니다. 이건 `pv impact` 가 코드에 가치 있는 이유와 동일:
focused subset이 whole-repo scan을 이깁니다.

## 도입 단계 (Onboarding gradient)

각 레벨은 이전의 strict superset. 어디서 멈춰도 됩니다.

| Level | 무엇을 함 | 무엇을 얻음 |
|---|---|---|
| 0 | PRD 레이어 안 씀 | Intent만 사용 — 잘 작동 |
| 1 | 기존 PRD에 `pv prd check` | 본문 멘션 dangling 검사 |
| 2 | frontmatter에 `intents:` 추가 | 명시적 PRD 단위 링크 |
| 3 | 섹션마다 `<!-- pv-intents: -->` 추가 | 섹션별 보고 + focused `--prompt` |
| 4 | `--prompt` 주기적 사용 | LLM 보조 의미 drift 검출 |
| 5 | 멀티파일 PRD (claim 1개당 파일 1개) | 파일별 git history, 팀 협업 친화 |

대부분 팀은 Level 3 까지가 적절. Level 5 는 매우 큰 PRD 에서.

## 자동 탐색

`pv prd check` 가 path 인자 없이 호출되면 다음 순서로 PRD를 찾습니다:

1. `.polaris/prd-sources.json` — 명시적 설정 (옵션)
2. `docs/prd/` — 재귀 `**/*.md`
3. `prd/` — 재귀 `**/*.md`
4. `prds/` — 재귀 `**/*.md`

다 없고 path 인자도 없으면 명확한 메시지로 종료: "no PRDs found, pass
paths or create a `docs/prd/` directory".

`prd-sources.json` 스키마:

```json
{
  "version": 1,
  "files": ["docs/specs/passkey.md"],
  "directories": ["docs/prd", "internal/prd"]
}
```

## PRD-Intent 관계 — 계약이 아니라 bookmark

이게 핵심 디자인 결정. PRD와 Intent 노드의 관계는 **단방향 + 가벼움**:

- PRD는 Intent 노드를 참조 (forward link)
- Intent 노드는 PRD를 모름 (sovereign)
- 새 Intent 추가 시 PRD를 갱신할 필요 없음
- PRD 참조 없는 Intent 는 drift *아님*

이건 PV의 기존 레이어 패턴과 일치: codemap이 graph 참조, graph는
codemap 모름; spec/은 graph에서 derived, graph는 spec/ 모름. PRD는
graph 참조, graph는 PRD 모름.

옵트인 `--strict` 플래그가 default를 뒤집음: 검사한 PRD가 참조 안 하는
Intent 노드를 보고. 대부분 팀은 *끄고* 사용해야 함 — 많은 Intent
(인프라성 entity, 버그픽스 REQ) 가 정당하게 product PRD 출처가 없음.

## PV가 *하지 않는* 일 (명시적 non-goal)

- ❌ PRD 리뷰 워크플로 (코멘트, approver, sign-off) 관리
- ❌ PRD를 호스팅 웹사이트나 위키로 렌더링
- ❌ frontmatter 외 PRD lifecycle 메타데이터 추적
- ❌ Intent 노드 변경 시 PRD prose 자동 갱신
- ❌ PRD 간 중복/충돌 검출
- ❌ PRD 내용 생성·추천
- ❌ GUI 제공

## 도구 우선순위

| 명령 | 우선순위 | Phase |
|---|---|---|
| `pv prd check [path...]` | P0 | 1 |
| `pv prd check --prompt` | P0 | 1 |
| `pv prd template <slug>` | P1 | 2 |
| `pv prd decompose --prompt` | P1 | 2 |
| `pv prd lint` | P2 | 3 |
| `pv prd link <file> --section ... --intent ...` | P2 | 3 |

Phase 1 (P0) 가 먼저 출시. 각 phase는 독립 출시 가능.

## 출력 형식

`pv prd check` 는 default JSON (PV 컨벤션), `--pretty` 로 사람-친화 형식.

```json
{
  "ok": false,
  "summary": {
    "files_checked": 2,
    "files_with_drift": 1,
    "total_references": 7,
    "dangling_references": 1,
    "orphan_prds": 0
  },
  "files": [
    {
      "path": "docs/prd/passkey.md",
      "ok": false,
      "references": [
        { "id": "REQ-AUTH-002", "source": "frontmatter", "status": "ok" },
        { "id": "REQ-AUTH-007", "source": "body", "line": 42, "status": "dangling" }
      ],
      "warnings": []
    }
  ]
}
```

종료 코드:
- `0` — 모든 검사 통과
- `1` — drift 검출 (dangling 참조, 또는 `--strict` orphan Intent)
- `2` — IO/parse 에러

## Phase 1 (P0) — 출시되는 것

- `src/prd/parse.ts` — `parsePrd(md, path) → ParsedPrd`
- `src/prd/check.ts` — `checkPrd(parsed, graph) → CheckResult`
- `src/prd/prompt.ts` — `--prompt` 모드용 `buildPrompt(parsed, graph) → string`
- `src/commands/prdCheck.ts` — orchestration + 자동 탐색 + IO
- `src/cli.ts` — `pv prd check` 서브커맨드 등록
- `test/prd-parse.test.ts`, `test/prd-check.test.ts`,
  `test/prd-prompt.test.ts`

Phase 1에 출시 *안 되는* 것: `template`, `decompose`, `lint`, `link`.
이들은 Phase 2의 수요 보고 후.

## 정직한 한계

이 디자인이 *모든* 의미 있는 drift를 잡진 못합니다:

- Intent ID를 명명하지 않고 *의역만 한* PRD의 누락 개념은 Layer 1
  에서 안 잡힘. `--prompt` 모드가 일부 잡지만 비결정적.
- 섹션 디렉티브는 손으로 적어야 함 (또는 Phase 2의 `decompose --prompt`
  로 생성). 빠뜨린 섹션은 글로벌 frontmatter 컨텍스트로만 검사 — 더
  넓고 덜 focused.
- 자동 탐색은 path 컨벤션 기반. 비표준 위치 사용 팀은 `prd-sources.json`
  이나 명시적 path 필요.
- `--prompt` 결과는 사용자가 돌리는 LLM에 의존. 다른 agent는 다른 보고
  생성. PV는 권위가 아니라 — 사용자가 권위.

이건 의도적 디자인 선택이지 미래의 버그가 아닙니다. 대안 (PV-내부 LLM,
schema-strict PRD 포맷, 모든 자동화) 은 PV의 다른 부분이 피하는 방식으로
단순함을 fragility 와 거래합니다.
