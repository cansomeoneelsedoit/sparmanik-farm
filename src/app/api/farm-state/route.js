export const dynamic = "force-dynamic";
const BACKEND = process.env.FARM_BACKEND_URL;
const TOKEN = process.env.FARM_API_TOKEN;
function headers(json) {
    const h = {};
    if (json) h["Content-Type"] = "application/json";
    if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
    return h;
}
export async function GET() {
    if (!BACKEND) return Response.json({});
    try {
          const r = await fetch(`${BACKEND.replace(/\/$/, "")}/api/state`, { headers: headers(false), cache: "no-store" });
          return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json" } });
    } catch { return Response.json({}); }
}
export async function PUT(request) {
    if (!BACKEND) return Response.json({ error: "FARM_BACKEND_URL not set" }, { status: 503 });
    try {
          const body = await request.text();
          const r = await fetch(`${BACKEND.replace(/\/$/, "")}/api/state`, { method: "PUT", headers: headers(true), body });
          return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json" } });
    } catch { return Response.json({ error: "Failed" }, { status: 500 }); }
}
