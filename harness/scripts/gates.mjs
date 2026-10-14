import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {SCREENS,REQUIRED_INPUTS,STAGES} from './contract.mjs';
import {DEFAULT_ROOT,readJson,assert,snapshot,protectionErrors,referencePlans,runNpm,outputJson} from './common.mjs';
import {tokenCatalog,inspectStyles} from './token-check.mjs';
import {inspectBrowser} from './browser-check.mjs';
function plan(root,name) {return readJson(path.join(root,'harness/work/'+name+'.json'));}
export function requirementsErrors(root) {
  const r=plan(root,'requirements');
  assert(r.schemaVersion===1,'requirements schemaVersion 오류');
  assert(r.precedence==='reference','참고 코드 우선순위 오류');
  assert(Array.isArray(r.sources)&&REQUIRED_INPUTS.every(p=>r.sources.includes(p)),'필수 입력 출처 누락');
  assert(r.sources.every(p=>typeof p==='string'&&!path.isAbsolute(p)&&!p.split(/[\\/]/).includes('..')&&fs.existsSync(path.join(root,p))),'입력 출처 경로 오류');
  assert(Array.isArray(r.userStories)&&r.userStories.length>0&&r.userStories.length<=5&&r.userStories.every(x=>typeof x==='string'&&x.trim()),'유저 스토리는 1~5문장');
  assert(Array.isArray(r.conflicts)&&r.conflicts.every(x=>typeof x.issue==='string'&&typeof x.resolution==='string'&&x.resolution.trim()),'충돌 근거·처리 결과 누락');
  assert(Array.isArray(r.unresolved)&&r.unresolved.every(x=>typeof x.question==='string'&&typeof x.blocking==='boolean'),'미해결 질문 구조 오류');
  assert(!r.unresolved.some(x=>x.blocking),'차단 질문이 남아 있음');
  const normalize=rows=>rows.map(x=>({id:x.id,name:x.name,monthlyPrice:x.monthlyPrice})).sort((a,b)=>a.id.localeCompare(b.id));
  const expected=referencePlans(root);
  assert(expected.length===4&&new Set(expected.map(x=>x.id)).size===4,'참고 요금제가 정확히 4개 아님');
  assert(Array.isArray(r.plans)&&JSON.stringify(normalize(r.plans))===JSON.stringify(normalize(expected)),'참고 코드 요금제 데이터와 불일치');
  return [];
}
export function screensErrors(root) {
  const s=plan(root,'screens'); assert(s.schemaVersion===1&&Array.isArray(s.screens),'screens 구조 오류');
  assert(s.screens.length===4,'화면 수는 정확히 4개');
  const pairs=s.screens.map(x=>x.id+':'+x.route).sort();
  assert(JSON.stringify(pairs)===JSON.stringify(SCREENS.map(x=>x.id+':'+x.route).sort()),'화면·라우트 목록 불일치');
  assert(s.screens.every(x=>Array.isArray(x.components)&&x.components.length>0&&Array.isArray(x.interactions)),'화면 구성·동작 계획 누락');
  return [];
}
export function mappingErrors(root) {
  const m=plan(root,'token-map');assert(m.schemaVersion===1&&Array.isArray(m.mappings)&&Array.isArray(m.missing),'token-map 구조 오류');
  assert(m.missing.length===0,'필요한 토큰 누락: '+JSON.stringify(m.missing));
  const {refs}=tokenCatalog(root);
  for(const row of m.mappings) {
    assert(SCREENS.some(s=>s.id===row.screen)&&typeof row.component==='string'&&row.component.trim(),'토큰 매핑 화면·컴포넌트 오류');
    assert(Array.isArray(row.tokenRefs)&&row.tokenRefs.length>0&&row.tokenRefs.every(r=>refs.has(r)),'없는 토큰 참조');
  }
  assert(SCREENS.every(s=>m.mappings.some(x=>x.screen===s.id)),'화면별 토큰 매핑 누락');
  return [];
}
export async function runGates(root,stage='app') {
  assert(STAGES.includes(stage),'알 수 없는 단계: '+stage);
  const results=[];
  let inputBaseline;
  async function gate(id,returnTo,fn) {
    try {const errors=await fn(); results.push({id,status:errors.length?'fail':'pass',returnTo,errors});}
    catch(e){results.push({id,status:'fail',returnTo,errors:[e.message]});}
  }
  await gate('inputs','requirements',()=>{
    for(const p of REQUIRED_INPUTS) assert(fs.existsSync(path.join(root,p)),'입력 없음: '+p);
    const statePath=path.join(root,'harness/work/state.json');
    const baseline=fs.existsSync(statePath)?readJson(statePath).inputHashes:readJson(path.join(root,'harness/input-baseline.json'));
    assert(baseline&&typeof baseline==='object','입력 해시 기준 없음');
    inputBaseline=baseline;
    const errors=protectionErrors(root,baseline); tokenCatalog(root); return errors;
  });
  await gate('requirements','requirements',()=>requirementsErrors(root));
  if(STAGES.indexOf(stage)>=1) await gate('screens','screens',()=>screensErrors(root));
  if(STAGES.indexOf(stage)>=2) await gate('token-map','tokens',()=>mappingErrors(root));
  if(stage==='app') {
    const exists=fs.existsSync(path.join(root,'app/package.json'));
    if(!exists) for(const id of ['styles','build','lint','browser']) results.push({id,status:'not_run',returnTo:'app',errors:['미실행: 앱 없음']});
    else if(results.some(r=>r.status!=='pass')) for(const id of ['styles','build','lint','browser']) results.push({id,status:'not_run',returnTo:'app',errors:['선행 계획 게이트 실패']});
    else {
      await gate('styles','app',()=>inspectStyles(root));
      const pkg=readJson(path.join(root,'app/package.json'));
      for(const script of ['build','lint']) await gate(script,'app',()=>{
        assert(typeof pkg.scripts?.[script]==='string'&&pkg.scripts[script].trim(),script+' 명령 없음');
        assert(!/^(?:echo\b|true\b|exit\s+0\b)/i.test(pkg.scripts[script].trim()),script+' 가짜 성공 명령 거부');
        runNpm(path.join(root,'app'),script);return [];
      });
      if(results.filter(r=>['styles','build','lint'].includes(r.id)).every(r=>r.status==='pass'))
        await gate('browser','app',()=>inspectBrowser(root));
      else results.push({id:'browser',status:'not_run',returnTo:'app',errors:['스타일·build·lint 통과 전 브라우저 검사 중단']});
    }
  }
  if(inputBaseline) await gate('inputs-after','requirements',()=>protectionErrors(root,inputBaseline));
  return {schemaVersion:1,stage,passed:results.every(r=>r.status==='pass'),results};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const i=process.argv.indexOf('--stage'),r=process.argv.indexOf('--root');
  try {const report=await runGates(r<0?DEFAULT_ROOT:path.resolve(process.argv[r+1]),i<0?'app':process.argv[i+1]);outputJson(report,report.passed?0:1);}
  catch(e){outputJson({passed:false,error:e.message},1);}
}
