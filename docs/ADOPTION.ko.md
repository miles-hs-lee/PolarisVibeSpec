# Polaris Vibe Spec 도입 가이드

실제 코드베이스에 *의도 레이어*를 더하는 실용 가이드: requirements, APIs, workflows, entities를 손으로 작성한 그래프와 코드 매핑. 그래프는 살아있는 architecture 기록 (사람은 `spec/` 읽고, CI는 drift 잡음); AI 코딩 에이전트 (Claude Code, Codex, Cursor, custom agents)에 라우팅 컨텍스트도 제공.

> English version: [ADOPTION.en.md](ADOPTION.en.md). 프로젝트의 valueprop과 더 넓은 landscape에서의 위치는 [POSITIONING.md](POSITIONING.md).

## 우리 repo에 PV가 도움이 될까?

PV는 세 가지 종류의 가치를 제공합니다. 정직한 순서 — 사용자가 가장 먼저 혜택 보는 것부터:

1. **Documentation** (보편적): `pv export-all`이 노드당 `spec/<id>.md` + index 생성. PR diff가 그래프 변경을 사람-읽기 형태로 보여줌. `pv validate`가 drift (orphan 소스, dangling relation) 잡음. `pv promote`가 reviewer의 markdown prose 편집을 JSON으로 round-trip. **이 가치는 AI agent를 쓰든 어떤 agent를 쓰든 무관하게 적용** — 그래프가 architectural 기록이고, PV가 그걸 유지.

2. **Framing** (적용 가능 시): `.polaris/graph.json` + repo가 구조화된 architecture metadata 있다고 알리는 minimal CLAUDE.md가 agent를 덜 defensive하게 만듦. bench-002 측정: PV-positive task shape에 cost 17-28%, tool 44-47% 절감 (Sonnet, 37-파일 fixture, N=2). agent가 `pv ask` 부르든 안 부르든 발생. 단 bench-004에서 task-dependent 확인 — filename으로 자명한 task는 큰 fixture에서도 agent가 이미 효율적이라 PV 무용.

3. **Routing tools** (cross-domain hidden link): `pv ask`가 intent 분류, `pv impact`가 focused 파일 집합 반환. bench-005에서 그래프에만 존재하는 connection (cancellation → analytics + notification) 있는 task에 -53% tools / -15% cost 측정. Filename으로 자명한 task에선 강제 PV 호출은 overhead — `pv ask` classifier가 그런 케이스를 grep으로 자동 라우팅.

bench-002의 task-shape 표:

| 변경 유형 | bench-002 결과 |
|---|---|
| 한 도메인 내 scoped feature (필드 추가, 새 endpoint) | **−47% tools, −17% cost** |
| Cross-domain 변경 (Order가 Billing 호출 등) | **−44% tools, −28% cost** |
| 순수 rename (`fooBar` → `foo_bar`) | classifier가 grep으로 라우팅; baseline 수준 |
| 작은 repo (소스 <10개) — 모든 task | PV 오버헤드가 절감보다 큼 |

**결론**: 소스 ~30개 이상 + 도메인 경계 명확한 repo부터 PV가 의미 있어요 — 단 그 scale에서 지배적 메커니즘은 *routing tool*이 아닌 *framing*. 둘 다 진짜 가치; 어느 쪽인지만 명확히 합시다.

## 설치

PV는 작은 TypeScript CLI입니다. 소스에서 빌드:

```bash
git clone https://github.com/miles-hs-lee/PolarisVibeSpec.git
cd PolarisVibeSpec
npm install && npm run build
npm link        # `pv`를 글로벌 PATH에 노출
```

또는 절대경로로: `node /path/to/PolarisVibeSpec/dist/cli.js …`.

## 1단계 — 그래프 스케치 (1회성 비용)

가장 빠른 시작 방법은 `pv bootstrap`:

```bash
pv bootstrap                 # 기본은 src/ 스캔
pv bootstrap --root packages # 또는 코드가 있는 곳
```

`.polaris/graph.bootstrap.json` + `.polaris/codemap.bootstrap.json`로 출력 (실제 그래프와 별도 — 절대 덮어쓰지 않음). 각 제안 노드에 `confidence`와 `reason`이 붙어 있습니다. 일반적인 30-40 파일 도메인 분할 (auth/billing/orders 등)에서 수작업의 ~80% 커버.

