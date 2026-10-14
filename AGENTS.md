# 화면 구현 하네스

## 실행 원칙
- 메인은 앱 코드를 직접 구현·수정하지 않는다. 아래 작업 에이전트를 호출하고 게이트를 실행한다.
- docs/와 reference/는 읽기 전용이다. 파일 추가·삭제·내용 수정도 금지한다.
- 기능·데이터·문구·필터·추천 표시·동작 충돌은 reference/make-export/를 우선한다.
- PRD의 유저 스토리 5문장은 서비스 맥락으로 유지하되 참고 코드에 없는 기능을 자동 추가하지 않는다.
- 디자인 값의 SSOT는 docs/tokens.json이다. Design.md는 용법 설명이며 누락된 값을 허용하는 근거가 아니다.
- 필요한 토큰이 없으면 해당 구현을 중단하고 질문한다. 사용자가 입력을 직접 갱신한 후 해시를 다시 확인한다.
- "진행해"라는 말로 임의 디자인 값·새 토큰을 허용하지 않는다.
- 숫자·색·타이포 값은 생성된 토큰 변수만 참조한다. tokens.css는 canonicalTokenCss(root)의 정확한 출력이어야 한다.
- 색은 semantic 토큰, 타이포는 textStyles의 변수로 적용한다. 사용자 정의 CSS 변수, inline style, 외부 CSS, CSS-in-JS와 숫자 디자인 utility로 우회하지 않는다.
- 허용 레이아웃 표현: 0, auto, 100%, inherit, initial, unset, none, normal, currentColor, transparent 및 구조적인 flex/grid 키워드.
- 숫자 구조 예외는 flex-grow/flex-shrink/order/grid 행·열의 0/1, grid-template의 1fr로 한정한다. repeat 횟수도 1만 허용한다. 임의 수치를 구조 표현으로 숨기지 않는다.
- calc/min/max/clamp도 등록 토큰 참조와 허용값만 조합한다. CSS 문자열·함수·조건은 검사기가 허용한 것만 사용한다.
- 원본 참고 이미지·SVG는 바이트가 동일한 로컬 자산만 허용한다. 누락 LFS 포인터는 실제 폰트가 아니다. 폰트 원본은 이번 커밋에서 제외되어 있으므로 필요한 경우 질문한다.

## 호출과 실행 범위
- "하네스 시작": node harness/scripts/progress.mjs start 로 현재 입력 해시를 기록하고 자료 확인부터 진행한다.
- "하네스 이어서": node harness/scripts/progress.mjs resume 결과의 다음 단계부터 진행한다.
- "게이트만 검사": node harness/scripts/gates.mjs --stage app 을 실행한다. 구현이나 상태를 변경하지 않는다.
- R8에서는 에이전트·검사기·규칙·훅만 생성한다. 앱 코드와 실행 단계 산출물은 후속 "하네스 시작" 요청 때 만든다.
- 모델·추론 설정은 모든 역할이 메인을 상속한다. 별도 prd-checker를 자동 호출하지 않는다.

## 단계와 역할
| 단계 | 역할 | 편집 폴더 | 유일한 작업 산출물 |
|---|---|---|---|
| 1 | requirements-reader | harness/work/ | requirements.json |
| 2 | screen-planner | harness/work/ | screens.json |
| 3 | token-planner | harness/work/ | token-map.json |
| 4 | screen-builder | app/ | 앱 코드 |
| 5 | gate-judge | 없음 | stdout 검사 결과 |

- 1~3단계는 같은 폴더를 순차 사용하고 각자 맡은 파일만 수정한다.
- 판정자는 앱·검사기·상태·보고서를 변경하지 않는다. build 산출물·캐시는 app/ 아래에만 허용한다.
- 메인은 호출·게이트 실행·harness/work/state.json 기록·harness/reports/gates.json 저장·커밋·최종 승인 요청만 담당한다.
- 다른 역할의 폴더, 검사기, 에이전트 설정, 규칙, 훅을 변경해 검사를 통과시키지 않는다.
- 산출물 JSON 및 실제 화면 DOM의 검사 식별자는 harness/scripts/contract.mjs와 각 역할 설정을 따른다.

