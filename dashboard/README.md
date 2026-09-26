# AI Diagnostic Bridge Dashboard

React dashboard for the AI Diagnostic Bridge, adapted from the [shadcn-admin](https://github.com/satnaing/shadcn-admin) starter. The overview, findings, detail, and site connection screens read live evidence through the authenticated Cloudflare Worker.

## Run locally

```powershell
cd dashboard
npm install
npm run dev
```

The production app is served by the Worker alongside `/api`. Build with `npm run build`, then follow [Worker deployment and development](../worker/README.md). The Vite development server proxies `/api` to the local Worker on port 8787.

The dashboard is read-only. It uses a separate dashboard access key and HttpOnly session cookie. The WordPress token is submitted only when explicitly setting/replacing the connection, then cleared from the field; it is never returned by the API or stored in browser storage/build assets. Scans show real counts, scan times, errors, incomplete results, and stale evidence. AI explanations remain unimplemented.
