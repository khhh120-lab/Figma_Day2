import "server-only";
import {plans} from "../lib/plans";

// 현재 화면의 개인정보 수집·이용 동의 문구에 붙인 내부 최초 버전입니다.
// 법적 검토를 마친 정책이라는 의미가 아니며, 문구 변경 시 버전을 올립니다.
export const PRIVACY_POLICY_VERSION = "v1";
type Dependencies = {env?:NodeJS.ProcessEnv; fetcher?:typeof fetch; now?:()=>Date};
const reply=(status:number,error:string)=>Response.json({error},{status,headers:{"Cache-Control":"no-store"}});
export async function saveApplication(request:Request, dependencies:Dependencies={}) {
  const origin=request.headers.get("origin");
  if (origin) {
    try {
      const requestUrl=new URL(request.url);
      const host=request.headers.get("host")??requestUrl.host;
      if (!host || /[\s,@/\\?#]/.test(host)) return reply(403,"요청을 처리할 수 없습니다.");
      const expected=new URL(requestUrl.protocol+"//"+host);
      const incoming=new URL(origin);
      if (incoming.origin!==expected.origin || origin!==incoming.origin) return reply(403,"요청을 처리할 수 없습니다.");
    } catch { return reply(403,"요청을 처리할 수 없습니다."); }
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply(415,"JSON 요청이 필요합니다.");
  let input:Record<string,unknown>;
  try {
    const length=request.headers.get("content-length");
    if (length && (/^[0-9]+$/.test(length)===false || Number(length)>4096)) return reply(413,"요청이 너무 큽니다.");
    const reader=request.body?.getReader();
    if (!reader) return reply(400,"신청 정보를 확인해주세요.");
    const chunks:Uint8Array[]=[];
    let size=0;
    try {
      while (true) {
        const part=await reader.read();
        if (part.done) break;
        size+=part.value.byteLength;
        if (size>4096) { await reader.cancel(); return reply(413,"요청이 너무 큽니다."); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    const bytes=new Uint8Array(size);
    let offset=0;
    for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
    const parsed:unknown=JSON.parse(text);
    if (!parsed || typeof parsed!=="object" || Array.isArray(parsed)) return reply(400,"신청 정보를 확인해주세요.");
    input=parsed as Record<string,unknown>;
  } catch { return reply(400,"신청 정보를 확인해주세요."); }
  const requestId=typeof input.requestId==="string"?input.requestId.toLowerCase():"";
  const plan=plans.find(plan=>plan.id===input.planId);
  const name=typeof input.name==="string"?input.name.trim():"";
  const phone=typeof input.phone==="string"?input.phone.replaceAll("-",""):"";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId) || !plan || name.length<2 || name.length>100 || !/^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z\s]+$/.test(name) || !/^[0-9]{10,11}$/.test(phone) || input.agreed!==true) return reply(400,"신청 정보를 확인해주세요.");
  const env=dependencies.env??process.env;
  const key=env.SUPABASE_SECRET_KEY?.trim();
  let url:URL;
  try {
    url=new URL(env.NEXT_PUBLIC_SUPABASE_URL??"");
    if (url.protocol!=="https:" || url.username || url.password || url.pathname!=="/" || url.search || url.hash) return reply(503,"신청 저장 설정을 확인해주세요.");
  } catch { return reply(503,"신청 저장 설정을 확인해주세요."); }
  const legacy=Boolean(key && /^eyJ[^.]+\.[^.]+\.[^.]+$/.test(key));
  if (!key || (!key.startsWith("sb_secret_") && !legacy)) return reply(503,"신청 저장 설정을 확인해주세요.");
  const headers:Record<string,string>={apikey:key,"Content-Type":"application/json",Prefer:"return=representation"};
  // 신규 secret은 apikey만 사용합니다. 레거시 service_role JWT만 Bearer로 전달합니다.
  if (legacy) {
    try {
      const payload=JSON.parse(Buffer.from(key.split(".")[1],"base64url").toString());
      if (payload.role!=="service_role") return reply(503,"신청 저장 설정을 확인해주세요.");
    } catch { return reply(503,"신청 저장 설정을 확인해주세요."); }
    headers.Authorization="Bearer "+key;
  }
  const body={id:requestId,plan_id:plan.id,plan_name:plan.name,monthly_price:plan.price,applicant_name:name,phone_number:phone,privacy_agreed:true,privacy_agreed_at:(dependencies.now??(()=>new Date()))().toISOString(),privacy_policy_version:PRIVACY_POLICY_VERSION};
  try {
    url.pathname="/rest/v1/applications";
    url.search="?select=id,application_number,created_at,plan_id,plan_name,monthly_price";
    const response=await (dependencies.fetcher??fetch)(url,{method:"POST",headers,body:JSON.stringify(body),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)});
    let result:unknown;
    if (response.status===409) {
      // 응답 유실 후 동일 UUID 재시도는 기존 한 건을 반환합니다. 다른 입력으로 UUID를 재사용하면 거부합니다.
      url.search="?id=eq."+requestId+"&select=id,application_number,created_at,plan_id,plan_name,monthly_price,applicant_name,phone_number,privacy_agreed,privacy_policy_version&limit=1";
      const lookup=await (dependencies.fetcher??fetch)(url,{method:"GET",headers,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)});
      if (!lookup.ok) return reply(502,"저장 결과를 확인하지 못했습니다.");
      result=await lookup.json();
      const existing=Array.isArray(result)&&result.length===1?result[0]:null;
      if (!existing || existing.id!==requestId || existing.plan_id!==plan.id || existing.plan_name!==plan.name || existing.monthly_price!==plan.price || existing.applicant_name!==name || existing.phone_number!==phone || existing.privacy_agreed!==true || existing.privacy_policy_version!==PRIVACY_POLICY_VERSION) return reply(409,"동일 신청 요청의 정보가 일치하지 않습니다.");
    } else {
      if (!response.ok) return reply(502,"신청 정보를 저장하지 못했습니다.");
      result=await response.json();
    }
    const saved=Array.isArray(result)&&result.length===1?result[0]:null;
    if (!saved || saved.id!==requestId || typeof saved.id!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saved.id) || typeof saved.application_number!=="string" || !saved.application_number || !Number.isFinite(Date.parse(saved.created_at)) || saved.plan_id!==plan.id || saved.plan_name!==plan.name || saved.monthly_price!==plan.price) return reply(502,"저장 결과를 확인하지 못했습니다.");
    return Response.json({id:saved.id,number:saved.application_number,createdAt:saved.created_at,planId:plan.id,planName:plan.name,price:plan.price},{status:201,headers:{"Cache-Control":"no-store"}});
  } catch { return reply(502,"신청 정보를 저장하지 못했습니다."); }
}
