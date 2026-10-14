# [008] 배정 엔진: out 쿼터 간격 균등화 + 테스트 보강

- 브랜치: `codex/008-rotation-spacing`
- 의존: 001 (main에 머지됨). 투표 연동·history 저장은 이 발주서에서 제외 (007/010에서 진행)
- 예상 규모: M

## 배경
현재 엔진(`js/rotation.js`)은 쿼터별 그리디 선택 + 2000회 시드 재시도로 "연속 out 금지"와 "횟수 공평"을 맞춥니다.
팀의 불만: 한 사람의 out(키퍼·휴식) 쿼터가 Q2·Q4처럼 몰리거나, 초반/후반에 쏠립니다. 각자의 out 쿼터가 8쿼터에
고르게 퍼지도록 점수 항과 타이브레이크를 추가합니다. 설계 근거와 수치는 `docs/PLAN.md` §5. 아키텍처(재시도 방식)는 유지합니다.

## 목표
- 같은 입력에서 횟수 공평성은 유지한 채, 사람별 out 쿼터 간격이 고르게 분포한다.
- 간격 지표를 계산·검증·경고하는 함수가 export 되고 테스트로 고정된다.

## 변경 파일
- `js/rotation.js`
- `test/rotation.test.js` — 케이스 추가 (기존 91개 어서션은 그대로 유지)
- `tests.html` — 기존 실패 1건 수정: 기대 문자열 `A(Q1~4)` → `A(Q1~Q4)` (테스트 쪽 오타). 그 외 변경 없음
- `README.md` — "배정 규칙" 절에 간격 균등화 설명 3~4줄

## 변경 금지
- `rotation.html`, `members.json`, 그 외 파일

## 상세 요구사항

### 1. 간격 지표 (export: `playerSpacing`, `spacingPenalty`)
- `playerSpacing(schedule, player, range)` → 숫자. `range = { start, end }` (없으면 `{1, TOTAL_QUARTERS}`).
  - `L = end − start + 1`. out 쿼터 = 해당 선수가 `gk`이거나 `rest`에 포함된 쿼터 번호를 오름차순으로 `q1 < … < qk`.
  - `k = 0` → 0.
  - 플레이 구간 길이(k+1개): `q1 − start`, `q(i+1) − q(i) − 1` (i < k), `end − qk`. 합은 항상 `L − k`.
  - `ideal = (L − k) / (k + 1)`. `ideal === 0` → 0.
  - 반환 `mean((run − ideal)^2) / ideal^2`.
- `spacingPenalty(schedule, players, quartersMap)` → `k ≥ 1`인 선수들의 `playerSpacing` 평균. 해당 선수가 없으면 0.
- 기준값(8쿼터 풀타임, 테스트로 고정): out {3,6} → 0, {2,6} → 0.1667 (±1e-9), {2,4} → 0.5, {1,6} → 0.6667, {1,8} → 2.0, {1} → 1.0, {4} → 0.0204 (= (1/7)² 평균… 정확값은 구현 후 계산해 테스트에 소수 6자리로 고정), 부분참가 `{start:3,end:8}` out {3,6} → 0.5.

### 2. `scheduleScore` 확장
- 기존: `excessViolations*10000 + outSpread*1000 + gkSpread*100 + restSpread*100 (+ strict 불가 시 violations)`.
- 변경: `+ spacingPenalty(schedule, players, quartersMap) * SPACING_WEIGHT`, `const SPACING_WEIGHT = 200` (파일 상단 상수, export).
- 우선순위 보존: 연속 금지 > out 횟수 공평(×1000) > 역할 공평(×100) ≈ 간격(×200). 횟수를 희생해 간격을 얻으면 안 됨.

