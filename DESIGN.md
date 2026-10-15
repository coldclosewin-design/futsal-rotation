---
name: FC EXICAN 운영 허브
description: 흑연 전광판이 날짜·숫자·상태를 들고, 밝은 바닥 위 간유리 패널이 작업을 받는다.
colors:
  board: "#0f1115"
  board-raised: "#1a1d22"
  board-seam: "#2a2e35"
  board-ink: "#e6e8eb"
  board-muted: "#8a9099"
  ground: "#f3f4f6"
  ground-deep: "#e9ebef"
  panel: "rgba(255, 255, 255, 0.72)"
  panel-home: "rgba(255, 255, 255, 0.78)"
  panel-solid: "#ffffff"
  seam: "#e3e5e9"
  seam-strong: "#c9cdd3"
  ink: "#0f1115"
  ink-raised: "#22262d"
  ink-2: "#3f4650"
  ink-3: "#6b7280"
  ink-4: "#8a9099"
  lit: "#34c76f"
  lit-ink: "#116b38"
  lit-wash: "rgba(52, 199, 111, 0.14)"
  scrim: "rgba(15, 17, 21, 0.45)"
typography:
  display:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif"
    fontSize: "clamp(36px, 10vw, 56px)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.03em"
    fontFeature: "tabular-nums"
  body:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "-0.01em"
    fontFeature: "tabular-nums"
  title:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.55
    letterSpacing: "-0.01em"
  label:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0.06em"
rounded:
  r: "12px"
  bed: "24px"
  dot: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  gutter: "16px"
  gutter-desktop: "32px"
  tap: "44px"
components:
  button-default:
    backgroundColor: "{colors.panel-solid}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.r}"
    padding: "10px 16px"
    height: "44px"
  button-default-hover:
    backgroundColor: "{colors.panel-solid}"
    textColor: "{colors.ink}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel-solid}"
    typography: "{typography.title}"
    rounded: "{rounded.r}"
    padding: "10px 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.ink-raised}"
    textColor: "{colors.panel-solid}"
  button-destructive:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.r}"
    padding: "10px 16px"
    height: "44px"
  input:
    backgroundColor: "{colors.panel-solid}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r}"
    padding: "10px 12px"
    height: "44px"
  chip:
    backgroundColor: "{colors.panel-solid}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.r}"
    padding: "3px 9px"
  chip-lit:
    backgroundColor: "{colors.lit-wash}"
    textColor: "{colors.lit-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.r}"
    padding: "3px 9px"
  chip-closed:
    backgroundColor: "{colors.panel-solid}"
    textColor: "{colors.ink-4}"
    typography: "{typography.label}"
    rounded: "{rounded.r}"
    padding: "3px 9px"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r}"
    padding: "16px"
  board:
    backgroundColor: "{colors.board}"
    textColor: "{colors.board-ink}"
    rounded: "{rounded.r}"
    padding: "14px 16px"
  segment:
    backgroundColor: "{colors.board-raised}"
    textColor: "{colors.board-ink}"
    padding: "10px 12px"
  segment-dim:
    backgroundColor: "{colors.board-raised}"
    textColor: "{colors.board-muted}"
    padding: "10px 12px"
  row:
    backgroundColor: "{colors.panel-home}"
    textColor: "{colors.ink}"
    padding: "12px 16px"
    height: "60px"
  row-action:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel-solid}"
    typography: "{typography.label}"
    rounded: "{rounded.r}"
    padding: "8px 12px"
  tabbar:
    backgroundColor: "{colors.board}"
    textColor: "{colors.board-muted}"
    height: "64px"
  tabbar-item-active:
    backgroundColor: "{colors.board-raised}"
    textColor: "{colors.board-ink}"
    rounded: "{rounded.r}"
  rail:
    backgroundColor: "{colors.board}"
    textColor: "{colors.board-muted}"
    width: "76px"
  toast:
    backgroundColor: "{colors.board}"
    textColor: "{colors.board-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.r}"
    padding: "10px 16px"
  modal:
    backgroundColor: "{colors.panel-solid}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r}"
    padding: "20px"
    width: "380px"
---

# Design System: FC EXICAN 운영 허브

## Overview

**Creative North Star: "구장 전광판"**

