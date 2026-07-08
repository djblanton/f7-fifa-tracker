# Visit-logger Worker — deploy guide

One Cloudflare Worker logs approximate visitor location for **both** pool sites (Furious Seven and
Golf Gang). It records only city / region / country (from Cloudflare's IP geo), a random opaque
device id, and which site — no raw IP, no names. See the header comment in `visit-logger.js`.

You deploy this once on your own Cloudflare account (free tier is plenty), then send Claude the
resulting `*.workers.dev` URL and it wires the beacon + CSP into both sites.

## Deploy from the Cloudflare dashboard (no CLI needed)

1. **Create the Worker.** dash.cloudflare.com → *Workers & Pages* → *Create* → *Create Worker*.
   Name it something like `pool-visits`. Click *Deploy* (ships the placeholder), then *Edit code*,
   delete the sample, paste all of `visit-logger.js`, and *Deploy* again.

2. **Create a KV namespace.** *Workers & Pages* → *KV* → *Create a namespace*, name it `POOL_VISITS`.

3. **Bind the KV to the Worker.** Open the `pool-visits` Worker → *Settings* → *Variables and
   Secrets* (or *Bindings*) → *KV Namespace Bindings* → *Add binding*:
   - Variable name: `VISITS`
   - Namespace: `POOL_VISITS`

4. **Add the read-back password.** Same *Settings* page → *Environment Variables* → *Add variable*:
   - Name: `VIEW_SECRET`
   - Value: a password you choose (used only to view the log). Mark it *Encrypt* if offered.

5. **Redeploy** so the bindings take effect (*Deployments* → redeploy, or just *Save and Deploy*
   from the editor). Your Worker URL is `https://pool-visits.<your-subdomain>.workers.dev`.

6. **Smoke test.** Open `https://pool-visits.<your-subdomain>.workers.dev/?view=YOUR_SECRET` in a
   browser — you should see an empty "Pool visits — 0 logged" table. (Without the right `?view=`
   secret it returns `forbidden`.)

## Then

Send Claude the `*.workers.dev` URL. It will:
- add a fire-and-forget beacon to both sites' `index.html` (uses `navigator.sendBeacon`, no cookie
  sent to anyone; a random device id is kept in the visitor's own `localStorage`),
- add a Content-Security-Policy that allows the page to reach exactly this Worker and ESPN, nothing
  else,
- ship it to both repos via the sync script.

To read who's been visiting, bookmark `…workers.dev/?view=YOUR_SECRET`.

## Note for the group

City-from-IP is mild personal data, so the classy move is a one-line heads-up in the group chat
("added a little visit counter to the bracket site"). At six people it's nothing legal — just
courteous, especially since the whole point is guessing who's lurking from where.