## 게이트
- node harness/scripts/gates.mjs --stage requirements|screens|tokens|app
- inputs: 필수 입력 존재, 토큰 별칭 유효성, docs/reference 입력 해시 변경 0건.
- requirements: 참고 코드의 요금제 데이터 4개와 일치, 유저 스토리 1~5문장, 차단 질문 0개.
- screens: 화면 유형·라우트 패턴 정확히 4개: /plans, /plans/:id, /apply, /complete.
- token-map: 화면별 매핑 존재, 없는 토큰 참조 0개, 토큰 누락 0개.
- styles: 토큰 참조 오류·임의 디자인 값 0건. 생성 CSS를 스테이징 상태에서도 검증한다.
- build/lint: app/package.json에 실제 명령이 있고 둘 모두 종료 코드 0.
- browser: 390×844에서 4개 라우트 직접 접근 4/4 성공, 각 화면 root 1개, 가로 넘침 0px.
- browser: 참고 요금제 4개 모두 목록→상세→신청→완료 후 실제 표시되는 요금제 ID·이름·월 요금 일치.
- browser 검사는 main[data-screen], 실제 window.__HARNESS_ROUTES__, 실제 UI에 붙인 data-testid를 사용한다. 숨은 테스트용 성공 데이터를 만들지 않는다.
- 앱 없음·의존성 없음·명령 없음·검사 누락·브라우저 실행 실패는 pass가 아니다. not_run과 fail을 구별하며 둘 다 완료를 막는다.
- 개발 서버는 로컬 주소만 사용하고 검사가 끝나면 그 검사에서 시작한 프로세스만 종료한다.
- 결과 JSON은 stdout으로 반환한다. 메인이 저장할 때만 progress.mjs record에 JSON을 stdin으로 전달한다.

## 복귀·재시도
- 요구사항 오류 → 1단계, 라우트 계획 오류 → 2단계, 토큰 매핑 오류 → 3단계.
- 동작·스타일·build·lint 오류 → 4단계. 수정 후 검증을 다시 실행한다.
- 같은 게이트가 연속 3회 실패하면 자동 수정 중단. 원인·근거·결정할 사항을 사용자에게 질문한다.
- 입력이 실행 중 바뀌면 즉시 중단한다. 사용자의 자료 변경 확인 후 resume로 영향 단계부터 재실행한다.
- 변경이 토큰/Design 문서에만 있으면 3단계부터, 다른 입력이 바뀌면 1단계부터 다시 실행한다.
- 입력과 산출물 해시가 같아야 완료 단계 재사용이 가능하다.

## 커밋과 이어 하기
- 각 단계 검사 통과 후 node harness/scripts/progress.mjs checkpoint <stage> 를 메인이 실행한다.
- 해당 단계 산출물만 커밋한 뒤 그 커밋 ID·산출물 해시·입력 해시를 state.json에 기록하고 별도 checkpoint 메타데이터 커밋을 만든다.
- 기존 사용자 스테이징 파일이 있으면 자동 커밋을 멈춘다. 이를 자동 unstage·reset하지 않는다.
- docs/·reference/·제외한 폰트를 스테이징하지 않는다. 전체 git add . 는 사용하지 않는다.
- 원격 푸시는 별도 요청 때만 한다.
- Git pre-commit은 보호 자료 변경과 스테이징된 앱의 토큰 위반을 차단한다. 편집 자체를 막는 OS 샌드박스가 아니다.
- git clone 후에는 npm --prefix harness ci 와 node harness/scripts/install-hook.mjs 로 검사 의존성·훅을 설치한다.
- 전체 화면·build·lint 검사는 단계 게이트에서 실행한다. 훅으로 이를 대체하지 않는다.

## 최종 승인
- 모든 기계 검사 통과 후 4개 화면과 결과를 제시하고 사람 승인을 한 곳에서 받는다.
- 사용자의 명시적 최종 승인 후에만 node harness/scripts/progress.mjs approve 를 실행한다.
- 승인 시에도 현재 입력·앱과 완료 checkpoint의 해시가 같고 게이트가 통과해야 한다.
- 인터뷰의 R8 생성 승인은 앱의 최종 완료 승인으로 해석하지 않는다.
