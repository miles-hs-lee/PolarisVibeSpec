# Polaris Vibe Spec 도입 가이드

실제 코드베이스를 PV-aware repo로 만들어서 AI 코딩 에이전트(Claude Code, Codex 등)가 효율적으로 다룰 수 있게 하는 실용 가이드입니다.

> English version: [ADOPTION.en.md](ADOPTION.en.md).

## 우리 repo에 PV가 도움이 될까?

PV는 어떤 변경엔 비용, 어떤 변경엔 절감입니다. `experiments/bench-002` 실측치 (Sonnet, 조건당 N=2):

| 변경 유형 | PV 효과 |
|---|---|
| 한 도메인 내 scoped feature (필드 추가, 새 endpoint) | **−47% tools, −17% cost** |
| Cross-domain 변경 (Order가 Billing 호출 등) | **−44% tools, −28% cost** |
| 순수 rename (`fooBar` → `foo_bar`) — grep으로 충분 | **+44% tools, +65% cost** |
| 작은 repo (소스 <10개) — 모든 task | PV 오버헤드가 절감보다 큼 |

`pv ask` 명령이 이 라우팅을 한 번에 처리해서, agent가 PV 비용을 *도움될 때만* 지불하게 합니다. **결론**: 소스 ~30개 이상 + 도메인 경계 명확한 repo부터 PV가 의미 있어요.

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
