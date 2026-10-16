import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { readFileSync } from 'node:fs'
import { it, expect } from 'vitest'
it('executes actual scheduled handler with native D1',async()=>{
 const bundle=await build({entryPoints:['src/index.ts'],bundle:true,write:false,format:'esm',platform:'browser'})
 let status=200
 const emails: unknown[]=[]
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-23',d1Databases:['DB'],bindings:{ALLOWED_SITE_ORIGIN:'https://anbenigeria.com',RESEND_API_KEY:'test-key',ALERT_EMAIL_FROM:'test@example.com'},outboundService:async request=>{if(new URL(request.url).hostname==='api.resend.com'){emails.push(await request.json());return Response.json({id:'test'})}return new Response('test',{status})}}))
 try{
  const db=await runtime.getD1Database('DB')
  for(const name of ['0001_sites.sql','0003_critical_email_alerts.sql','0004_availability.sql']){
   for(const sql of readFileSync('migrations/'+name,'utf8').split(';').filter(x=>x.trim()))await db.prepare(sql).run()
  }
  await db.prepare("INSERT INTO sites (id,name,url,ciphertext,iv,verified_at) VALUES ('default','Test','https://anbenigeria.com','cipher','iv','now')").run()
  const worker=await runtime.getWorker()
  const cron='0,5,10,15,20,25,30,35,40,45,50,55 * * * *'
  const time=Math.floor(Date.now()/300000)*300000
  await worker.scheduled({cron:'0,5,10,15,20,25,30,35,40,45,50,55 * * * *',scheduledTime:new Date()})
  expect(await db.prepare('SELECT detail FROM availability_state').first('detail')).toBe('HTTP 2xx')
  status=503
  await worker.scheduled({cron,scheduledTime:new Date(time+300000)})
  expect(emails).toHaveLength(0)
  await worker.scheduled({cron,scheduledTime:new Date(time+300001)})
  expect(emails).toHaveLength(0)
  await worker.scheduled({cron,scheduledTime:new Date(time+600000)})
  expect(emails).toHaveLength(1)
  status=200
  await worker.scheduled({cron,scheduledTime:new Date(time+900000)})
  expect(emails).toHaveLength(2)
  expect(await db.prepare('SELECT down FROM availability_state').first('down')).toBe(0)
 }finally{await runtime.dispose()}
},30000)
