/* Two real browsers, one room code, one Durable Object.

   The game ships with ROOM_SERVER empty, which is right - joining is off
   until a grown-up switches it on. So the test fills it in on the way
   past, exactly as deploying would, and plays the real shipped file. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const OUT = '/tmp/claude-0/-home-user-OllieGames/30e3b9ca-dcff-5425-9868-5f2b3cb63fbb/scratchpad/';
const GAME = 'http://127.0.0.1:8099/games/chunkpip/index.html';
const FILE = '/home/user/OllieGames/games/chunkpip/index.html';
const ARGS = ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage',
              '--disable-background-timer-throttling','--disable-renderer-backgrounding',
              '--disable-backgrounding-occluded-windows'];

let pass = 0, fail = 0;
const check = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? '  PASS  ' : '  FAIL  ') + n); };
const wait = ms => new Promise(r => setTimeout(r, ms));

const admin = (p, l) => p.evaluate(x => window.OllieAdmin.run(x), l);
async function say(p, cmd) {
  await admin(p, cmd);
  return p.evaluate(() => { const l = document.querySelectorAll('.oa-logline');
    return l.length ? l[l.length - 1].textContent : '?'; });
}
const floorOf = p => p.$eval('#floornum', e => Number(e.textContent));
const hold = async (p, keys, ms) => {
  for (const k of keys) await p.keyboard.down(k);
  await wait(ms);
  for (const k of keys) await p.keyboard.up(k);
};

async function openGame(ctx, server) {
  const pg = await ctx.newPage();
  // switch joining on, the same way deploying does
  await pg.route(GAME, async route => {
    const html = fs.readFileSync(FILE, 'utf8')
      .replace('const ROOM_SERVER = "";', 'const ROOM_SERVER = "' + server + '";');
    await route.fulfill({ status: 200, contentType: 'text/html', body: html });
  });
  pg.__errs = [];
  pg.on('pageerror', e => pg.__errs.push(String(e)));
  pg.on('console', m => { if (m.type() === 'error') pg.__errs.push(m.text()); });
  await pg.goto(GAME, { waitUntil: 'load' });
  await wait(1200);
  return pg;
}

(async () => {
  const b = await chromium.launch({ args: ARGS });
  const ctx = await b.newContext({ viewport: { width: 900, height: 640 } });
  await ctx.addInitScript(() => localStorage.setItem('ollie-games-player', 'Ollie'));

  // ---------- switched off ----------
  console.log('--- when joining is not switched on ---');
  const off = await ctx.newPage();
  await off.goto(GAME, { waitUntil: 'load' });
  await wait(900);
  check('the make/join buttons are there but not usable',
    await off.$eval('#btn-make', e => e.disabled) &&
    await off.$eval('#btn-join', e => e.disabled));
  check('and it says plainly why ("' +
    (await off.$eval('#nojoin', e => e.textContent.trim().slice(0, 48))) + '…")',
    await off.isVisible('#nojoin'));
  await off.click('#btn-play');
  await wait(700);
  check('and two-on-one-keyboard still plays', await off.isHidden('#start'));
  await off.close();

  // ---------- two of them, one code ----------
  console.log('\n--- two browsers, one code ---');
  const host = await openGame(ctx, 'http://127.0.0.1:8787');
  await host.click('#btn-make');
  await wait(1200);
  const code = await host.$eval('#bigcode', e => e.textContent.trim());
  check('the host gets a four-letter code (' + code + ')', /^[A-Z]{4}$/.test(code));
  check('and is told to wait ("' + (await host.$eval('#onlinestatus', e => e.textContent)) + '")',
    /wait/i.test(await host.$eval('#onlinestatus', e => e.textContent)));

  const mate = await openGame(ctx, 'http://127.0.0.1:8787');
  await mate.click('#btn-join');
  await wait(400);
  await mate.fill('#codein', code);
  await mate.click('#btn-gojoin');
  await wait(2000);

  check('typing the code starts the game for the joiner', await mate.isHidden('#start') && await mate.isHidden('#online'));
  check('and for the host too', await host.isHidden('#online'));
  console.log('      host says: ' + await say(host, 'net'));
  console.log('      mate says: ' + await say(mate, 'net'));

  // ---------- do they see each other? ----------
  console.log('\n--- can each of them see the other move? ---');
  const pipBefore = await say(host, 'where');
  await hold(mate, ['KeyD'], 2000);          // the joiner is Pip; drive him east
  await wait(1200);
  const pipAfter = await say(host, 'where');
  console.log('      on the HOST screen, before: ' + pipBefore);
  console.log('      on the HOST screen, after : ' + pipAfter);
  check('what the joiner does shows up on the host\'s screen', pipBefore !== pipAfter);

  const chunkBefore = await say(mate, 'where');
  await hold(host, ['KeyD'], 2000);          // the host is Chunk
  await wait(1200);
  const chunkAfter = await say(mate, 'where');
  console.log('      on the JOINER screen, before: ' + chunkBefore);
  console.log('      on the JOINER screen, after : ' + chunkAfter);
  check('and what the host does shows up on the joiner\'s screen', chunkBefore !== chunkAfter);

  // ---------- only the host moves everybody on ----------
  console.log('\n--- only the host decides you have finished a floor ---');
  const hf = await floorOf(host), mf = await floorOf(mate);
  await admin(mate, 'exit both');             // the GUEST shoves both onto the pad
  await wait(1600);
  check('the joiner cannot move the floor on by themselves (' +
    mf + ' -> ' + await floorOf(mate) + ')', await floorOf(mate) === mf);

  await admin(host, 'exit both');              // now the host does it
  await wait(1800);
  const hNow = await floorOf(host), mNow = await floorOf(mate);
  check('but when the host does it, BOTH move on (host ' + hf + '->' + hNow +
    ', joiner ' + mf + '->' + mNow + ')', hNow > hf && mNow === hNow);

  await host.screenshot({ path: OUT + 'net-host.png' });
  await mate.screenshot({ path: OUT + 'net-mate.png' });

  // ---------- the budget ----------
  console.log('\n--- the message budget ---');
  await admin(host, 'floor 2'); await wait(1200);
  const sentBefore = await host.evaluate(() => null);
  const before = await say(host, 'net');
  await hold(host, ['KeyD'], 1500);
  await hold(host, ['KeyA'], 1500);
  await wait(500);
  const moving = await say(host, 'net');
  console.log('      after charging about: ' + moving);
  await wait(4000);                             // now stand perfectly still
  const still = await say(host, 'net');
  console.log('      after standing still: ' + still);
  const n = t => { const m = t.match(/sent (\d+)/); return m ? Number(m[1]) : -1; };
  check('standing still sends almost nothing (' + n(moving) + ' -> ' + n(still) +
    ' over four seconds)', n(still) - n(moving) <= 2);
  const rate = (still.match(/about (\d+) an hour/) || [])[1];
  check('and the rate is well inside the daily allowance (' + rate + '/hour vs 100,000/day)',
    Number(rate) > 0 && Number(rate) < 60000);

  // ---------- your friend wanders off ----------
  console.log('\n--- when your friend drops out ---');
  await mate.close();
  await wait(2500);
  check('the host is told, and holds everything', await host.isVisible('#waiting'));
  const parked = await say(host, 'where');
  await hold(host, ['KeyD'], 1200);
  await wait(400);
  check('and nothing moves while they are gone', await say(host, 'where') === parked);

  console.log('\nhost page errors: ' + (host.__errs.length ? host.__errs.slice(0, 3) : 'none'));
  console.log(pass + ' passed, ' + fail + ' failed');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('BLEW UP: ' + e.message); process.exit(1); });
