import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawnSync} from 'node:child_process';
import {snapshot,protectionErrors,referencePlans,hash,DEFAULT_ROOT} from '../scripts/common.mjs';
import {canonicalTokenCss,inspectStyles,tokenCatalog,valueErrors} from '../scripts/token-check.mjs';
import {requirementsErrors,screensErrors,mappingErrors,runGates} from '../scripts/gates.mjs';
import {invalidateStage,progress,updateFailures} from '../scripts/progress.mjs';
import {inspectCommit} from '../scripts/precommit.mjs';
import {exerciseBrowser,devArguments} from '../scripts/browser-check.mjs';
import {SCREENS,REQUIRED_INPUTS} from '../scripts/contract.mjs';
const put=(root,rel,text)=>{const p=path.join(root,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);};
const json=(root,rel,data)=>put(root,rel,JSON.stringify(data));
function fixture(app=true) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'uplus-harness-test-'));
  for(const p of REQUIRED_INPUTS) put(root,p,'fixture');
  json(root,'docs/tokens.json',{meta:{defaultMode:'Default'},tokens:[
    {collection:'primitive',name:'gray/0',type:'color',values:{Default:'#ffffff'}},
    {collection:'semantic',name:'bg/surface',type:'color',values:{Default:{alias:'primitive/gray/0',resolved:'#ffffff'}}},
    {collection:'spacing',name:'spacing/16',type:'float',values:{Default:16}}
  ],textStyles:[]});
  const plans=[1,2,3,4].map(i=>({id:'p'+i,name:'요금제'+i,monthlyPrice:10000*i}));
  put(root,'reference/make-export/src/App.tsx','const plans = '+JSON.stringify(plans.map(x=>({id:x.id,name:x.name,price:x.monthlyPrice})))+';');
  json(root,'harness/input-baseline.json',snapshot(root));
  json(root,'harness/work/requirements.json',{schemaVersion:1,sources:REQUIRED_INPUTS,userStories:['고객이 요금제를 선택한다.'],precedence:'reference',conflicts:[],unresolved:[],plans});
  json(root,'harness/work/screens.json',{schemaVersion:1,screens:SCREENS.map(s=>({...s,components:['Header'],interactions:[]}))});
  json(root,'harness/work/token-map.json',{schemaVersion:1,mappings:SCREENS.map(s=>({screen:s.id,component:'Header',tokenRefs:['semantic/bg/surface']})),missing:[]});
  if(app) {
    put(root,'app/src/tokens.css',canonicalTokenCss(root));
    put(root,'app/src/main.tsx','import "./tokens.css"; export const screen = <main className="screen" />;');
    put(root,'app/src/style.css','.screen { background: var(--semantic-bg-surface); padding: var(--spacing-spacing-16); display: flex; width: 100%; }');
  }
  return {root,plans};
}
function cleanup(root) {
  const p=path.resolve(root),base=path.resolve(os.tmpdir())+path.sep;
  assert.ok(p.startsWith(base)&&path.basename(p).startsWith('uplus-harness-test-'));
  fs.rmSync(p,{recursive:true,force:true});
}
async function withFixture(fn,app=true) {const f=fixture(app);try{return await fn(f);}finally{cleanup(f.root);}}
function git(root,args) {
  const r=spawnSync('git',args,{cwd:root,encoding:'utf8',timeout:30000});
  assert.equal(r.status,0,r.stderr); return r.stdout;
}
test('원본 변경·추가·삭제를 모두 보호한다',()=>withFixture(({root})=>{
  const baseline=snapshot(root);assert.deepEqual(protectionErrors(root,baseline),[]);
  put(root,'docs/PRD.md','changed');put(root,'reference/new.txt','new');fs.unlinkSync(path.join(root,'reference/flow.png'));
  assert.equal(protectionErrors(root,baseline).length,3);
}));
test('Next 전용 hostname 인수와 Vite host 인수를 구별한다',()=>{
  assert.deepEqual(devArguments({dependencies:{next:'16.4.0'}},3001),['run','dev','--','--hostname','127.0.0.1','--port','3001']);
  assert.equal(devArguments({dependencies:{vite:'7'}},3001)[3],'--host');
});
test('Tailwind v4 검증된 기본 import만 허용하며 사용자 값은 계속 거부한다',()=>withFixture(({root})=>{
  json(root,'app/package.json',{devDependencies:{tailwindcss:'^4.3.3'}});
  json(root,'app/package-lock.json',{packages:{'':{devDependencies:{tailwindcss:'^4.3.3'}},'node_modules/tailwindcss':{version:'4.3.3'}}});
  json(root,'app/node_modules/tailwindcss/package.json',{version:'4.3.3'});
  put(root,'app/src/style.css','@import "tailwindcss"; .screen { padding:17px; }');
  let errors=inspectStyles(root);assert.ok(errors.some(x=>x.includes('17px')));assert.ok(!errors.some(x=>x.includes('CSS import')));
  put(root,'app/src/style.css','@import "tailwindcss";');assert.deepEqual(inspectStyles(root),[]);
  json(root,'app/node_modules/tailwindcss/package.json',{version:'3.4.0'});
  assert.ok(inspectStyles(root).some(x=>x.includes('버전 불일치')));
  put(root,'app/src/style.css','@import "tailwindcss/theme";');
  assert.ok(inspectStyles(root).some(x=>x.includes('CSS import')));
}));
test('폰트 승인 SHA와 경로를 우회할 수 없다',()=>withFixture(({root})=>{
  put(root,'app/public/fonts/PretendardVariable.woff2','wOF2fake');
  json(root,'harness/approved-assets.json',{schemaVersion:1,assets:[{path:'app/public/fonts/PretendardVariable.woff2',sha256:hash('wOF2fake'),source:'https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2',family:'Pretendard Variable',weight:'100 900',style:'normal',display:'swap'}]});
  assert.throws(()=>canonicalTokenCss(root),/공식 승인 폰트 해시/);
  json(root,'harness/approved-assets.json',{schemaVersion:1,assets:[{path:'../outside',sha256:hash('wOF2fake')}]});
  assert.throws(()=>canonicalTokenCss(root),/경로 탈출/);
}));
test('토큰 staging은 명시적 승인과 현재·index·state SHA 일치가 모두 필요하다',()=>withFixture(({root})=>{
  git(root,['init','-b','main']);git(root,['add','--','docs','reference','harness','app']);
  git(root,['-c','user.name=Harness Test','-c','user.email=harness@example.invalid','commit','-m','fixture']);
  const tokens=JSON.parse(fs.readFileSync(path.join(root,'docs/tokens.json')));tokens.meta.note='approved';json(root,'docs/tokens.json',tokens);
  git(root,['add','--','docs/tokens.json']);json(root,'harness/work/state.json',{inputHashes:snapshot(root)});
  assert.ok(inspectCommit(root).some(x=>x.includes('스테이징 금지')));
  json(root,'harness/work/state.json',{inputHashes:snapshot(root),userDecisions:{tokenWriteException:{path:'docs/tokens.json'}}});
  assert.deepEqual(inspectCommit(root),[]);
  tokens.meta.note='unstaged';json(root,'docs/tokens.json',tokens);
  assert.ok(inspectCommit(root).some(x=>x.includes('스테이징 금지')));
}));
test('공식 로컬폰트 생성 및 staging된 폰트 변조를 검사한다',()=>withFixture(({root})=>{
  const asset=JSON.parse(fs.readFileSync(path.join(DEFAULT_ROOT,'harness/approved-assets.json'))).assets[0];
  for(const rel of [asset.path,asset.licensePath]) put(root,rel,fs.readFileSync(path.join(DEFAULT_ROOT,rel)));
  json(root,'harness/approved-assets.json',{schemaVersion:1,assets:[asset]});
  put(root,'app/src/tokens.css',canonicalTokenCss(root));
  assert.match(canonicalTokenCss(root),/@font-face/);assert.deepEqual(inspectStyles(root),[]);
  git(root,['init','-b','main']);git(root,['add','--','docs','reference','harness','app']);
  git(root,['-c','user.name=Harness Test','-c','user.email=harness@example.invalid','commit','-m','fixture']);
  const manifest=path.join(root,'harness/approved-assets.json');
  fs.writeFileSync(manifest,fs.readFileSync(manifest,'utf8').replaceAll('\r\n','\n').replaceAll('\n','\r\n'));
  put(root,'app/src/style.css','.screen { display:flex; }');git(root,['add','--','app/src/style.css']);
  assert.deepEqual(inspectCommit(root),[]);
  put(root,asset.path,'wOF2corrupt');git(root,['add','--',asset.path]);
  // Restore working bytes: the index must still be inspected rather than the valid working font.
  put(root,asset.path,fs.readFileSync(path.join(DEFAULT_ROOT,asset.path)));
  assert.throws(()=>inspectCommit(root),/SHA 불일치/);
}));
test('참고 요금제 추출 및 계획의 화면·데이터·토큰 검증',()=>withFixture(({root,plans})=>{
  assert.deepEqual(referencePlans(root),plans);assert.deepEqual(requirementsErrors(root),[]);
  assert.deepEqual(screensErrors(root),[]);assert.deepEqual(mappingErrors(root),[]);
  const r=JSON.parse(fs.readFileSync(path.join(root,'harness/work/requirements.json')));
  r.plans[0].monthlyPrice++;json(root,'harness/work/requirements.json',r);
  assert.throws(()=>requirementsErrors(root),/불일치/);
  json(root,'harness/work/screens.json',{schemaVersion:1,screens:SCREENS.slice(0,3)});
  assert.throws(()=>screensErrors(root),/정확히 4개/);
  json(root,'harness/work/token-map.json',{schemaVersion:1,mappings:[],missing:[{requirement:'height'}]});
  assert.throws(()=>mappingErrors(root),/누락/);
}));
test('정상 토큰 참조는 통과, 숫자·색·없는 변수·fallback·primitive는 거부',()=>withFixture(({root})=>{
  assert.deepEqual(inspectStyles(root),[]);
  put(root,'app/src/tokens.css',canonicalTokenCss(root).replaceAll('\n','\r\n'));
  assert.deepEqual(inspectStyles(root),[]);
  const {entries}=tokenCatalog(root);
  for(const [prop,value] of [['padding','17px'],['color','#fff'],['background','red'],['padding','var(--unknown)'],['padding','var(--spacing-spacing-16, 17px)'],['color','var(--primitive-gray-0)']])
    assert.ok(valueErrors(prop,value,entries).length,value);
  assert.deepEqual(valueErrors('width','calc(100% - var(--spacing-spacing-16))',entries),[]);
}));
test('생성 CSS 변조·inline style·외부 CSS·숫자 utility·SVG 임의 자산을 거부',()=>withFixture(({root})=>{
  put(root,'app/src/tokens.css',canonicalTokenCss(root)+'\n:root{--fake:17px;}');
  assert.ok(inspectStyles(root).some(x=>x.includes('정확한 생성')));
  put(root,'app/src/tokens.css',canonicalTokenCss(root));
  put(root,'app/src/main.tsx','import "./tokens.css"; const x=<main style={{padding:17}} className="p-4" />;');
  put(root,'app/src/style.css','@import "https://example.com/evil.css"; .screen{--fake:17px;padding:var(--fake);}');
  put(root,'app/public/icon.svg','<svg fill="#123456"/>');
  const errors=inspectStyles(root);
  assert.ok(errors.some(x=>x.includes('inline')));assert.ok(errors.some(x=>x.includes('utility')));
  assert.ok(errors.some(x=>x.includes('외부')));assert.ok(errors.some(x=>x.includes('자산')));
}));
test('앱 없음은 미실행이며 전체 통과가 아니다',()=>withFixture(async({root})=>{
  const report=await runGates(root,'app');
  assert.equal(report.passed,false);assert.equal(report.results.filter(x=>x.status==='not_run').length,4);
  assert.equal(report.results.filter(x=>x.status==='pass').length,5);
},false));
test('입력 변경의 복귀 지점과 같은 게이트 3회 실패 중단',()=>withFixture(async({root})=>{
  assert.equal(invalidateStage({'docs/tokens.json':'a'},{'docs/tokens.json':'b'}),'tokens');
  assert.equal(invalidateStage({'reference/a':'a'},{'reference/a':'b'}),'requirements');
  const failures={failures:{}},bad={results:[{id:'browser',status:'fail'}]};
  assert.deepEqual(updateFailures(failures,bad),[]);
  assert.deepEqual(updateFailures(failures,bad),[]);
  assert.deepEqual(updateFailures(failures,bad),['browser']);
  updateFailures(failures,{results:[{id:'browser',status:'pass'}]});
  assert.equal(failures.failures.browser,0);
  assert.deepEqual(updateFailures(failures,bad),[]);
  await progress(root,'start');
  const statePath=path.join(root,'harness/work/state.json');
  const state=JSON.parse(fs.readFileSync(statePath));state.completed=[{stage:'requirements',commit:'test',artifactHashes:{}}];
  json(root,'harness/work/state.json',state);
  const resumed=await progress(root,'resume');assert.equal(resumed.next,'requirements');
}));
test('커밋 훅은 작업 폴더와 다른 스테이징의 위반을 잡는다',()=>withFixture(({root})=>{
  git(root,['init','-b','main']);git(root,['add','--','docs','reference','harness','app']);
  git(root,['-c','user.name=Harness Test','-c','user.email=harness@example.invalid','commit','-m','fixture']);
  assert.deepEqual(inspectCommit(root),[]);
  put(root,'app/src/style.css','.screen{padding:17px;}');git(root,['add','--','app/src/style.css']);
  // 작업 폴더는 다시 정상으로 바꿔도 이미 stage된 17px는 거부해야 한다.
  put(root,'app/src/style.css','.screen{padding:var(--spacing-spacing-16);}');
  assert.ok(inspectCommit(root).some(x=>x.includes('17px')));
  git(root,['reset','--','app/src/style.css']);
  put(root,'docs/PRD.md','changed');git(root,['add','--','docs/PRD.md']);
  assert.ok(inspectCommit(root).some(x=>x.includes('스테이징 금지')));
}));
const chrome=process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':null;
test('브라우저: 4개 직접 접근과 요금제 4개 흐름을 통과, 잘못된 완료 요금은 실패',async t=>{
  const executable=process.env.HARNESS_BROWSER||(chrome&&fs.existsSync(chrome)?chrome:null);
  if(!executable) {t.skip('로컬 Chrome 없음: 별도 브라우저 설치 필요');return;}
  const plans=[1,2,3,4].map(i=>({id:'p'+i,name:'요금제'+i,monthlyPrice:10000*i}));
  let corrupt=false;
  const server=http.createServer((req,res)=>{
    res.setHeader('Content-Type','text/html; charset=utf-8');
    const data=JSON.stringify(plans),routes=JSON.stringify(SCREENS);
    res.end('<!doctype html><meta charset="utf-8"><main></main><script>'+
      'const plans='+data+';window.__HARNESS_ROUTES__='+routes+';const corrupt='+corrupt+';'+
      'function go(url){history.pushState({}, "",url);render();}'+
      'function selected(p,id){return "<div data-testid=\\""+id+"\\" data-plan-id=\\""+p.id+"\\">"+p.name+"</div><div data-testid=\\"monthly-price\\" data-amount=\\""+(corrupt&&id==="completed-plan"?1:p.monthlyPrice)+"\\">"+p.monthlyPrice+"원</div>";}'+
      'function render(){let path=location.pathname;let p=plans.find(x=>path.endsWith("/"+x.id)||new URLSearchParams(location.search).get("plan")===x.id)||plans[0];let id=path==="/complete"?"complete":path==="/apply"?"apply":path.startsWith("/plans/")?"detail":"plans";let m=document.querySelector("main");m.dataset.screen=id;'+
      'if(id==="plans")m.innerHTML=plans.map(x=>"<article data-testid=\\"plan-card\\" data-plan-id=\\""+x.id+"\\">"+x.name+"<button onclick=\\"go(\\x27/plans/"+x.id+"\\x27)\\">자세히</button></article>").join("");'+
      'if(id==="detail")m.innerHTML=selected(p,"selected-plan")+"<button onclick=\\"go(\\x27/apply?plan="+p.id+"\\x27)\\">구독 신청하기</button>";'+
      'if(id==="apply")m.innerHTML=selected(p,"selected-plan")+"<label>이름<input></label><label>휴대폰 번호<input></label><label>동의<input type=\\"checkbox\\"></label><button onclick=\\"go(\\x27/complete?plan="+p.id+"\\x27)\\">신청하기</button>";'+
      'if(id==="complete")m.innerHTML=selected(p,"completed-plan");}render();</script>');
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port;
  try {
    assert.deepEqual(await exerciseBrowser(url,plans,{executablePath:executable}),[]);
    corrupt=true;
    const errors=await exerciseBrowser(url,plans,{executablePath:executable});
    assert.equal(errors.filter(x=>x.includes('신청 데이터 보존')).length,4);
  } finally {await new Promise(r=>server.close(r));}
});