**Agent에 위임하는 더 빠른 경로**: `--prompt`를 추가하면 의미적 정제를 코딩 에이전트(Claude Code, Codex 등)에 넘깁니다. PV는 휴리스틱 draft를 쓴 뒤 schema + draft + step-by-step task가 담긴 구조화된 prompt를 출력. Agent가 실제 파일을 읽고, description을 다듬고, import에서 관계를 추론하고, 최종 `graph.json`까지 씁니다.

```bash
pv bootstrap --prompt
# agent에 파이프하거나 출력된 prompt 붙여넣기
```

그 다음 **큐레이션** (--prompt로 끝냈으면 건너뛰어도 됨):

1. `graph.bootstrap.json` 열고 title 다듬기, 자동 description을 *실제 의도*로 교체.
2. **REQ 노드 추가** — bootstrap은 의도적으로 요구사항을 제안 안 함 (사용자 머릿속에 있지 파일 트리에 없음).
3. **관계 추가**: API → REQ로 `implements`, 서로 호출하는 모듈 간 `uses`.
4. `codemap.bootstrap.json` 열고 같은 노드로 합쳐야 하는 항목 통합 (예: repository 파일을 그 엔티티 노드에 흡수).
5. 만족하면: `mv .polaris/graph.bootstrap.json .polaris/graph.json` (codemap도).
6. `pv validate` — `orphan_source` warning이 빠진 곳을 정확히 짚어줌.

bootstrap이 우리 repo에 안 맞으면 (src/ 없음, 비정형 레이아웃, 또는 완전 수동 통제 원할 때) 건너뛰고 `.polaris/graph.json`을 직접 작성하세요. 모든 걸 모델링하려 하지 말고, 변경이 잦은 영역 10~20 노드부터 시작.

최소 예시 (auth 도메인):

```json
{
  "version": 1,
  "nodes": {
    "REQ-AUTH-001": {
      "id": "REQ-AUTH-001",
      "type": "requirement",
      "domain": "AUTH",
      "title": "사용자가 이메일+비밀번호로 로그인",
      "description": "...",
      "tags": ["auth", "login"],
      "relations": [],
      "createdAt": "2026-05-03T00:00:00.000Z"
    },
    "ENT-AUTH-USER": { "id": "ENT-AUTH-USER", "type": "entity", "domain": "AUTH", "title": "User 레코드", "description": "id, email, password_hash, created_at", "tags": ["auth"], "relations": [], "createdAt": "..." },
    "API-AUTH-LOGIN": {
      "id": "API-AUTH-LOGIN", "type": "api", "domain": "AUTH",
      "title": "POST /auth/login", "description": "...", "tags": ["auth"],
      "relations": [
        { "type": "implements", "target": "REQ-AUTH-001" },
        { "type": "uses", "target": "ENT-AUTH-USER" }
      ],
      "createdAt": "..."
    }
  }
}
```

관계 의미 — `pv impact` 동작의 핵심:

| 관계 | 의미 | impact-of(N) 시 traverse 방향 |
|---|---|---|
| `depends_on` | A가 B에 의존 | reverse — B 변경 시 A에 영향 |
| `implements` | A가 요구사항 B의 구현 | reverse — 구현체가 영향 받음 |
| `uses` | A가 B를 호출/사용 | reverse — 호출자가 깨짐 |
| `affects` | A가 명시적으로 B에 영향 | forward |

ID 포맷 권장:
- `REQ-<DOMAIN>-NNN` (숫자 카운터)
- `API-<DOMAIN>-<SLUG>` (예: `API-AUTH-LOGIN`)
- `WF-<DOMAIN>-<SLUG>`
- `ENT-<DOMAIN>-<NAME>`

`pv generate "<의도>"`로 휴리스틱 컴파일러를 통해 노드를 시드하고, JSON을 직접 다듬는 방법도 있습니다. **또는 agent에 위임**:

```bash
pv generate "Add passkey login" --prompt
# schema + 관련 기존 노드가 담긴 prompt 출력; agent가 graph.json 수정
```

이미 존재하지만 description이 빈약/자동생성된 노드의 경우:

