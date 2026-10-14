export const SCREENS = [
  {id:'plans', route:'/plans'}, {id:'detail',route:'/plans/:id'},
  {id:'apply',route:'/apply'}, {id:'complete',route:'/complete'}
];
export const VIEWPORT = {width:390,height:844};
export const REQUIRED_INPUTS = ['docs/PRD.md','docs/screens.md','docs/Design.md','docs/tokens.json','reference/flow.png','reference/make-export/src/App.tsx'];
export const STAGES = ['requirements','screens','tokens','app'];
export const RETRY_LIMIT = 3;
// 브라우저 계약은 실제 보이는 DOM에 붙인다. 화면 id는 위 SCREENS를 따른다.
// 루트: main[data-screen]. 실제 앱 라우트 테이블: window.__HARNESS_ROUTES__ = [{id,route}].
// 목록: [data-testid="plan-card"][data-plan-id], 안에 button "자세히".
// 상세: [data-testid="selected-plan"][data-plan-id], [data-testid="monthly-price"][data-amount], button "구독 신청하기".
// 신청: 위와 같은 선택값, label "이름"/"휴대폰 번호", checkbox 1개, button "신청하기".
// 완료: [data-testid="completed-plan"][data-plan-id], [data-testid="monthly-price"][data-amount].
// data-amount는 원 단위 정수 문자열이고 화면 텍스트에도 그 금액이 보여야 한다.
// 화면별 주요 기능·스타일은 reference 기준이며 계약은 기존 표시 요소의 검사 식별자다.
