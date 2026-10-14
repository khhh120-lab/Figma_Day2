import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import ts from 'typescript';
import {parse as parseHtml} from 'parse5';
import {readJson,assert,sourceFiles,hash} from './common.mjs';
export const cssName = s => '--'+s.replaceAll('/','-').replaceAll('_','-').toLowerCase();
export function tokenCatalog(root) {
  const doc=readJson(path.join(root,'docs/tokens.json')), entries=new Map(), raw=new Map();
  assert(Array.isArray(doc.tokens)&&Array.isArray(doc.textStyles),'토큰 JSON 구조 오류');
  for(const t of doc.tokens) {
    const id=t.collection+'/'+t.name;
    assert(!raw.has(id),'토큰 id 중복: '+id); raw.set(id,t);
  }
  function resolve(id,seen=new Set()) {
    assert(!seen.has(id),'순환 토큰 별칭: '+id); seen.add(id);
    const t=raw.get(id); assert(t,'없는 토큰: '+id);
    let v=t.values?.[doc.meta?.defaultMode||'Default']; assert(v!==undefined,'기본 모드 값 누락: '+id);
    if(v&&typeof v==='object') {
      assert(typeof v.alias==='string','잘못된 토큰 별칭');
      const actual=resolve(v.alias,seen);
      assert(actual===v.resolved,'별칭 resolved 불일치: '+id); v=actual;
    }
    return v;
  }
  for(const [id,t] of raw) {
    const v=resolve(id), name=cssName(id);
    assert(!entries.has(name),'CSS 변수 이름 충돌: '+name);
    entries.set(name,{id,collection:t.collection,value:typeof v==='number'?v+'px':t.type==='string'?JSON.stringify(v):String(v)});
  }
  const refs=new Set(raw.keys());
  for(const st of doc.textStyles) {
    refs.add('textStyles/'+st.name);
    const properties={ 'font-family':JSON.stringify(st.fontFamily.resolved),'font-size':st.fontSize.resolved+'px',
      'font-weight':String(st.fontWeight),'line-height':st.lineHeight+'px','letter-spacing':st.letterSpacing===0?'0':st.letterSpacing+'%' };
    for(const [prop,value] of Object.entries(properties)) {
      const name=cssName('text/'+st.name+'/'+prop);
      assert(!entries.has(name),'텍스트 스타일 변수 충돌'); entries.set(name,{id:'textStyles/'+st.name,collection:'textStyles',property:prop,value});
    }
  }
  return {doc,entries,refs};
}
export function canonicalTokenCss(root) {
  const {entries}=tokenCatalog(root);
  const fonts=approvedAssets(root).filter(a=>a.family).map(a=>'@font-face {\n  font-family: "Pretendard Variable";\n  src: url("/'+a.path.slice('app/public/'.length)+'") format("woff2");\n  font-weight: 100 900;\n  font-style: normal;\n  font-display: swap;\n}\n').join('');
  return '/* Generated from docs/tokens.json. Do not edit. */\n'+fonts+':root {\n'+
    [...entries].sort(([a],[b])=>a.localeCompare(b)).map(([name,e])=>'  '+name+': '+e.value+';').join('\n')+'\n}\n';
}
export const FONT_SOURCE='https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2';
export function approvedAssets(root) {
  const manifest=path.join(root,'harness/approved-assets.json');
  if(!fs.existsSync(manifest)) return [];
  const doc=readJson(manifest);
  assert(doc.schemaVersion===1&&Array.isArray(doc.assets),'승인 자산 구조 오류');
  const seen=new Set();
  const verify=a=>{
    assert(typeof a.path==='string'&&/^app\/public\/fonts\/[A-Za-z0-9_.-]+$/.test(a.path),'승인 자산 경로 탈출 거부');
    assert(!seen.has(a.path),'승인 자산 중복');seen.add(a.path);
    assert(/^[a-f0-9]{64}$/.test(a.sha256),'승인 자산 SHA 오류');
    const p=path.join(root,a.path);
    assert(fs.existsSync(p)&&!fs.lstatSync(p).isSymbolicLink(),'승인 자산 누락·symlink');
    assert(hash(fs.readFileSync(p))===a.sha256,'승인 자산 SHA 불일치: '+a.path);
  };
  for(const a of doc.assets) {
    verify(a);
    assert(a.path==='app/public/fonts/PretendardVariable.woff2'&&a.source===FONT_SOURCE&&a.family==='Pretendard Variable'&&a.weight==='100 900'&&a.style==='normal'&&a.display==='swap','공식 폰트 승인 메타데이터 불일치');
    assert(a.sha256==='9599f12fd42fc0bce1cd50b47a0c022e108d7aa64dd0d1bb0ed44f3282d900b4','공식 승인 폰트 해시 불일치');
    assert(fs.readFileSync(path.join(root,a.path)).subarray(0,4).toString()==='wOF2','실제 WOFF2 폰트 필요');
    if(a.license) verify(a.license);
    if(a.licensePath) verify({path:a.licensePath,sha256:a.licenseSha256});
  }
  return doc.assets;
}
export function verifiedTailwind(root,dependencyRoot=root) {
  const pkg=readJson(path.join(root,'app/package.json'));
  assert(pkg.dependencies?.tailwindcss||pkg.devDependencies?.tailwindcss,'Tailwind 의존성 누락');
  const lock=readJson(path.join(root,'app/package-lock.json'));
  const locked=lock.packages?.['node_modules/tailwindcss']?.version;
  const installed=readJson(path.join(dependencyRoot,'app/node_modules/tailwindcss/package.json')).version;
  assert(typeof locked==='string'&&/^4\./.test(locked)&&installed===locked,'Tailwind v4 실제 설치·lock 버전 불일치');
  const declared=lock.packages?.['']?.dependencies?.tailwindcss||lock.packages?.['']?.devDependencies?.tailwindcss;
  assert(declared===(pkg.dependencies?.tailwindcss||pkg.devDependencies?.tailwindcss),'Tailwind package·lock 선언 불일치');
  return true;
}
const layoutProps=new Set(['display','position','overflow','overflow-x','overflow-y','flex-direction','flex-wrap','align-items','align-self','align-content','justify-content','justify-items','justify-self','box-sizing','text-align','white-space','word-break','overflow-wrap','cursor','pointer-events','visibility','object-fit','object-position','appearance','user-select','text-decoration','text-transform','border-style','outline-style','list-style','list-style-type','isolation','grid-auto-flow','font-display']);
const keywords=new Set(['0','auto','inherit','initial','unset','none','normal','currentcolor','transparent','100%','min-content','max-content','fit-content']);
const allowedColorCollections=new Set(['semantic']);
function roleError(prop,entry) {
  if(prop.includes('color')||['background','fill','stroke','border','border-top','border-bottom','outline','box-shadow'].includes(prop)) {
    if(entry.collection==='primitive') return 'primitive 색 직접 사용 금지';
  }
  if(prop.includes('radius')&&entry.collection!=='radius') return 'radius 토큰 필요';
  if(['font-size','font-family','font-weight','line-height','letter-spacing'].includes(prop)&&(entry.collection!=='textStyles'||entry.property!==prop)) return '대응하는 텍스트 스타일 변수 필요';
  return null;
}
export function valueErrors(prop,value,entries) {
  const errors=[];
  const ast=valueParser(value);
  function visit(nodes) {
    for(const node of nodes) {
      if(node.type==='space'||node.type==='comment'||node.type==='div') continue;
      if(node.type==='function') {
        if(node.value==='var') {
          const args=node.nodes.filter(n=>n.type!=='space'&&n.type!=='comment');
          if(args.length!==1||args[0].type!=='word') { errors.push('var fallback·동적 변수 금지'); continue; }
          const e=entries.get(args[0].value);
          if(!e) errors.push('없는 토큰 변수: '+args[0].value);
          else {const err=roleError(prop,e); if(err) errors.push(err);}
        } else if(['calc','min','max','clamp','repeat','minmax'].includes(node.value)) {
          if(['repeat','minmax'].includes(node.value)&&!prop.startsWith('grid-')) errors.push('grid 함수는 grid 속성만 허용');
          visit(node.nodes);
        } else if(node.value==='url') {
          // 로컬 자산은 별도의 자산 출처 검사로 검증한다.
          if(!['background','background-image','mask','mask-image','src'].includes(prop)) errors.push('url 허용 속성 아님');
          const u=valueParser.stringify(node.nodes).replace(/^['"]|['"]$/g,'');
          if(!u||/^([a-z]+:|\/\/)/i.test(u)) errors.push('외부·data URL 금지');
        } else errors.push('토큰 밖 함수: '+node.value);
      } else if(node.type==='word') {
        const v=node.value.toLowerCase();
        if(keywords.has(v)||/^[+*/-]$/.test(v)) continue;
        // 숫자가 있는 레이아웃 예외도 무제한 허용하지 않는다.
        if(['flex','flex-grow','flex-shrink','order','grid-column','grid-row'].includes(prop)&&['1','0'].includes(v)) continue;
        if(prop.startsWith('grid-template')&&['1','1fr'].includes(v)) continue;
        if(prop.startsWith('grid-')&&['repeat','auto-fit','auto-fill'].includes(v)) continue;
        if(layoutProps.has(prop)&&/^[a-z-]+$/.test(v)) continue;
        if(['border','border-top','border-right','border-bottom','border-left','outline'].includes(prop)&&['solid','dashed','dotted'].includes(v)) continue;
        if(['background','background-image','mask','mask-image'].includes(prop)&&['no-repeat','repeat','center','cover','contain'].includes(v)) continue;
        errors.push('토큰 밖 값: '+node.value);
      } else errors.push('토큰 밖 리터럴: '+node.value);
    }
  }
  visit(ast.nodes); return errors;
}
export function inspectStyles(root,{dependencyRoot=root}={}) {
  const {entries}=tokenCatalog(root), errors=[];
  const tokenFile=path.join(root,'app/src/tokens.css');
  if(!fs.existsSync(tokenFile)) errors.push('생성된 app/src/tokens.css 없음');
  else if(fs.readFileSync(tokenFile,'utf8').replaceAll('\r\n','\n')!==canonicalTokenCss(root)) errors.push('tokens.css가 원본 토큰의 정확한 생성 결과가 아님');
  const files=sourceFiles(root);
  for(const p of files.filter(p=>/\.(scss|sass|less|styl)$/.test(p))) errors.push(p+': 미검사 스타일 언어 금지');
  const cssFiles=files.filter(p=>p.endsWith('.css'));
  let importedTokens=false;
  for(const p of cssFiles) {
    if(p===tokenFile) continue;
    try {
      const ast=postcss.parse(fs.readFileSync(p,'utf8'),{from:p});
      ast.walkDecls(d=>{
        if(d.prop.startsWith('--')) errors.push(p+': 사용자 정의 변수 금지: '+d.prop);
        else for(const e of valueErrors(d.prop.toLowerCase(),d.value,entries)) errors.push(p+':'+d.source.start.line+' '+e);
      });
      ast.walkAtRules(a=>{
        if(a.name==='import') {
          if(a.params==='"tailwindcss"'||a.params==="'tailwindcss'") {
            try{verifiedTailwind(root,dependencyRoot);}catch(e){errors.push(p+': '+e.message);} return;
          }
          const match=a.params.match(/^["']([^"']+)["']$/);
          if(!match||!fs.existsSync(path.resolve(path.dirname(p),match[1]))||!path.resolve(path.dirname(p),match[1]).startsWith(path.join(root,'app')+path.sep)) errors.push(p+': 외부·미검사 CSS import 거부');
          else if(path.resolve(path.dirname(p),match[1])===tokenFile) importedTokens=true;
        } else if(a.name==='media') {
          if(!/^(?:screen|all|print|\(prefers-reduced-motion:\s*(?:reduce|no-preference)\))$/.test(a.params)) errors.push(p+': 미지원·토큰 밖 media 조건');
        } else if(a.name==='supports') {
          if(!/^\(display:\s*(?:grid|flex)\)$/.test(a.params)) errors.push(p+': 미지원 supports 조건');
        } else if(a.name!=='font-face') errors.push(p+': 미지원 CSS at-rule: '+a.name);
      });
      ast.walkRules(r=>{if(/:export/.test(r.selector)) errors.push(p+': CSS export 우회 금지');});
    }catch(e){errors.push(p+': CSS 해석 실패: '+e.message);}
  }
  for(const p of files.filter(p=>/\.[cm]?[jt]sx?$/.test(p))) {
    const source=fs.readFileSync(p,'utf8');
    const sf=ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true,p.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    const visit=n=>{
      if(ts.isJsxAttribute(n)) {
        const name=n.name.getText(sf);
        if(['style','dangerouslySetInnerHTML'].includes(name)) errors.push(p+': inline style·HTML 주입 금지');
        if(['width','height','size','strokeWidth','fill','stroke','color','bgcolor'].includes(name)) errors.push(p+': 디자인 JSX 속성 대신 토큰 CSS 사용');
        if(name==='className'&&n.initializer) {
          const text=n.initializer.getText(sf);
          if(/(?:\[[^\]]+\]|(?:^|[\s"'`])(?:p[xytrbl]?|m[xytrbl]?|gap|w|h|text|bg|rounded|border|leading|tracking|font)-[a-z0-9]+)/.test(text)) errors.push(p+': 숫자·디자인 utility 대신 검사된 CSS 클래스 사용');
        }
      }
      if(ts.isJsxSpreadAttribute(n)) errors.push(p+': JSX spread는 style 우회를 검사할 수 없어 거부');
      if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)) {
        if(['style','link','iframe'].includes(n.tagName.getText(sf))) errors.push(p+': 동적 스타일·외부 문서 요소 금지');
      }
      if(ts.isPropertyAccessExpression(n)&&['style','cssText','insertRule','setProperty','adoptedStyleSheets'].includes(n.name.text)) errors.push(p+': 동적 CSS API 금지');
      if(ts.isTaggedTemplateExpression(n)) errors.push(p+': tagged template 스타일 우회 금지');
      if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)) {
        const imp=n.moduleSpecifier.text;
        if(imp.endsWith('.css')) {
          const target=path.resolve(path.dirname(p),imp);
          if(!imp.startsWith('.')||!cssFiles.includes(target)) errors.push(p+': 외부 CSS import 금지');
          if(target===tokenFile) importedTokens=true;
        }
        if(/(?:styled-components|emotion|styled-jsx|tailwind)/.test(imp)) errors.push(p+': 검사 밖 스타일 생성기 금지');
      }
      ts.forEachChild(n,visit);
    }; visit(sf);
  }
  for(const p of files.filter(p=>p.endsWith('.html'))) {
    const ast=parseHtml(fs.readFileSync(p,'utf8'));
    const visit=n=>{
      if(n.tagName==='script'&&!(n.attrs||[]).some(a=>a.name==='src')&&(n.childNodes||[]).some(c=>c.value?.trim())) errors.push(p+': inline script 금지');
      if(n.tagName==='style'||n.tagName==='iframe') errors.push(p+': 미검사 스타일·문서 금지');
      for(const a of n.attrs||[]) if(a.name==='style') errors.push(p+': HTML inline style 금지');
      if(n.tagName==='link') {
        const attrs=Object.fromEntries((n.attrs||[]).map(a=>[a.name,a.value]));
        if(attrs.rel==='stylesheet') {
          const candidate=path.join(root,'app',attrs.href.replace(/^\//,''));
          if(!cssFiles.includes(candidate)) errors.push(p+': 외부 HTML stylesheet 금지');
          if(candidate===tokenFile) importedTokens=true;
        }
      }
      for(const c of n.childNodes||[]) visit(c);
    }; visit(ast);
  }
  if(!importedTokens) errors.push('tokens.css를 앱에서 import해야 함');
  // 새 SVG의 하드코딩 색과 임의 외부 스타일 자산을 막는다. 원본 참고 자산은 바이트 동일할 때만 허용.
  const statePath=path.join(root,'harness/work/state.json');
  const baseline=fs.existsSync(statePath)?readJson(statePath).inputHashes:readJson(path.join(root,'harness/input-baseline.json'));
  const trusted=new Set(Object.entries(baseline).filter(([p])=>p.startsWith('reference/make-export/public/')).map(([,v])=>v));
  for(const a of approvedAssets(root)) trusted.add(a.sha256);
  for(const p of files.filter(p=>/\.(?:svg|woff2?|ttf|otf|png|jpe?g|webp|gif)$/i.test(p))) {
    const data=fs.readFileSync(p);
    if(data.subarray(0,40).toString().startsWith('version https://git-lfs.github.com')) errors.push(p+': LFS 포인터는 실제 자산이 아님');
    else if(!trusted.has(hash(data))) errors.push(p+': 참고 자료와 바이트가 다른 자산은 승인 필요');
  }
  return errors;
}
