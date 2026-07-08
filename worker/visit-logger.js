// Visit logger for the World Cup pool sites (Furious Seven + Golf Gang).
//
// Why a Worker: the pool pages are static (GitHub Pages) and JS can't see a visitor's IP, so
// the page can't geolocate anyone by itself. A request that reaches Cloudflare's edge, though,
// arrives with `request.cf` already filled in — approximate city/region/country derived from the
// visitor's IP. So the page fires a tiny beacon here, and this Worker records the geo Cloudflare
// hands it. We deliberately store only city/region/country + a random opaque device id + which
// site — never the raw IP, never a name. City-level is the ceiling: it's a guessing game
// ("someone in Santa Rosa"), not identification.
//
// One Worker serves both sites; the page passes ?site=f7 or ?site=golfgang.
//
// Bindings this expects (set in the Cloudflare dashboard — see worker/README.md):
//   - KV namespace bound as  VISITS
//   - plaintext/secret var   VIEW_SECRET   (password for the read-back page)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ---- read-back: /?view=<VIEW_SECRET> renders the log as a table ----
    if (url.searchParams.has("view")) {
      if (!env.VIEW_SECRET || url.searchParams.get("view") !== env.VIEW_SECRET) {
        return new Response("forbidden", { status: 403 });
      }
      const rows = [];
      // KV keys are `${timestamp}-${rand}`, so listing is already ~chronological; page through all.
      let cursor;
      do {
        const page = await env.VISITS.list({ limit: 1000, cursor });
        for (const k of page.keys) {
          const v = await env.VISITS.get(k.name);
          if (v) { try { rows.push(JSON.parse(v)); } catch {} }
        }
        cursor = page.list_complete ? null : page.cursor;
      } while (cursor);
      rows.sort((a, b) => b.t - a.t);

      const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) =>
        ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
      const body = `<!doctype html><meta charset="utf-8"><title>pool visits</title>
        <style>body{font:14px system-ui,sans-serif;margin:24px;color:#111}
        table{border-collapse:collapse;margin-top:12px}td,th{border:1px solid #ccc;padding:4px 9px;text-align:left}
        th{background:#f3f3f3}tr:nth-child(even){background:#fafafa}</style>
        <h2>Pool visits — ${rows.length} logged</h2>
        <table><tr><th>when (UTC)</th><th>site</th><th>city</th><th>region</th><th>country</th><th>device</th></tr>
        ${rows.map((r) => `<tr><td>${esc(new Date(r.t).toISOString().replace("T", " ").slice(0, 19))}</td>`
          + `<td>${esc(r.site)}</td><td>${esc(r.city)}</td><td>${esc(r.region)}</td>`
          + `<td>${esc(r.country)}</td><td>${esc(r.dev)}</td></tr>`).join("")}
        </table>`;
      return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // ---- beacon: record a visit. Method-agnostic (sendBeacon POSTs, fetch fallback GETs); we read
    //      site/dev from the query string so there's no body/content-type/preflight to worry about.
    const cf = request.cf || {};
    const rec = {
      t: Date.now(),
      site: String(url.searchParams.get("site") || "").slice(0, 24),
      dev: String(url.searchParams.get("dev") || "").slice(0, 40),
      city: cf.city || "",
      region: cf.region || "",
      country: cf.country || "",
    };
    // Unique key per visit avoids read-modify-write races; 120-day TTL keeps the store self-pruning.
    const key = `${rec.t}-${Math.random().toString(36).slice(2, 8)}`;
    if (env.VISITS) {
      await env.VISITS.put(key, JSON.stringify(rec), { expirationTtl: 60 * 60 * 24 * 120 });
    }
    // Response body is ignored by sendBeacon / no-cors fetch; 204 keeps it cheap.
    return new Response(null, { status: 204 });
  },
};