경기장 전광판은 날짜·숫자·상태만 들고, 그 외에는 아무것도 말하지 않는다. 이 시스템도 그렇다. 흑연 보드(`board`)가 "이번 주 10/17 토 · D-2 · 투표 진행 중 · 매치 확정"을 한 줄로 들고, 그 아래 밝은 바닥(`ground`) 위에 간유리 패널이 놓여 투표·공유·장부 같은 실제 작업을 받는다. 보드는 읽는 곳, 패널은 누르는 곳이다.

밀도는 휴대폰 한 손 조작 기준이다. 글자 크기는 본문 15 / 라벨 12 / 디스플레이 숫자 하나, 세 단계만 쓰고, 모든 모서리는 12px 하나로 깎는다. 깊이는 그림자가 아니라 1px 헤어라인 이음새와 투명도(간유리)로 만든다. 색은 그레이스케일이고, 강조색 `lit`(#34c76f)는 "바뀐 것·지금 할 일이 있는 것"에만 점등되는 작은 점이다. 버튼은 강조색을 쓰지 않는다. 거부한 기본값: 같은 크기 카드가 아이콘+제목+설명으로 줄지어 선 관리자 대시보드.

페이지 간 공용 셸(탭바·레일·인증 바·모달·토스트)과 홈 표면은 이 시스템으로 완성되어 있다. 투표·매칭·장부·배정표·내 현황·회칙·관리 페이지는 styles.css를 상속하지만 페이지별 섹션은 아직 재구성 전의 과도기 상태다(아래 "Do's and Don'ts" 끝 주석 참조).

**Key Characteristics:**
- 흑연 보드(읽기) + 밝은 바닥 위 간유리 패널(작업)의 두 재질
- 글자 크기 3단계, 표형 숫자(tabular-nums) 전역
- 반경 토큰 하나(12px), 그림자 대신 1px 헤어라인
- 강조색 1개, 점등(8px 점·배지)에만, 버튼에는 절대 없음
- 모션 한 순간: 로드 시 보드 세그먼트가 순서대로 점등

## Colors

흑연 두 톤과 밝은 회색 바닥, 그 위의 반투명 흰색. 색상(hue)은 강조색 하나뿐이다.

### Primary
- **점등 녹색 `lit`** (#34c76f): 지금 할 일이 있을 때만 켜지는 8px 점(`.segment.is-lit`, `.lit-dot`, `.ledger-home-mine`, 장부 미납)과 "진행 중 투표"·"확정 후보" 배지의 테두리. 배경으로는 `lit-wash`(14% 워시), 글자로는 `lit-ink`(#116b38, 워시 위 AA 대비). 버튼·링크·헤더에는 쓰지 않는다.

### Neutral
- **흑연 보드 `board`** (#0f1115): 상단 보드 띠, 홈 베드, 탭바, 레일, 더보기 시트, 토스트. 글자는 `board-ink`(#e6e8eb), 흐린 글자·라벨은 `board-muted`(#8a9099), 칸 구분과 테두리는 `board-seam`(#2a2e35), 활성 탭·세그먼트 칸은 `board-raised`(#1a1d22).
- **바닥 `ground`** (#f3f4f6): body 배경. 상단 #fbfbfc에서 `ground-deep`(#e9ebef)로 떨어지는 고정(fixed) 방사형 그라데이션. 표의 강조 셀·요약 상자·장부 펼침 행 배경으로도 쓴다.
- **간유리 `panel`** (rgba(255,255,255,.72), 홈은 .78): `.card`·`.section`·`.rows`. 항상 `backdrop-filter: blur(14px) saturate(1.1)`과 함께. 불투명이 필요한 곳(버튼·입력·칩·모달·멤버 타일)은 `panel-solid`(#fff).
- **이음새 `seam`** (#e3e5e9): 모든 헤어라인(`--hair: 1px solid`). 버튼 hover·"연락함" 배지 테두리처럼 한 단계 진해질 때 `seam-strong`(#c9cdd3).
- **잉크 `ink`** (#0f1115): 본문, 기본 버튼 글자, 프라이머리 버튼·`.row-action` 배경, 포커스 링, `::selection`, 체크박스 accent. 프라이머리 hover는 `ink-raised`(#22262d). 보조 본문 `ink-2`(#3f4650), 메타·라벨·플레이스홀더 `ink-3`(#6b7280), 비활성·취소선 `ink-4`(#8a9099).
- **스크림 `scrim`** (rgba(15,17,21,.45)): 모달·더보기 시트 뒤. 모달에는 blur(6px) 추가.

### Named Rules
**The Lit-Only Rule.** 강조색은 "바뀐 것·주의할 것"의 점등에만 쓴다. 8px 점(`box-shadow: 0 0 0 3px lit-wash` 링)과 open/confirmed 배지가 전부다. 버튼, 링크, 제목, 아이콘에 강조색이 보이면 위반이다.

**The Two Inks Rule.** 글자색은 보드 위에서는 `board-ink`/`board-muted` 두 개, 바닥 위에서는 `ink`~`ink-4` 네 단계만 쓴다. 보드 위에 `ink`, 바닥 위에 `board-ink`를 올리지 않는다.

## Typography

**Display Font:** Pretendard Variable (jsdelivr CSS, dynamic subset; fallback Pretendard, Apple SD Gothic Neo, Malgun Gothic, system-ui)
**Body Font:** 동일 (한 패밀리)
**Label Font:** 동일; 코드 미리보기(`.json-preview`)만 ui-monospace

**Character:** 한 패밀리, 세 크기. 숫자는 전역 `tabular-nums`로 자리를 지키고, 본문 자간은 -0.01em로 살짝 조여 전광판의 밀도를 낸다. 서체는 말하지 않고 숫자가 말한다.

### Hierarchy
- **Display** (700, clamp(36px, 10vw, 56px), lh 1.1, -0.03em): 페이지에 하나뿐인 숫자. 홈 보드의 "D-2"(보드 안에서는 lh 1, 데스크톱 56px 고정)와 홈 투표 패널의 참석 인원. 뒤따르는 단위("명 참석")는 Body 600 `ink-3`.
- **Title** (700, 15px, lh 1.55, -0.01em): `h1`(페이지 제목, 상단 20px/하단 12px 여백), 보드 제목(`.board-title`), 행 라벨(`.row-label`), 모달 제목, 회칙 본문 h2. 본문과 크기가 같고 굵기로만 구분한다.
- **Body** (400, 15px, lh 1.55, -0.01em): 본문, 버튼(600), 세그먼트 값(700), 표 셀.
- **Label** (600, 12px, 0.06em, UPPERCASE, `ink-3`/보드 위 `board-muted`): 섹션 제목(`.card h2`, `.section h2`), 세그먼트 라벨, 보드 라인 머리말("확정 매치"), 폼 `label`, 표 머리(0.04em), 메타·시간·칩·토스트·인증 바(대문자 변환 없음).

### Named Rules
**The Three Sizes Rule.** 15 / 12 / display 세 단계만 쓴다. 새 크기가 필요하다고 느끼면 굵기(400/600/700)나 잉크 단계로 해결한다. 건드리지 않는 두 예외: 탭바·레일 글자 11px(셸 전용), 입력 16px(iOS 확대 방지).

**The One Display Rule.** 디스플레이 숫자는 페이지에 하나다. 홈은 보드의 D-day가 그것이고, 패널의 인원 수는 바닥 위에서 같은 토큰을 쓰는 유일한 예외다. 두 숫자가 같은 보드에 서지 않는다.

## Layout

휴대폰 우선, 단일 열. 콘텐츠 최대 폭 560px, 거터 16px, `body > h1/main/.section/.authbar` 등이 같은 폭을 공유한다. 하단에는 64px 탭바 높이(+safe-area)가 body 패딩으로 비워진다.

- **홈 베드**: `.bed`는 거터를 음수 마진으로 뚫어 가로 전폭의 어두운 띠가 되고(하단 모서리만 24px), 하단 44px 패딩을 남긴다. 그 아래 `.hub-grid`가 -32px로 올라와 첫 간유리 패널이 베드 하단을 덮는다. 간유리가 실제로 어두운 것을 흐리게 하는 유일한 장치이므로, 홈 패널은 .78 불투명도를 쓴다.
- **허브 그리드**: 12px 간격 단일 열. 데스크톱(≥900px)에서 2열(`minmax(0,1fr)` ×2, `align-items:start`), 보드와 `.rows`는 전폭(`grid-column: 1 / -1`).
- **데스크톱 ≥900px**: 탭바·시트가 사라지고 왼쪽 76px 고정 레일. body `padding-left: 76px`, 콘텐츠 최대 960px, 거터 32px. 베드는 음수 마진을 풀고 네 모서리 24px + `board-seam` 테두리의 독립 보드가 된다. 토스트는 레일 폭의 절반만큼 오른쪽으로 중심을 옮긴다.
- **보조 브레이크포인트**: 520px(장부 타일 3열), 600px 이하(결과표 최소 520px, 가로 스크롤).
- **간격 리듬**: 2/4(내부 라인) · 6/8(칩·버튼 사이) · 10/12(패널 내부·패널 사이) · 14/16(패널 패딩·보드 패딩) · 20/24(모달 패딩·파괴적 버튼 고립) · 32(데스크톱 거터·베드 겹침) · 44(탭 타깃).
- **행 목록**: `.rows` 안 `.row`는 min-height 60px, 패딩 12px 16px, 왼쪽 라벨+부제, 오른쪽 숫자(`.row-figure`) 또는 잉크 알약(`.row-action`). 행 사이는 헤어라인만.
- **터치 타깃**: 버튼·입력·멤버 타일·탭 모두 44px(`--tap`). 보조 버튼(인증 바·툴바·표 안)은 32~40px.

## Elevation & Depth

그림자 없는 시스템이다. 바닥 위 패널은 1px 헤어라인 이음새(`seam`)와 간유리 투명도로 떠 있고, 보드 위 칸은 1px `board-seam` 간격과 `board-raised` 톤 차이로 구분된다. `.card`·`.section`에는 `box-shadow: none`이 명시되어 있다. 깊이는 "어두운 것을 흐리게 비추는 간유리"가 만든다. 그림자는 바닥에서 분리된 부동 레이어 세 곳에만 허용된다.

### Shadow Vocabulary
- **탭바 들림** (`box-shadow: 0 -8px 24px rgba(15,17,21,.08)`): 하단 고정 탭바가 콘텐츠 위에 떠 있음을 알리는 위쪽 번짐. 데스크톱 레일에는 없다(테두리 1px만).
- **모달** (`box-shadow: 0 16px 40px rgba(15,17,21,.18)`): 스크림 위 380px 흰 모달. `dialog.ledger-dialog`·`.operations-dialog` 포함.
- **토스트** (`box-shadow: 0 10px 30px rgba(15,17,21,.25)`): 다크 토스트. 탭바 위 14px, 데스크톱 하단 28px.
- **점등 링** (`box-shadow: 0 0 0 3px lit-wash`): 그림자가 아니라 8px 점의 후광. 깊이와 무관한 점등 장치이며 다른 요소에 확장하지 않는다.

### Named Rules
**The Hairline Rule.** 바닥 위에서 요소를 나누는 것은 1px `seam`뿐이다. 패널 경계, 행 사이, 표 행, 칩 테두리, 입력 테두리, 섹션 내부 구분(`.seam`) 모두 같은 선. hover는 `seam-strong`으로 한 단계 진해질 뿐 그림자를 얻지 않는다.

**The Floating-Only Shadow Rule.** 그림자는 fixed 레이어(탭바·모달·토스트)에만 있다. 카드, 버튼, 입력, 보드에 그림자를 더하면 위반이다.

## Shapes

반경 토큰은 `--r: 12px` 하나다. 패널, 보드, 버튼, 입력, 칩(3px 9px 패딩의 알약), 탭 활성 배경, 토스트, 모달, 포커스 링, 스크롤바 썸 모두 12px. 예외는 둘: 홈 베드와 데스크톱 베드의 24px(`calc(var(--r) * 2)`, 띠가 보드를 감싸는 외곽), 점등 점의 50%. 더보기 시트는 상단만 12px.

테두리는 항상 1px. 바닥 위는 `seam`, 보드 위는 `board-seam`, 파괴적 버튼·데모 배너·미분석 배지는 같은 1px을 **점선**으로 바꿔 "임시·주의"를 말한다. 세그먼트와 운영 탭은 1px 간격(`gap: 1px`)으로 어두운 바탕을 비쳐 선을 만든다(테두리 아님). 클리핑은 `overflow: hidden`으로 그룹(`.segments`, `.rows`, `.operations-tabs`)의 모서리를 자른다.

아이콘은 24 그리드, 1.75px 스트로크, 둥근 캡·조인, `currentColor`, 채움 없음. 한 벌(`ICONS`: home/vote/matches/rotation/ledger/member/rules/admin/more/check/copy/external/plus/chevron/close/thumb/shuffle/warn)만 쓰고 셸에서는 22px로 렌더한다.

## Components

### Buttons
담담하고 눌리는 느낌. 전폭(블록) 기본, 그룹 안에서는 `width:auto`로 줄인다.
- **Shape:** 12px 반경, 1px 헤어라인, min-height 44px, 패딩 10px 16px, 상단 마진 8px(그룹 안에서는 0).
- **Default:** `panel-solid` 바탕, `ink` 글자 600 15px. hover 시 테두리만 `seam-strong`. active `translateY(1px)`. 전이 0.15s ease-out(배경·테두리·변형).
- **Primary (`.primary`, `.copy`, `.home-primary-link`, `aria-pressed=true`):** `ink` 바탕, 흰 글자. hover `ink-raised`. 한 패널에 하나.
- **Destructive (`.btn-destructive`, `.btn-del`):** 투명 바탕, `ink-2` 글자, 점선 테두리, **상단 마진 24px로 혼자 선다**. hover에서만 실선·`ink`.
- **Disabled:** opacity .45, 변형 없음.
- **Segmented (`.format-row label`, `.operations-tabs button`):** 선택된 칸만 `ink` 채움.

### Chips
- **Style:** `panel-solid`, 1px `seam`, 12px 알약, 패딩 3px 9px, Label 600 `ink-2`.
- **State:** 진행 중/확정은 `lit` 테두리 + `lit-wash` + `lit-ink`; 연락함/답장은 `ink` + `seam-strong`; 마감/거절/취소는 `ink-4` + 취소선; 미분석은 점선; 지각은 `ink` 테두리.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** `panel`(홈 .78) + blur(14px) saturate(1.1). 불투명 흰색은 쓰지 않는다(모달 제외).
- **Shadow Strategy:** 없음(`box-shadow: none`).
- **Border:** 1px `seam`.
- **Internal Padding:** 16px. 제목은 Label(대문자), 아래 10px. 본문은 `ink-2`. 패널 안에 패널을 넣지 않는다.
- **행 목록(`.rows`):** 같은 재질의 컨테이너를 헤어라인으로 60px 행으로 나눈 것. hover 시 배경 .95.

### Inputs / Fields
- **Style:** `panel-solid`, 1px `seam`, 12px, min-height 44px, 패딩 10px 12px, 16px 글자(iOS). `label`은 Label 스타일(12px 600 `ink-3`).
- **Focus:** 테두리 `ink`, outline 없음. 다른 포커스 가능한 요소는 `outline: 2px solid ink, offset 2px, radius 12px`; 보드 위 링크는 `board-ink` 링을 -4px 안쪽으로.
- **Checkbox/Radio:** 18px, `accent-color: ink`(선택된 멤버 타일 위에서는 흰색).

### Navigation
- **모바일 탭바:** fixed 하단, `board` 바탕, 상단 1px `board-seam`, 6px 패딩(+safe-area), 높이 64px. 항목은 홈·투표·매칭·배정표·장부·더보기 여섯 개, 각 max 96px, min-height 52px, 아이콘 22px + 11px 600 라벨, `board-muted`. 활성은 `board-ink` 글자 + `board-raised` 배경(12px). 더보기는 하단 다크 시트(3열 그리드, `board-raised` 타일, 스크림)로 내 현황·회칙·관리를 연다.
- **데스크톱 레일(≥900px):** 왼쪽 76px 고정, `board` 바탕, 오른쪽 1px `board-seam`. 상단 "FC" 마크(800, -0.04em, 44px 높이), 그 아래 8개 항목 전부. 활성 처리는 탭바와 동일.
- 이전 상단 내비(`.topnav`)는 `display:none`으로 봉인되어 있다. 셸은 `renderNav(key)`가 그린다.

### Board (signature)
보드는 어두운 띠 하나로 이번 주를 읽게 한다.
- **`.board`:** `board` 바탕, `board-ink` 글자, 1px `board-seam`, 12px, 패딩 14px 16px. 홈에서는 `.bed` 안에 테두리 없이 놓인다.
- **`.board-row`:** 왼쪽 Label("이번 주") + Title(날짜), 오른쪽 Display 숫자(D-day), 하단 정렬.
- **`.segments` / `.segment`:** 1px `board-seam` 간격의 동일 폭 칸, `board-raised` 바탕, Label + 700 값. `.is-lit`은 값 앞 8px `lit` 점, `.is-dim`은 값 `board-muted` 500.
- **`.board-lines` / `.board-line`:** 상단 1px `board-seam` 구분 후 Label 머리말("확정 매치" / "방금 등록")과 600 본문.
- **모션(유일하게 저작된 순간):** 로드 시 `seg-lit` 키프레임(`board`→`board-raised`, `board-muted`→`board-ink`) 0.6s `cubic-bezier(.16,1,.3,1)` both. 두 번째 세그먼트 0.12s, 보드 라인 0.24s 지연. `prefers-reduced-motion`에서는 animation none(즉시 표시).

### Toast / Modal
- **Toast:** 다크(`board`/`board-ink`), Label 600, 12px, 1px `board-seam`, 탭바 위 14px 중앙. 들어올 때 opacity .2s + translateY 6px→0 .3s, 1.8초 뒤 사라짐.
- **Modal:** 스크림 + blur(6px) 위 `panel-solid` 380px, 패딩 20px, 제목은 Title(대문자 아님), 라벨은 12px 위 6px 아래.

### Tables
헤어라인 행(10px 8px 패딩), 머리는 Label 0.04em 대문자 `ink-3`, 배경 없음. 숫자 열은 전역 표형 숫자. 넓은 표는 12px로 깎인 가로 스크롤 영역(`.rules-table-scroll`, `.operations-scroll`, `.result-scroll`) 안에 둔다. 스크롤바는 6px 얇은 `seam-strong`.

## Do's and Don'ts

### Do:
- **Do** 상태의 변화·지금 할 일에만 강조색을 켠다: 8px `lit` 점 + 3px `lit-wash` 링, 또는 `lit` 테두리 배지. 그 외는 모두 그레이스케일.
- **Do** 모든 요소를 12px 하나로 깎고(`--r`), 바닥 위 구분은 1px `seam`, 보드 위 구분은 1px `board-seam`으로만 한다.
- **Do** 글자 크기를 15 / 12 / display 세 단계로 고정하고 굵기(400/600/700)와 잉크 단계(`ink`~`ink-4`)로 위계를 만든다. 숫자는 항상 tabular-nums.
- **Do** 페이지당 디스플레이 숫자 하나. 홈은 보드의 D-day.
- **Do** 파괴적 버튼은 투명+점선으로, 위 24px 마진을 두어 다른 버튼과 떨어뜨린다.
- **Do** 아이콘은 `ICONS` 한 벌(24 그리드, 1.75px 스트로크, 둥근 캡)만 `icon(name, 22)`로 렌더한다.
- **Do** 터치 타깃 44px, 375px 폭에서 가로 넘침 없이. 보드·패널·버튼·입력은 모두 `min-width: 0`/`overflow-wrap: anywhere`로 긴 한글을 접는다.
- **Do** 색·반경·크기는 styles.css의 `:root` 토큰(`var(--…)`)만 쓴다.

### Don't:
- **Don't** 버튼·링크·제목·아이콘에 강조색을 쓰지 않는다. 프라이머리 버튼은 `ink` 채움이다.
- **Don't** 카드·버튼·입력·보드에 그림자를 더하지 않는다. 그림자는 fixed 레이어(탭바·모달·토스트) 셋뿐이다.
- **Don't** 패널 안에 패널(`.card` 안 `.card`/`.section`)을 넣지 않는다. 내부 구분은 `.seam` 헤어라인으로.
- **Don't** 페이지 HTML에 인라인 `style=`나 원시 hex를 쓰지 않는다.
- **Don't** 이모지를 아이콘으로 쓰지 않는다(카톡 공유 **문구** 안의 👍는 제품 언어이므로 예외).
- **Don't** 새 글자 크기(13, 14, 18, 20…)나 두 번째 반경, 두 번째 강조색을 들이지 않는다.
- **Don't** 보드 위에 `ink` 계열, 바닥 위에 `board-ink` 계열 글자를 올리지 않는다.
- **Don't** 상단 가로 내비(`.topnav`)를 되살리지 않는다. 셸은 탭바(모바일)와 레일(데스크톱)이다.
