import { createSession } from '../src/security'
import worker from '../src/index'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultAlerts } from '../src/alerts'
import { probeAvailability, recordAvailability, sendAvailabilityEmails } from '../src/availability'
let db: DatabaseSync
let env: Env
let outbound: ReturnType<typeof vi.fn<typeof fetch>>
let clock: number
const site = () => ({ ...defaultAlerts, id: 'default', name: 'Test', url: 'https://anbenigeria.com' })
beforeEach(() => {
  clock = Date.now()
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(readFileSync('migrations/0001_sites.sql', 'utf8'))
  db.exec(readFileSync('migrations/0003_critical_email_alerts.sql', 'utf8'))
  db.exec(readFileSync('migrations/0004_availability.sql', 'utf8'))
  db.exec("INSERT INTO sites (id,name,url,ciphertext,iv,verified_at) VALUES ('default','Test','https://anbenigeria.com','cipher','iv','now')")
  env = {
    ALLOWED_SITE_ORIGIN: 'https://anbenigeria.com', RESEND_API_KEY: 'private-resend-key', ALERT_EMAIL_FROM: 'alerts@example.com', DASHBOARD_ORIGIN: 'https://dashboard.example',
    DB: {
      prepare: (sql: string) => {
        const stmt = db.prepare(sql)
        let args: (string | number)[] = []
        const result = { bind: (...values: (string | number)[]) => { args = values; return result }, first: async () => stmt.get(...args) ?? null, run: async () => stmt.run(...args), runSync: () => stmt.run(...args) }
        return result
      },
      batch: async (statements: { runSync: () => unknown }[]) => {
        db.exec('BEGIN')
        try { const results = statements.map(statement => statement.runSync()); db.exec('COMMIT'); return results }
        catch (error) { db.exec('ROLLBACK'); throw error }
      },
    },
  } as unknown as Env
  outbound = vi.fn<typeof fetch>(async () => Response.json({ id: 'email-id' }))
  vi.stubGlobal('fetch', outbound)
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => { db.close(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const tick = async (detail: string | null, time = (clock += 300000)) => {
 await recordAvailability(env, site(), detail, time)
 await sendAvailabilityEmails(env, site())
}
it('requires two failures, suppresses repeated outages, sends recovery and rearms', async () => {
 await tick(null); await tick('HTTP 500'); expect(outbound).not.toHaveBeenCalled()
 await tick('HTTP 500'); expect(outbound).toHaveBeenCalledTimes(1)
 await tick('HTTP 503'); expect(outbound).toHaveBeenCalledTimes(1)
 await tick(null); expect(outbound).toHaveBeenCalledTimes(2)
 await tick(null); await tick('Connection failed'); await tick('Connection failed')
 expect(outbound).toHaveBeenCalledTimes(3)
})
it('ignores duplicate and stale ticks and resets failure streak after a gap', async () => {
 await tick('HTTP 500'); await tick('HTTP 500', clock); await tick('HTTP 500', clock-1)
 expect(outbound).not.toHaveBeenCalled()
 clock += 20*60000; await tick('HTTP 500'); expect(outbound).not.toHaveBeenCalled()
 await tick('HTTP 500'); expect(outbound).toHaveBeenCalledOnce()
})
it('retries provider failure with the same idempotency key', async () => {
 outbound.mockResolvedValueOnce(new Response('', {status:503}))
 await tick('HTTP 500'); await tick('HTTP 500')
 db.exec('UPDATE availability_emails SET lease_until = 0')
 await sendAvailabilityEmails(env, site())
 expect(outbound).toHaveBeenCalledTimes(2)
 expect(outbound.mock.calls[0][1]?.headers).toEqual(outbound.mock.calls[1][1]?.headers)
})
it('blank recipient disables availability email regardless of severity', async () => {
 for (let i=0;i<3;i++) await recordAvailability(env, {...site(), alert_email:''}, 'HTTP 500', clock+=300000)
 expect(db.prepare('SELECT count(*) AS n FROM availability_emails').get()?.n).toBe(0)
})
it('checks public HTTP without credentials and follows only same-origin redirects', async () => {
 outbound.mockResolvedValueOnce(new Response('', {status:302,headers:{Location:'/home/'}}))
 outbound.mockResolvedValueOnce(new Response('ok'))
 expect(await probeAvailability(env.ALLOWED_SITE_ORIGIN)).toBeNull()
 expect(outbound.mock.calls[0][1]?.headers).not.toHaveProperty('Authorization')
 outbound.mockResolvedValueOnce(new Response('', {status:302,headers:{Location:'https://other.example/'}}))
 expect(await probeAvailability(env.ALLOWED_SITE_ORIGIN)).toBe('Redirect outside configured origin')
 expect(outbound).toHaveBeenCalledTimes(3)
})
it('reports HTTP errors, transport failure and redirect loops', async () => {
 outbound.mockResolvedValueOnce(new Response('',{status:503}))
 expect(await probeAvailability(env.ALLOWED_SITE_ORIGIN)).toBe('HTTP 503')
 outbound.mockRejectedValueOnce(new Error('private error'))
 expect(await probeAvailability(env.ALLOWED_SITE_ORIGIN)).toBe('Connection failed')
 outbound.mockImplementation(async()=>new Response('',{status:301,headers:{Location:'/'}}))
 expect(await probeAvailability(env.ALLOWED_SITE_ORIGIN)).toBe('Too many redirects')
})

it('cron checks availability even with an unusable plugin credential', async () => {
 outbound.mockResolvedValue(new Response('ok'))
 await worker.scheduled({cron:'*/5 * * * *',scheduledTime:clock} as ScheduledController,env,{} as ExecutionContext)
 expect(outbound).toHaveBeenCalledOnce()
 expect(String(outbound.mock.calls[0][0])).toBe('https://anbenigeria.com/')
 expect(db.prepare('SELECT detail FROM availability_state').get()?.detail).toBe('HTTP 2xx')
})
it('aborts a stalled homepage request after ten seconds', async () => {
 vi.useFakeTimers()
 outbound.mockImplementation((_url,init)=>new Promise((_resolve,reject)=>{
  init?.signal?.addEventListener('abort',()=>reject(new Error('aborted')))
 }))
 const pending=probeAvailability(env.ALLOWED_SITE_ORIGIN)
 await vi.advanceTimersByTimeAsync(10000)
 expect(await pending).toBe('Timed out after 10 seconds')
})

it('requires authentication and lets an authenticated check run without WordPress', async () => {
 Object.assign(env,{SESSION_KEY:'test-session-key',DASHBOARD_PASSWORD:'test-password',CREDENTIAL_KEY:'invalid-plugin-key',API_LIMIT:{limit:async()=>({success:true})}})
 const origin='https://dashboard.example'
 expect((await worker.fetch(new Request(origin+'/api/availability'),env)).status).toBe(401)
 const cookie='__Host-aidb_session='+await createSession(env.SESSION_KEY)
 outbound.mockResolvedValue(new Response('ok'))
 const result=await worker.fetch(new Request(origin+'/api/availability',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:'{}'}),env)
 expect(result.status).toBe(200)
 expect((await result.json() as {state:{detail:string}}).state.detail).toBe('HTTP 2xx')
 expect(outbound).toHaveBeenCalledOnce()
})
