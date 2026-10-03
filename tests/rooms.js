/* The room server on its own, against a real Durable Object running
   locally in miniflare - no account, nothing deployed.

   Driven from real browser pages, because a browser is the only thing
   that sends a proper Origin header, and the Origin check is one of the
   things being tested.

   The check that matters most is the last one: no arrangement of bytes
   gets a WORD from one child to the other. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const SITE = 'http://127.0.0.1:8099';
const ROOMS = 'ws://127.0.0.1:8787';
const HTTP = 'http://127.0.0.1:8787';

let pass = 0, fail = 0;
const check = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? '  PASS  ' : '  FAIL  ') + n); };
const wait = ms => new Promise(r => setTimeout(r, ms));

/* Each player is a page with one socket on it. Everything that arrives
   is stacked up so the test can look at it. */
async function player(ctx, code) {
  const pg = await ctx.newPage();
  await pg.goto(SITE + '/games/chunkpip/index.html', { waitUntil: 'domcontentloaded' });
  const ok = await pg.evaluate(([url, code]) => new Promise(done => {
    window.__inbox = [];
    const ws = new WebSocket(url + '/room/' + code);
    window.__ws = ws;
    ws.addEventListener('message', e => window.__inbox.push(String(e.data)));
    ws.addEventListener('open', () => done(true));
    ws.addEventListener('error', () => done(false));
    setTimeout(() => done(false), 6000);
  }), [ROOMS, code]);
  pg.__ok = ok;
  return pg;
}
const inbox = pg => pg.evaluate(() => window.__inbox.splice(0, window.__inbox.length));
const send = (pg, text) => pg.evaluate(t => window.__ws.send(t), text);

(async () => {
  const b = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
  const ctx = await b.newContext();

  const health = await fetch(HTTP + '/health');
  check('the server is awake ("' + (await health.text()).trim() + '")', health.status === 200);

  const stranger = await fetch(HTTP + '/room/BFGK', { headers: { Origin: 'https://somewhere-else.example' } });
  check('a site that is not ours is turned away (' + stranger.status + ')', stranger.status === 403);

  const badcode = await fetch(HTTP + '/room/II', { headers: { Origin: SITE } });
  check('a code that is not four letters is not a room (' + badcode.status + ')', badcode.status === 404);

  // ---- two players, one code ----
  const host = await player(ctx, 'BFGK');
  check('the host gets in', host.__ok);
  await wait(400);
  const h1 = await inbox(host);
  check('and is told they are the host (' + h1.join(' ') + ')', h1.indexOf('["hello",1]') >= 0);

  const mate = await player(ctx, 'BFGK');
  check('and their friend gets in with the same code', mate.__ok);
  await wait(500);
  const m1 = await inbox(mate), h2 = await inbox(host);
  check('the friend is told they are not the host (' + m1.join(' ') + ')', m1.indexOf('["hello",0]') >= 0);
  check('and the host is told somebody turned up (' + h2.join(' ') + ')', h2.indexOf('["mate",1]') >= 0);

  // ---- moving about ----
  await send(host, JSON.stringify(['p', 1.5, 0, -2.25, 0.5]));
  await wait(400);
  const heard = await inbox(mate);
  check('what the host does reaches the other one (' + heard.join(' ') + ')',
    heard.indexOf('["p",1.5,0,-2.25,0.5]') >= 0);

  await send(mate, JSON.stringify(['a', 1]));
  await wait(400);
  check('and an action goes back the other way', (await inbox(host)).indexOf('["a",1]') >= 0);

  // ---- a room holds two ----
  const third = await player(ctx, 'BFGK');
  check('a third person cannot get into a room for two', !third.__ok);

  // ---- a different code is a different room ----
  const other = await player(ctx, 'MPQR');
  await wait(400); await inbox(other);
  await send(host, JSON.stringify(['p', 9, 9, 9, 9]));
  await wait(400);
  check('a different code is a completely different room', (await inbox(other)).length === 0);

  // ---- the one that really matters ----
  console.log('\n--- nothing with words in it ever gets through ---');
  const sneaky = [
    '["p","hello there",0,0]',            // a word where a number goes
    '["chat","give me your address"]',    // a kind we do not know
    '"just a string"',                    // not a list at all
    '["p",1,2,3,{"say":"hi"}]',           // something clever
    '["p",1,2,3,["nested","words"]]',
    'not json at all',
    '["a",1,"and a word"]'
  ];
  for (const s of sneaky) await send(mate, s);
  await wait(900);
  const leaked = await inbox(host);
  check('seven goes at smuggling words through, all dropped (' +
        (leaked.length ? 'LEAKED: ' + leaked.join(' ') : 'nothing got through') + ')',
    leaked.length === 0);

  await send(mate, JSON.stringify(['p', 4, 0, 4, 1]));
  await wait(400);
  check('and a proper message still works straight afterwards',
    (await inbox(host)).indexOf('["p",4,0,4,1]') >= 0);

  // ---- leaving ----
  await mate.close();
  await wait(800);
  check('when your friend goes, you are told', (await inbox(host)).indexOf('["mate",0]') >= 0);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('BLEW UP: ' + e.message); process.exit(1); });