### 3. 그리디 타이브레이크 (`buildScheduleDynamic`)
- `lastOut[player]` 를 `range.start − 1`로 초기화하고 out으로 선택될 때마다 갱신.
- `outSort`에서 전략별 횟수 키 비교가 모두 동률일 때, `salts` 비교 **직전**에 `since = quarter − lastOut[p]` 가 큰 쪽(오래 뛴 사람)을 우선.
- 전략 추가: `strategy = seed % 4`, 새 전략 3은 `since` 내림차순을 1차 키로, 그다음 out/gk/rest 순.

### 4. `validateSchedule` 경고
- 선수별 `playerSpacing > 1.0` 이면 `warnings`에 `out 간격 편중: ${player} (Q2,Q4)` 형식 추가 (out 쿼터 나열).

### 5. 결정성
- `Math.random` 사용 금지. 같은 입력 → 같은 출력.

### 6. 테스트 추가 (`test/rotation.test.js`)
- `[spacing-unit]`: 위 §1 기준값을 수제 스케줄 객체(`{quarter, gk, rest, field}` 배열)로 검증. `k=0` → 0, 전 쿼터 out → 0 (NaN 금지), `L=1` → 0.
- `[spacing] N명/포맷` — strict 가능한 기본 케이스(6·7·8명/5v5, 7~11명/6v6, 9~11명/5v5; `strictPossible`은 테스트에서 `maxOutPerQ <= fieldSize − 1`로 계산):
  - `spacingPenalty ≤ 0.4`
  - k ≥ 2인 모든 선수: 인접 out 간 간격(q(i+1) − q(i)) ≤ 5
  - k ≥ 2인 모든 선수: out이 전부 ≤ Q4 이거나 전부 ≥ Q5 인 경우가 없음
  - 개인 `playerSpacing ≤ 0.7`
- `[spacing] 12명/5v5, 12명/6v6` (strict 불가): `spacingPenalty ≤ 0.8` 만.
- `[spacing-dynamic]`: 기존 dynamic 5케이스 재사용 — 풀타이머 `playerSpacing ≤ 0.7`, 부분참가자 값이 유한하고 ≥ 0, 부분참가자의 out 쿼터가 모두 `[start, end]` 안.
- `[determinism]`: 같은 입력으로 `buildSchedule` 2회 → `JSON.stringify` 동일 (기본 1케이스 + dynamic 1케이스).
- **보정 규칙**: 구현 후 한 번 실행해 관측 최대값을 보고, 임계값이 너무 빡빡하면 관측값의 1.5배로 조정하되 PR 본문에 관측값과 조정 근거를 적는다. 기존 `GK spread ≤ 2` / `Rest spread ≤ 2` / `normalized out spread ≤ 0.26`이 깨지면 테스트를 늦추지 말고 `SPACING_WEIGHT`를 100으로 낮춰 재시도한다.

## 수용 기준
- [ ] `npm test` 통과, 기존 91개 어서션 변경 없음(라벨·임계값 동일), 신규 spacing/determinism 케이스 포함
- [ ] `playerSpacing`, `spacingPenalty`, `SPACING_WEIGHT`가 export 되고 브라우저 전역으로도 노출된다(`rotation.html`에서 `typeof spacingPenalty === "function"`)
- [ ] `tests.html`이 브라우저에서 `PASS 92 · FAIL 0`
- [ ] `rotation.html`에서 7명/5v5 생성 시 결과표가 나오고 경고 영역에 "간격 편중"이 없다(수동, 2~3회 다시 섞기 포함)
- [ ] PR 본문에 7명/5v5·8명/6v6의 변경 전/후 배정표 1개씩과 spacingPenalty 값을 첨부

## 테스트 방법
- 자동: `npm test`
- 수동: `python -m http.server 8765` → `/rotation.html`, `/tests.html`

## 참고
- `js/rotation.js`: `buildSchedule`, `buildScheduleDynamic`, `scheduleScore`, `validateSchedule`, `getQuarterRange`
- 기존 테스트의 `spread`, `countSpread`, `normalizedOutSpread` 헬퍼 재사용
