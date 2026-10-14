import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
export const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const readJson = p => JSON.parse(fs.readFileSync(p,'utf8'));
export const hash = data => crypto.createHash('sha256').update(data).digest('hex');
export function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const result=[];
  for (const item of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    const p=path.join(dir,item.name);
    if (item.isSymbolicLink()) throw new Error('심볼릭 링크는 검사 범위 밖으로 나갈 수 있어 거부: '+p);
    if (item.isDirectory()) result.push(...walk(p)); else if(item.isFile()) result.push(p);
  }
  return result;
}
export function snapshot(root) {
  return Object.fromEntries(['docs','reference'].flatMap(d=>walk(path.join(root,d))).map(p=>[
    path.relative(root,p).split(path.sep).join('/'),hash(fs.readFileSync(p))
  ]).sort(([a],[b])=>a.localeCompare(b)));
}
export function protectionErrors(root,baseline) {
  const now=snapshot(root),errors=[];
  for(const p of new Set([...Object.keys(baseline),...Object.keys(now)]))
    if(baseline[p]!==now[p]) errors.push('읽기 전용 자료 변경: '+p);
  return errors;
}
export function assert(condition,message) { if(!condition) throw new Error(message); }
export function referencePlans(root) {
  const p=path.join(root,'reference/make-export/src/App.tsx');
  const sf=ts.createSourceFile(p,fs.readFileSync(p,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let array;
  const visit=n=>{
    if(ts.isVariableDeclaration(n)&&n.name.getText(sf)==='plans'&&n.initializer) array=n.initializer;
    ts.forEachChild(n,visit);
  };
  visit(sf);
  assert(array&&ts.isArrayLiteralExpression(array),'참고 코드 plans 배열을 정적으로 해석할 수 없음');
  return array.elements.map(e=>{
    assert(ts.isObjectLiteralExpression(e),'요금제는 리터럴 객체여야 함');
    const out={};
    for(const prop of e.properties) if(ts.isPropertyAssignment(prop)) {
      const key=prop.name.getText(sf).replace(/^["']|["']$/g,'');
      if(['id','name','price'].includes(key)) {
        assert(ts.isStringLiteral(prop.initializer)||ts.isNumericLiteral(prop.initializer),'요금제 데이터가 정적 리터럴이 아님');
        out[key==='price'?'monthlyPrice':key]=ts.isNumericLiteral(prop.initializer)?Number(prop.initializer.text):prop.initializer.text;
      }
    }
    assert(typeof out.id==='string'&&typeof out.name==='string'&&Number.isFinite(out.monthlyPrice),'요금제 id/name/price 누락');
    return out;
  });
}
export function command(bin,args,options={}) {
  const r=spawnSync(bin,args,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,...options});
  if(r.error) throw r.error;
  if(r.status!==0) throw new Error(bin+' 종료 코드 '+r.status+': '+(r.stderr||r.stdout).slice(-4000));
  return r.stdout.trim();
}
export function sourceFiles(root) {
  const dir=path.join(root,'app');
  if(!fs.existsSync(dir)) return [];
  function visit(d) {
    return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{
      const p=path.join(d,e.name);
      if(e.isSymbolicLink()) throw new Error('앱 심볼릭 링크 거부: '+p);
      if(e.isDirectory()) return ['node_modules','dist','.next','.git','.cache','coverage'].includes(e.name)?[]:visit(p);
      return e.isFile()&&!e.name.endsWith('.tsbuildinfo')&&!e.name.startsWith('.env')?[p]:[];
    });
  }
  return visit(dir);
}
export function outputJson(report,code) { console.log(JSON.stringify(report,null,2)); process.exitCode=code; }
export function npmCommand() { return process.platform==='win32'?'npm.cmd':'npm'; }
export function runNpm(app,script) {
  // Windows에서 .cmd는 셸이 필요하다. 경로·스크립트 이름은 호출자가 고정한다.
  if(process.platform==='win32') return command(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm.cmd run '+script],{cwd:app});
  return command('npm',['run',script],{cwd:app});
}
