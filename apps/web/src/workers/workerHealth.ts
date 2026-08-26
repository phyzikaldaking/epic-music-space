import { createServer, type Server } from "node:http";
import type { Redis } from "ioredis";
export type WorkerReadiness = { ready: boolean; detail?: string };
export function startWorkerHealthServer(name:string, readiness:WorkerReadiness, redis:Redis):Server {
 const port=Number(process.env.PORT ?? process.env.WORKER_HEALTH_PORT ?? 8080);
 const server=createServer(async (request,response)=>{
  const path=request.url?.split("?")[0] ?? "/"; const health=path==="/health"||path==="/healthz"; const readyPath=path==="/ready"||path==="/readyz";
  if(!health&&!readyPath){response.writeHead(404,{"content-type":"application/json"});response.end(JSON.stringify({error:"not_found"}));return;}
  let redisOk=false; try{await redis.ping();redisOk=true;}catch{}
  const ready=readiness.ready&&redisOk; const body={status:ready?"ready":health?"healthy":"not_ready",worker:name,timestamp:new Date().toISOString(),checks:{process:"ok",redis:redisOk?"ok":"down",worker:readiness.ready?"ok":"starting"},detail:readiness.detail};
  response.writeHead(readyPath&&!ready?503:200,{"content-type":"application/json","cache-control":"no-store"});response.end(JSON.stringify(body));
 });
 server.listen(port,"0.0.0.0",()=>console.info(JSON.stringify({event:"worker_health_listening",worker:name,port}))); return server;
}
export function logWorkerFailure(worker:string,event:string,error:unknown,extra:Record<string,unknown>={}){const normalized=error instanceof Error?{message:error.message,stack:error.stack}:{message:String(error)};console.error(JSON.stringify({event,worker,...extra,error:normalized,timestamp:new Date().toISOString()}));}