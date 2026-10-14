import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {SCREENS,VIEWPORT} from './contract.mjs';
import {assert,referencePlans,readJson} from './common.mjs';
async function freePort() {
  const server=net.createServer();
  await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve)); return port;
}
export async function exerciseBrowser(baseURL,plans,launchOptions={}) {
  const browser=await chromium.launch({headless:true,...launchOptions});
  const errors=[];
  try {
    const page=await browser.newPage({viewport:VIEWPORT});
    const pageErrors=[];
    page.on('pageerror',e=>pageErrors.push(e.message));
    async function screen(id) {
      await page.waitForSelector('main[data-screen="'+id+'"]',{state:'visible',timeout:10000});
      assert(await page.locator('main[data-screen]').count()===1,'렌더링된 화면 루트가 정확히 1개 아님');
      const current=await page.locator('main[data-screen]').getAttribute('data-screen');
      assert(current===id,'직접 접근의 화면 id 불일치');
      const registry=await page.evaluate(()=>window.__HARNESS_ROUTES__);
      assert(Array.isArray(registry)&&registry.length===4,'실제 라우트 레지스트리가 정확히 4개 아님');
      const actual=registry.map(x=>x.id+':'+x.route).sort();
      assert(JSON.stringify(actual)===JSON.stringify(SCREENS.map(x=>x.id+':'+x.route).sort()),'실제 라우트 패턴 불일치');
      const overflow=await page.evaluate(()=>{
        const root=document.documentElement;
        const scroll=Math.max(root.scrollWidth,document.body.scrollWidth)-innerWidth;
        const rects=[...document.querySelectorAll('body *')].filter(e=>{
          const s=getComputedStyle(e); return s.display!=='none'&&s.visibility!=='hidden'&&e.getClientRects().length;
        }).map(e=>e.getBoundingClientRect());
        return Math.max(0,scroll,...rects.map(r=>Math.max(0,-r.left,r.right-innerWidth)));
      });
      assert(overflow===0,'가로 넘침 '+overflow+'px');
    }
    async function value(id,plan) {
      const node=page.locator('[data-testid="'+id+'"]');
      assert(await node.count()===1&&await node.isVisible(),'선택 요금제 표시가 1개·visible이어야 함');
      assert(await node.getAttribute('data-plan-id')===plan.id,'요금제 id 불일치');
      assert((await node.innerText()).includes(plan.name),'실제 화면의 요금제 이름 불일치');
      const amount=page.locator('[data-testid="monthly-price"]');
      assert(await amount.count()===1&&await amount.isVisible(),'월 요금 검사 요소 누락·숨김');
      assert(await amount.getAttribute('data-amount')===String(plan.monthlyPrice),'월 요금 데이터 불일치');
      const text=await amount.innerText();
      assert(text.replaceAll(',','').includes(String(plan.monthlyPrice)),'실제 월 요금 텍스트 불일치');
    }
    const routes=[
      ['/plans','plans'],['/plans/'+encodeURIComponent(plans[0].id),'detail'],
      ['/apply?plan='+encodeURIComponent(plans[0].id),'apply'],['/complete','complete']
    ];
    for(const [url,id] of routes) {
      try { await page.goto(baseURL+url); await screen(id); }
      catch(e){errors.push('직접 접근 '+url+': '+e.message);}
    }
    for(const plan of plans) {
      try {
        await page.goto(baseURL+'/plans'); await screen('plans');
        const card=page.locator('[data-testid="plan-card"][data-plan-id="'+plan.id+'"]');
        assert(await card.count()===1,'기본 목록 요금제 카드 누락·중복: '+plan.id);
        await card.getByRole('button',{name:'자세히',exact:true}).click();
        await screen('detail'); await value('selected-plan',plan);
        await page.getByRole('button',{name:'구독 신청하기',exact:true}).click();
        await screen('apply'); await value('selected-plan',plan);
        await page.getByLabel('이름',{exact:true}).fill('홍길동');
        await page.getByLabel('휴대폰 번호',{exact:true}).fill('01012345678');
        const check=page.getByRole('checkbox'); assert(await check.count()===1,'개인정보 checkbox 수 오류');
        await check.check();
        const submit=page.getByRole('button',{name:'신청하기',exact:true});
        assert(await submit.isEnabled(),'유효한 신청 버튼 비활성');
        await submit.click(); await screen('complete'); await value('completed-plan',plan);
      }catch(e){errors.push('신청 데이터 보존 '+plan.id+': '+e.message);}
    }
    errors.push(...pageErrors.map(e=>'브라우저 오류: '+e));
    return errors;
  } finally {await browser.close();}
}
export async function inspectBrowser(root) {
  const app=path.join(root,'app'),pkg=readJson(path.join(app,'package.json'));
  assert(typeof pkg.scripts?.dev==='string'&&pkg.scripts.dev.trim(),'dev 명령 없음');
  const port=await freePort(),baseURL='http://127.0.0.1:'+port;
  const win=process.platform==='win32';
  const server=win?spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm.cmd run dev -- --host 127.0.0.1 --port '+port],{cwd:app,stdio:'pipe',windowsHide:true}):
    spawn('npm',['run','dev','--','--host','127.0.0.1','--port',String(port)],{cwd:app,stdio:'pipe'});
  let log='',spawnError;
  server.on('error',e=>{spawnError=e;});
  server.stdout.on('data',b=>log=(log+b).slice(-6000));server.stderr.on('data',b=>log=(log+b).slice(-6000));
  try {
    let ready=false;
    for(let i=0;i<60;i++) {
      if(spawnError) throw spawnError;
      if(server.exitCode!==null) throw new Error('dev 서버 종료: '+log);
      try { const r=await fetch(baseURL,{signal:AbortSignal.timeout(800)}); if(r.ok){ready=true;break;} }catch{}
      await new Promise(r=>setTimeout(r,500));
    }
    assert(ready,'dev 서버 준비 실패: '+log);
    const executable=process.env.HARNESS_BROWSER;
    const chrome=win?'C:/Program Files/Google/Chrome/Application/chrome.exe':null;
    const options=executable?{executablePath:executable}:chrome&&fs.existsSync(chrome)?{executablePath:chrome}:{};
    return await exerciseBrowser(baseURL,referencePlans(root),options);
  } finally {
    if(win&&server.pid) {
      const {spawnSync}=await import('node:child_process');
      spawnSync('taskkill',['/pid',String(server.pid),'/t','/f'],{stdio:'ignore',windowsHide:true});
    }else server.kill('SIGTERM');
  }
}
