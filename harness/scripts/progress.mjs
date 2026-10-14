import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DEFAULT_ROOT,readJson,snapshot,hash,assert,command,sourceFiles,outputJson} from './common.mjs';
import {STAGES,RETRY_LIMIT} from './contract.mjs';
import {runGates} from './gates.mjs';
const stateFile=root=>path.join(root,'harness/work/state.json');
const save=(p,data)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(data,null,2)+'\n');};
const artifacts={requirements:['harness/work/requirements.json'],screens:['harness/work/screens.json'],tokens:['harness/work/token-map.json']};
function stageFiles(root,stage) {
  return stage==='app'?sourceFiles(root).map(p=>path.relative(root,p).split(path.sep).join('/')):artifacts[stage];
}
function artifactHashes(root,stage) {
  return Object.fromEntries(stageFiles(root,stage).map(p=>[p,hash(fs.readFileSync(path.join(root,p)))]));
}
export function invalidateStage(previous,current) {
  const changed=[...new Set([...Object.keys(previous),...Object.keys(current)])].filter(p=>previous[p]!==current[p]);
  if(!changed.length) return null;
  if(changed.some(p=>p==='docs/tokens.json'||p==='docs/Design.md')&&changed.every(p=>p==='docs/tokens.json'||p==='docs/Design.md')) return 'tokens';
  return 'requirements';
}
export function updateFailures(state,report) {
  const halt=[];
  for(const gate of report.results) {
    if(gate.status==='fail') {
      state.failures[gate.id]=(state.failures[gate.id]||0)+1;
      if(state.failures[gate.id]>=RETRY_LIMIT) halt.push(gate.id);
    } else if(gate.status==='pass') state.failures[gate.id]=0;
  }
  return halt;
}
export async function progress(root,action,stage) {
  const p=stateFile(root);
  if(action==='start') {
    const current=snapshot(root);
    const state={schemaVersion:1,inputHashes:current,completed:[],failures:{},approval:null};
    save(p,state);return {next:'requirements',message:'새 실행의 입력 해시 기록 완료'};
  }
  assert(fs.existsSync(p),'state.json 없음: start부터 진행');
  const state=readJson(p);
  if(action==='resume') {
    const now=snapshot(root),from=invalidateStage(state.inputHashes,now);
    if(from) {
      state.completed=state.completed.filter(c=>STAGES.indexOf(c.stage)<STAGES.indexOf(from));
      state.inputHashes=now;state.failures={};state.approval=null;save(p,state);
      return {next:from,message:'입력 변경: 영향 단계부터 다시 실행'};
    }
    for(const checkpoint of state.completed) {
      let current;try {current=artifactHashes(root,checkpoint.stage);}catch{return {next:checkpoint.stage,message:'산출물 없음: 단계 재실행'};}
      if(JSON.stringify(current)!==JSON.stringify(checkpoint.artifactHashes)) return {next:checkpoint.stage,message:'산출물 변경: 다시 검증'};
    }
    const next=STAGES.find(s=>!state.completed.some(c=>c.stage===s));
    return {next:next||'approval',message:next?'미완료 단계부터 진행':'최종 사람 승인 대기'};
  }
  if(action==='record') {
    const input=fs.readFileSync(0,'utf8'),report=JSON.parse(input);
    assert(report.schemaVersion===1&&STAGES.includes(report.stage)&&Array.isArray(report.results),'게이트 보고서 구조 오류');
    assert(report.passed===report.results.every(g=>g.status==='pass'),'보고서 passed 값 불일치');
    const halt=updateFailures(state,report);
    state.approval=null;save(path.join(root,'harness/reports/gates.json'),report);save(p,state);
    return {passed:report.passed,halt,needsQuestion:halt.length>0,results:report.results};
  }
  if(action==='checkpoint') {
    assert(STAGES.includes(stage),'단계 이름 오류');
    const idx=STAGES.indexOf(stage);
    assert(STAGES.slice(0,idx).every(s=>state.completed.some(c=>c.stage===s)),'선행 완료 단계 없음');
    const report=await runGates(root,stage);assert(report.passed,'실패한 단계는 커밋할 수 없음: '+JSON.stringify(report.results));
    const staged=command('git',['diff','--cached','--name-only'],{cwd:root});
    assert(!staged,'기존 스테이징 변경이 있어 자동 커밋 중단. 사용자 변경을 먼저 처리할 것');
    const targets=stageFiles(root,stage);
    assert(targets.length,'산출물 없음');
    command('git',['add','--',...targets],{cwd:root});
    command('git',['commit','--allow-empty','-m','harness: complete '+stage],{cwd:root});
    const commit=command('git',['rev-parse','HEAD'],{cwd:root});
    state.completed=state.completed.filter(c=>STAGES.indexOf(c.stage)<idx);
    state.completed.push({stage,commit,artifactHashes:artifactHashes(root,stage)});
    state.approval=null;save(p,state);save(path.join(root,'harness/reports/gates.json'),report);
    command('git',['add','--','harness/work/state.json','harness/reports/gates.json'],{cwd:root});
    command('git',['commit','-m','harness: record '+stage+' checkpoint'],{cwd:root});
    return {stage,commit,next:STAGES[idx+1]||'approval'};
  }
  if(action==='approve') {
    assert(state.completed.some(c=>c.stage==='app'),'앱 단계 완료 전 승인 불가');
    const report=await runGates(root,'app');assert(report.passed,'최종 승인 시 게이트 재확인 실패');
    const checkpoint=state.completed.find(c=>c.stage==='app');
    assert(JSON.stringify(artifactHashes(root,'app'))===JSON.stringify(checkpoint.artifactHashes),'승인 대상 앱이 완료 커밋 이후 변경됨');
    // 이 명령은 메인이 사용자의 명시적 최종 승인을 받은 후에만 호출한다.
    state.approval={commit:checkpoint.commit,approvedAt:new Date().toISOString()};save(p,state);
    command('git',['add','--','harness/work/state.json'],{cwd:root});
    command('git',['commit','-m','harness: record final user approval'],{cwd:root});
    return {complete:true,commit:checkpoint.commit};
  }
  throw new Error('지원 동작: start | resume | record | checkpoint <stage> | approve');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {const result=await progress(DEFAULT_ROOT,process.argv[2],process.argv[3]);outputJson(result,result.passed===false||result.needsQuestion?1:0);}
  catch(e){outputJson({passed:false,error:e.message},1);}
}