```bash
pv enrich <node-id> --prompt
# codemap 파일을 알려주는 prompt 출력; agent가 읽고 의도 수준 prose로 작성
```

이 세 `--prompt` 모드 (`generate`, `bootstrap`, `enrich`)가 PV가 휴리스틱 컴파일러 너머로 확장되는 방법입니다 — PV 안에 API 키나 모델 선택 관리 없이. **Agent가 LLM**입니다.

## 2단계 — 코드맵 구축

`.polaris/codemap.json`은 노드 id → 파일 경로 매핑입니다. `pv impact` 출력 품질이 이 맵에 직결됩니다.

```json
{
  "ENT-AUTH-USER": ["src/auth/user.ts", "src/auth/repository.ts"],
  "API-AUTH-LOGIN": ["src/auth/login.ts", "src/router.ts"]
}
```

점진적으로 빌드하는 것도 가능: 코드 변경할 때마다 `pv add-file <node-id> <path>`.

`pv validate`로 dangling 관계, 중복 id, 그리고 **orphan source files** (codemap에 없는 src/ 파일 — 그래프 stale의 1차 신호)를 잡습니다.

## 3단계 — 에이전트 연결

두 옵션이 있는데, **특별한 이유 없으면 skill을 선택**하세요.

### 옵션 A (권장): Claude Code skill

Skill은 trigger될 때만 로드되어서 매 turn 비용이 없습니다. 번들된 skill 디렉터리를 복사:

```bash
mkdir -p .claude/skills
cp -r /path/to/PolarisVibeSpec/skills/pv .claude/skills/pv
```

Skill의 `description`이 ".polaris/graph.json이 있는 repo에서 코드 변경을 요청받을 때" 매칭되어, agent에게 `pv ask "<intent>"`를 먼저 부르고 `classification.recommendation`을 따르라고 지시합니다.

### 옵션 B: minimal CLAUDE.md

Skill을 안 쓴다면 (또는 사용 중인 agent가 skill을 지원 안 하면), repo 루트에 minimal CLAUDE.md를 추가하세요. **반드시 짧게** — bench-002가 CLAUDE.md 길이 자체가 rename task 비용을 지배함을 보여줬습니다:

```markdown
# Project notes

This repo has a `.polaris/graph.json` describing its architecture. Before
any code change, run `pv ask "<your intent>"` and follow the
`classification.recommendation` field (`use_pv` / `use_grep` / `use_both`).
```

이게 다입니다. 라우팅 테이블이나 상세 지침 추가하지 마세요 — 데이터가 명확히 말합니다: verbose CLAUDE.md는 절감보다 비용이 큽니다.

## 4단계 — 일상 워크플로

```bash
# 모든 코드 변경 전
pv ask "<자연어 의도>"
# → classification.recommendation이 PV 사용/grep/둘 다 중 어느 쪽인지 알려줌

# 노드 id를 이미 알면:
pv impact <id> --files-only

# 새 파일 추가 후:
pv add-file <node-id> <path>

# 그래프 변경 commit 전:
pv export-all     # spec/<id>.md 재생성 (사람이 읽을 view)
pv validate       # 그래프 무결성 체크
```

Feature task의 일반적 흐름:

```bash
$ pv ask "Add last_login_at to User and update on login" --minimal --pretty
{
  "recommendation": "use_pv",
  "reason": "Looks like a scoped feature add — bench-002 showed PV saves -17% cost, -47% tools.",
  "root": "ENT-AUTH-USER",
  "coverage": "broad",
  "files": ["src/auth/user.ts", "src/auth/login.ts", "src/auth/repository.ts"]
}
```

Agent는 위 3개 파일만 읽고 그 안에서만 수정.

Rename task의 흐름:

```bash
$ pv ask "Rename passwordHash to password_hash" --minimal --pretty
{
  "recommendation": "use_grep",
  "reason": "Looks like a rename or pattern substitution — PV adds 44–65% overhead vs grep.",
  ...
  "files": []
}
```

Agent는 PV를 완전히 건너뛰고 `grep -rn passwordHash`로.

## Spec markdown을 수기로 편집하기

