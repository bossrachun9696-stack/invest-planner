// Supabase Edge Function: ivp-quote
// ตัวกลางดึงราคาจาก Yahoo Finance (หุ้นไทย .BK, หุ้นสหรัฐฯ, ทองฟิวเจอร์ส GC=F, ค่าเงิน THB=X)
// เรียก: GET /functions/v1/ivp-quote?symbol=PTT.BK&interval=1d&range=6mo
// คืน: { symbol, price, prevClose, currency, time, exchange, closes: number[] }
// หมายเหตุ: ราคาหุ้นไทยจาก Yahoo มักล่าช้าประมาณ 15 นาที

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const INTERVALS = ["1h", "1d", "1wk"];
const RANGES = ["5d", "1mo", "3mo", "6mo", "1y", "2y"];
const cache = new Map<string, { t: number; body: string }>();

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const u = new URL(req.url);
  const symbol = (u.searchParams.get("symbol") || "").trim().toUpperCase();
  const interval = INTERVALS.includes(u.searchParams.get("interval") || "")
    ? u.searchParams.get("interval")!
    : "1d";
  const range = RANGES.includes(u.searchParams.get("range") || "")
    ? u.searchParams.get("range")!
    : "6mo";
  if (!/^[A-Z0-9.=^\-]{1,20}$/.test(symbol)) return json({ error: "bad_symbol" }, 400);

  const key = `${symbol}|${interval}|${range}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 15000) {
    return new Response(hit.body, { headers: { ...CORS, "content-type": "application/json" } });
  }

  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`,
      { headers: { "User-Agent": "Mozilla/5.0 (ivp-quote)" } },
    );
    if (!r.ok) return json({ error: "upstream_" + r.status }, 502);
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    if (!res?.meta?.regularMarketPrice) return json({ error: "not_found" }, 404);
    const m = res.meta;
    const closes = (res.indicators?.quote?.[0]?.close || []).filter((x: number | null) => x != null);
    const body = JSON.stringify({
      symbol: m.symbol,
      price: m.regularMarketPrice,
      prevClose: m.chartPreviousClose ?? m.previousClose ?? null,
      currency: m.currency,
      time: m.regularMarketTime,
      exchange: m.exchangeName,
      closes,
    });
    if (cache.size > 500) cache.clear();
    cache.set(key, { t: Date.now(), body });
    return new Response(body, { headers: { ...CORS, "content-type": "application/json" } });
  } catch (_e) {
    return json({ error: "fetch_failed" }, 502);
  }
});
