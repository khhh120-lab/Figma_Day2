import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {DEFAULT_ROOT,readJson,protectionErrors,assert,outputJson,hash} from './common.mjs';
import {inspectStyles} from './token-check.mjs';
function git(root,args,encoding='utf8') {
  const r=spawnSync('git',args,{cwd:root,encoding,maxBuffer:32*1024*1024,timeout:30000});
  if(r.error||r.status!==0) throw r.error||new Error('git 실패: '+r.stderr);
  return r.stdout;
}
export function inspectCommit(root) {
  const errors=[];
  const staged=git(root,['diff','--cached','--name-only','-z']).split('\0').filter(Boolean);
  const statePath=path.join(root,'harness/work/state.json');
  const state=fs.existsSync(statePath)?readJson(statePath):null;
  const baseline=state?.inputHashes||readJson(path.join(root,'harness/input-baseline.json'));
  for(const p of staged) if(p.startsWith('docs/')||p.startsWith('reference/')) {
    const approved=p==='docs/tokens.json'&&state?.userDecisions?.tokenWriteException?.path===p&&
      hash(git(root,['show',':'+p],null))===baseline[p]&&hash(fs.readFileSync(path.join(root,p)))===baseline[p];
    if(!approved) errors.push('읽기 전용 파일 스테이징 금지: '+p);
  }
  errors.push(...protectionErrors(root,baseline));
  if(!staged.some(p=>p.startsWith('app/'))) return errors;
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'uplus-harness-index-'));
  try {
    fs.mkdirSync(path.join(temp,'docs'),{recursive:true});fs.mkdirSync(path.join(temp,'harness'),{recursive:true});
    fs.copyFileSync(path.join(root,'docs/tokens.json'),path.join(temp,'docs/tokens.json'));
    fs.writeFileSync(path.join(temp,'harness/input-baseline.json'),JSON.stringify(baseline));
    const manifest='harness/approved-assets.json';
    if(fs.existsSync(path.join(root,manifest))) {
      const data=git(root,['show',':'+manifest],null);
      assert(hash(data)===hash(fs.readFileSync(path.join(root,manifest))),'승인 자산 manifest의 index·작업폴더 불일치');
      fs.writeFileSync(path.join(temp,manifest),data);
    }
    const paths=git(root,['ls-files','--cached','-z','--','app/']).split('\0').filter(Boolean);
    for(const rel of paths) {
      assert(!rel.split('/').includes('..'),'Git 경로 탈출 거부');
      const mode=git(root,['ls-files','--stage','--',rel]);
      assert(!mode.startsWith('120000')&&!mode.startsWith('160000'),'앱 symlink·submodule 거부');
      const target=path.join(temp,rel);fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.writeFileSync(target,git(root,['show',':'+rel],null));
    }
    errors.push(...inspectStyles(temp,{dependencyRoot:root}));
  } finally {
    const resolved=path.resolve(temp),allowed=path.resolve(os.tmpdir())+path.sep;
    assert(resolved.startsWith(allowed)&&path.basename(resolved).startsWith('uplus-harness-index-'),'임시 삭제 경로 검증 실패');
    fs.rmSync(resolved,{recursive:true,force:true});
  }
  return errors;
}
export function main(root=DEFAULT_ROOT) {
  try {const errors=inspectCommit(root);outputJson({gate:'pre-commit',passed:errors.length===0,errors},errors.length?1:0);}
  catch(e){outputJson({gate:'pre-commit',passed:false,errors:[e.message]},1);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) main();
