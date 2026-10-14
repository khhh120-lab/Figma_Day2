import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
const realRequire=createRequire(import.meta.url);
const appRoot=path.resolve(import.meta.dirname,'..');
function load(file) {
 const source=fs.readFileSync(file,'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const loadedModule={exports:{}};
 const require=name=>name==='next/navigation'?{useRouter:()=>({push(){}})}:name==='server-only'?{}:name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):realRequire(name);
 const run=vm.runInThisContext('(function(require,module,exports){'+js+'\n})',{filename:file});
 run(require,loadedModule,loadedModule.exports);return loadedModule.exports;
}
const {saveApplication}=load(path.join(appRoot,'src/server/applications.ts'));
const env={NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_mock_only'};
const valid={requestId:'00000000-0000-4000-8000-000000000001',planId:'light',name:'테스트',phone:'010-1234-5678',agreed:true};
const request=(body=valid,headers={})=>new Request('https://app.example/api/applications',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
const now=()=>new Date('2026-10-14T01:00:00.000Z');
const saved={id:'00000000-0000-4000-8000-000000000001',application_number:'UP-MOCK',created_at:'2026-10-14T01:00:01.000Z',plan_id:'light',plan_name:'라이트 30',monthly_price:49000};
test('서버 원본 가격과 DB 번호·시각 사용, 신규 secret은 apikey만 전달',async()=>{
 let calls=0;
 const response=await saveApplication(request({...valid,price:1,planName:'위조'}),{env,now,fetcher:async(url,options)=>{
  calls++;assert.equal(url.origin,'https://example.supabase.co');assert.equal(url.pathname,'/rest/v1/applications');assert.equal(options.headers.apikey,env.SUPABASE_SECRET_KEY);assert.equal(options.headers.Authorization,undefined);
  const row=JSON.parse(options.body);assert.equal(row.monthly_price,49000);assert.equal(row.plan_name,'라이트 30');assert.equal(row.phone_number,'01012345678');assert.equal(row.privacy_agreed_at,now().toISOString());assert.equal(row.privacy_policy_version,'v1');assert.equal(row.application_number,undefined);assert.equal(row.created_at,undefined);assert.equal(options.redirect,'error');assert.ok(options.signal);return Response.json([saved]);
 }});
 assert.equal(response.status,201);assert.equal(calls,1);assert.deepEqual(await response.json(),{id:saved.id,number:'UP-MOCK',createdAt:saved.created_at,planId:'light',planName:'라이트 30',price:49000});
});
test('유효하지 않은 입력은 DB 호출 전 차단',async()=>{
 for(const body of [{...valid,planId:'unknown'},{...valid,name:'가'},{...valid,name:'가1'},{...valid,name:'가'.repeat(101)},{...valid,phone:'010'},{...valid,phone:'010123456789'},{...valid,agreed:false}]) {
  const response=await saveApplication(request(body),{env,fetcher:()=>{throw new Error('DB를 호출하면 안 됨');}});assert.equal(response.status,400);
 }
});
test('교차 출처·과도 본문·비JSON 거부',async()=>{
 assert.equal((await saveApplication(request(valid,{origin:'https://elsewhere.example'}),{env})).status,403);
 assert.equal((await saveApplication(request({...valid,extra:'x'.repeat(4097)}),{env})).status,413);
 assert.equal((await saveApplication(request(valid,{'Content-Type':'text/plain'}),{env})).status,415);
});
test('DB 실패·네트워크 예외가 비밀/개인정보를 응답에 노출하지 않음',async()=>{
 for(const fetcher of [async()=>new Response('secret mock applicant', {status:403}),async()=>{throw new Error('secret mock applicant');}]) {
  const response=await saveApplication(request(),{env,fetcher});assert.equal(response.status,502);const text=await response.text();assert.ok(!text.includes('secret'));assert.ok(!text.includes('테스트'));assert.ok(!text.includes('010'));
 }
});
test('불완전하거나 다른 요금제인 DB 반환은 성공으로 처리하지 않음',async()=>{
 for(const row of [[],[{...saved,monthly_price:1}],[{...saved,created_at:'invalid'}]])assert.equal((await saveApplication(request(),{env,fetcher:async()=>Response.json(row)})).status,502);
});
test('설정 없음·publishable 서버키·HTTP URL은 DB 요청 없이 실패',async()=>{
 for(const changed of [{...env,SUPABASE_SECRET_KEY:''},{...env,SUPABASE_SECRET_KEY:'sb_publishable_mock'},{...env,NEXT_PUBLIC_SUPABASE_URL:'http://example.supabase.co'}])assert.equal((await saveApplication(request(),{env:changed,fetcher:()=>{throw new Error('DB 호출 금지');}})).status,503);
});
test('레거시 service_role JWT만 Bearer 지원',async()=>{
 for(const role of ['service_role','anon']) {
  const key='eyJmock.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature';
  const response=await saveApplication(request(),{env:{...env,SUPABASE_SECRET_KEY:key},fetcher:async(url,options)=>{assert.equal(role,'service_role');assert.equal(options.headers.Authorization,'Bearer '+key);return Response.json([saved]);}});
  assert.equal(response.status,role==='service_role'?201:503);
 }
});

test('실제 Host와 동일한 127.0.0.1 Origin은 내부 localhost URL과 달라도 허용',async()=>{
 const req=new Request('http://localhost:60017/api/applications',{method:'POST',headers:{'Content-Type':'application/json',Host:'127.0.0.1:60017',Origin:'http://127.0.0.1:60017'},body:JSON.stringify(valid)});
 assert.equal((await saveApplication(req,{env,fetcher:async()=>Response.json([saved])})).status,201);
 const bad=new Request('http://localhost:60017/api/applications',{method:'POST',headers:{'Content-Type':'application/json',Host:'127.0.0.1:60017',Origin:'http://evil.example'},body:JSON.stringify(valid)});
 assert.equal((await saveApplication(bad,{env})).status,403);
});
test('응답 유실 후 동일 요청 UUID는 기존 1건만 반환',async()=>{
 let rows=0;let attempts=0;
 const fetcher=async(url,options)=>{
  if(options.method==='POST') {
   const body=JSON.parse(options.body);assert.equal(body.id,valid.requestId);attempts++;
   if(attempts===1){rows++;throw new Error('INSERT 성공 후 응답 유실');}
   return new Response('',{status:409});
  }
  assert.equal(url.searchParams.get('id'),'eq.'+valid.requestId);
  return Response.json([{...saved,applicant_name:valid.name,phone_number:'01012345678',privacy_agreed:true,privacy_policy_version:'v1'}]);
 };
 assert.equal((await saveApplication(request(),{env,fetcher})).status,502);
 assert.equal((await saveApplication(request(),{env,fetcher})).status,201);
 assert.equal(rows,1);
});
test('같은 UUID를 다른 개인정보로 재사용하면 기존 내역을 반환하지 않음',async()=>{
 const fetcher=async(url,options)=>options.method==='POST'?new Response('',{status:409}):Response.json([{...saved,applicant_name:'다른사람',phone_number:'01012345678',privacy_agreed:true,privacy_policy_version:'v1'}]);
 const response=await saveApplication(request(),{env,fetcher});assert.equal(response.status,409);assert.ok(!(await response.text()).includes('다른사람'));
});
test('스트림을 4096 bytes에서 중단하고 Content-Length도 먼저 검사',async()=>{
 let cancelled=false;
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(4096));controller.enqueue(new Uint8Array(1));},cancel(){cancelled=true;}});
 const req=new Request('https://app.example/api/applications',{method:'POST',headers:{'Content-Type':'application/json'},body:stream,duplex:'half'});
 assert.equal((await saveApplication(req,{env})).status,413);assert.equal(cancelled,true);
 assert.equal((await saveApplication(request(valid,{'Content-Length':'5000'}),{env})).status,413);
 assert.equal((await saveApplication(request({...valid,extra:'가'.repeat(1400)}),{env})).status,413);
});
test('완료 직접 접근은 가짜 신청 성공/번호 없이 실제 빈 상태 표시',()=>{
 const {EmptyCompleteScreen}=load(path.join(appRoot,'src/components/screens.tsx'));
 const html=renderToStaticMarkup(createElement(EmptyCompleteScreen));
 assert.ok(html.includes('신청 내역이 없습니다'));assert.ok(html.includes('data-screen="complete"'));assert.ok(html.includes('요금제 더 보기'));
 assert.ok(!html.includes('구독 신청이 완료됐어요'));assert.ok(!html.includes('completed-plan'));assert.ok(!html.includes('UP20250616'));
});

test('실제 RoutedScreen이 신청 context 없는 완료 경로를 빈 상태로 연결',()=>{
 const {ApplicationProvider,RoutedScreen}=load(path.join(appRoot,'src/components/screens.tsx'));
 const html=renderToStaticMarkup(createElement(ApplicationProvider,null,createElement(RoutedScreen,{screen:'complete'})));
 assert.ok(html.includes('신청 내역이 없습니다'));assert.ok(html.includes('data-screen="complete"'));
 assert.ok(!html.includes('UP20250616'));assert.ok(!html.includes('구독 신청이 완료됐어요'));assert.ok(!html.includes('completed-plan'));
});