`spec/<id>.md`는 `pv export-all`로 자동 생성되지만, 사람이 (또는 PR 리뷰어가) 직접 markdown에서 typo를 고치거나 description을 다듬고 싶은 경우가 많습니다. `pv promote`가 그 round-trip을 안전하게 만듭니다:

```bash
# spec/REQ-AUTH-001.md를 수기 편집 (typo, 더 좋은 description, 새 tag)
pv promote --dry-run    # 어떤 변경이 적용될지 미리보기
pv promote              # prose 변경 (title / tags / description)을 graph.json에 반영
```

`pv promote`는 **prose** 편집만 받아들입니다. id / type / domain / createdAt / outgoing relations 같은 구조적 필드를 markdown에서 변경하면, 파일은 그 이유와 함께 reject되고 어떤 도구를 써야 하는지 안내됩니다 (`pv link`로 관계 변경, `pv generate "<intent>" --prompt`로 노드 추가, 또는 graph.json 직접 편집). 이게 referential integrity를 보호하면서도 prose 부분은 자유롭게 live-edit하게 해줍니다.

Round-trip은 idempotent: `pv export-all` → 편집 없음 → `pv promote`는 모든 노드를 `unchanged`로 보고.

번들된 skill이 "spec markdown 편집했어 — 반영해줘" 같은 요청을 인식해서 agent를 자동으로 `pv promote`로 라우팅합니다.

## 알려진 한계

PV가 *우리 repo*에 ROI 줄지 결정할 때 다음 실패 모드를 인지해야 합니다:

- **Stale codemap → 잘못된 파일.** 새 파일 만든 뒤 `pv add-file` 잊으면 `pv ask`가 자신만만하게 *불완전한* 파일 집합 반환. agent는 그 집합만 편집하고 새 파일은 누락. 완화: `pv validate`가 `orphan_source` 잡음, CI에서 매 PR validate, `pv stats`가 read-set ratio 추이 표시 (갑자기 튀면 drift 신호).
- **Stale relation → 신뢰 inflation.** `coverage: narrow` 추천은 "이 집합 믿어"라고 말함. 그래프가 *좁게 틀렸으면* (있어야 할 관계가 누락) agent가 부분 fix만 만들고 테스트는 통과하지만 버그는 남음. 자동 검출 없음 — 주기적 그래프 리뷰만 완화책.
- **유지보수 비용.** 새 파일마다 `pv add-file`, 그래프 수정마다 `pv export-all`. PR당 ~30초 추가. 작은 PR 많이 내는 팀은 per-task 절감을 잠식할 수 있음; 그래프 안 fresh하게 두는 비용이 더 크지만, 어쨌든 세금.
- **Per-turn 비가시성.** 단일 PV-routed task는 fit하면 cost/wall ~17-28% 절감. 사용자는 매 task에선 *느끼지 못함* — 누적 (50-100 task) 되어야 명확. `pv stats`가 누적을 보여주는 도구.

`experiments/bench-003/`이 stale 상태 비용을 직접 측정 — "완전히 outdated된 그래프" 시나리오 포함.

## 5단계 — 유지보수

- 소스 파일 추가/이동 시 `pv add-file` / `pv rm-file` (또는 주기적으로 `pv validate` — orphan warning이 뭘 고쳐야 할지 알려줌).
- `.polaris/graph.json` 수정 후 `pv export-all`로 `spec/` 재생성. 둘 다 commit — PR diff에 그래프 변경이 사람이 읽을 수 있는 형태로 보입니다.
- CI 체크 한 줄: `pv validate && pv export-all && git diff --quiet spec/`. spec stale이나 그래프 drift 시 빌드 실패.

## 피해야 할 것

- 자잘한 파일 (helpers, constants)을 그래프에 모델링하지 마세요. 변경 잦거나 cross-cutting한 것만.
- 코드 구조에서 자동 생성하지 마세요 — 가치는 *의도* 레이어이지 파일 트리의 재현이 아닙니다.
- 긴 CLAUDE.md 쓰지 마세요. 데이터가 명확합니다: 짧은 게 이깁니다.

## 참고

- 실측 데이터: [`experiments/README.md`](../experiments/README.md)
- PV 자체의 자동 생성 spec: [`spec/`](../spec/)
- 소스 그래프: [`.polaris/graph.json`](../.polaris/graph.json)
