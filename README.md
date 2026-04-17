# 풋살 키퍼·휴식 배정 웹페이지

6~7명이 참가하는 풋살 경기(2시간, 15분 × 8쿼터)에서 **키퍼·휴식**을 공평하게 자동 배정해주는 정적 웹페이지입니다.

## 특징
- **엄격 연속 금지**: 같은 사람이 연속 쿼터에 키퍼·휴식 배정 안 됨 (`GK→GK`, `GK→Rest`, `Rest→GK`, `Rest→Rest` 모두 금지)
- **공평성 보장**: 인당 키퍼·휴식 횟수 편차 ≤ 1
- **12명 멤버 DB**: `members.json`에 동호회 정규 멤버를 등록해두고, 매주 체크박스로 참가자 선택
- **중간 이탈/늦참 지원**: 참가자별 `Q시작~Q끝` 지정 가능. 조기 퇴장자는 필드 위주 배치(GK·휴식 최소화), 나머지 인원이 더 자주 섬
- **카톡 한 번에 복사**: 결과 텍스트 포맷을 클립보드에 복사해 단톡방에 바로 붙여넣기
- 서버·DB·로그인 없음. 순수 HTML/JS/CSS.

## 파일 구성
```
index.html           메인 — 참가자 선택 + 배정표 생성 + 복사
members-admin.html   멤버 추가/수정/삭제 + members.json 복사
members.json         멤버 DB (레포에 커밋)
rotation.js          배정 알고리즘 + 검증
styles.css           모바일 우선 스타일
tests.html           4케이스 검증 (개발자용)
```

## 로컬에서 열기
```
cd 07_Exican
python -m http.server 8000
# 브라우저에서 http://localhost:8000
```
`members.json` 은 `fetch` 로 불러오므로 파일을 직접 더블클릭하면 CORS로 실패할 수 있습니다. 반드시 HTTP 서버로 열어주세요.

## 배포 (GitHub Pages, 무료)
1. GitHub에 Public 레포 생성 (예: `futsal-rotation`)
2. 이 디렉토리 내용을 레포 루트에 push
3. GitHub 레포 → `Settings → Pages → Build and deployment → Source: Deploy from a branch → main / (root)` 선택
4. 수 분 후 `https://<username>.github.io/futsal-rotation/` 에서 접속 가능
5. 이 URL을 동호회 단톡방 공지로 고정

## 멤버 목록 업데이트 (운영자 전용)
1. `members-admin.html` 에서 멤버 추가/수정/삭제
2. `[이 브라우저에 임시 저장]` 으로 즉시 본인 브라우저에 반영 확인
3. `[📋 JSON 복사]` 클릭
4. 레포 `members.json` 을 복사한 내용으로 덮어쓰기
5. `git add members.json && git commit -m "멤버 업데이트" && git push`
6. 수 분 후 전 회원에게 반영됨

## 배정 규칙 (참고)
| 참가자 | 포맷 | 필드(키퍼 포함) | 키퍼 | 휴식 |
|--------|------|------------------|------|------|
| 6명 | 5v5 | 5 | 1 | 1 |
| 6명 | 6v6 | 6 | 1 | 0 |
| 7명 | 5v5 | 5 | 1 | 2 |
| 7명 | 6v6 | 6 | 1 | 1 |

8쿼터까지 고정 배정, 이후 시간은 자율 진행.

## 검증 (개발자용)
전수 자동 테스트 — 정적 테이블 4케이스 + 동적 시나리오 5케이스 + 에러 케이스 + 카톡 포맷 검증까지 한 방에:
```
node test.js
```
PASS/FAIL이 항목별로 찍히고, 실패 시 exit code 1. 코드 수정 후 이 명령 하나로 회귀 확인 가능.

브라우저 UI(체크박스 토글, 이탈자 드롭다운, 복사 버튼 등)는 http://localhost:8765/index.html 에서 수동 확인.
