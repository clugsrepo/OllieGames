/* Chunk & Pip, two people on one keyboard.

   The headline is the last section: EVERY floor is checked to be
   impossible on your own. Not harder - impossible. That is the whole
   design of the game, so it gets a check per floor rather than a
   comment saying so. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const GAME = 'http://127.0.0.1:8099/games/chunkpip/index.html';
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
async function plates(p) {
  await admin(p, 'where');                  // makes the panel re-read its states
  return p.evaluate(() => { const r = document.getElementById('oa-cmd-plates');
    return r ? r.querySelector('.oa-state').textContent : '?'; });
}
const floorOf = p => p.$eval('#floornum', e => Number(e.textContent));
const hold = async (p, keys, ms) => {
  for (const k of keys) await p.keyboard.down(k);
  await wait(ms);
  for (const k of keys) await p.keyboard.up(k);
};

(async () => {
  const b = await chromium.launch({ args: ARGS });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
  await ctx.addInitScript(() => localStorage.setItem('ollie-games-player', 'Ollie'));
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await p.goto(GAME, { waitUntil: 'load' });
  await wait(1300);
  check('the page loads with no errors at all', errs.length === 0);
  const canvas = await p.evaluate(() => {
    const c = document.querySelectorAll('canvas');
    return { n: c.length, w: c[0] && c[0].width };
  });
  check('there is one canvas and it has a real size (' + canvas.n + ', ' + canvas.w + 'px)',
    canvas.n === 1 && canvas.w > 0);
  check('three.js comes from the game\'s own folder, not a CDN',
    await p.evaluate(() => [...document.scripts].every(s => !/^https?:/.test(s.getAttribute('src') || ''))));

  await p.click('#btn-play');
  await wait(1000);
  await p.evaluate(() => window.OllieAdmin.togglePanel(true));
  await wait(250);
  await p.evaluate(() => window.OllieAdmin.togglePanel(false));
  const total = await p.$eval('#floortotal', e => Number(e.textContent));
  check('the tower has ' + total + ' floors', total >= 6);

  // ================= THE TWO OF THEM ARE DIFFERENT =================
  console.log('\n--- they are not the same, and that is the point ---');
  await admin(p, 'floor 1'); await wait(800);

  await admin(p, 'put chunk -14 10');       // out of the way
  await admin(p, 'put pip -5 -7'); await wait(500);
  await hold(p, ['ArrowRight'], 2600);
  await wait(300);
  const pipThrough = await say(p, 'where');
  check('Pip fits through the little doorway (' + pipThrough + ')', /Pip 1[0-9]/.test(pipThrough));

  await admin(p, 'put chunk -5 -7');
  await admin(p, 'put pip -14 10'); await wait(500);
  await hold(p, ['KeyD'], 2600);
  await wait(300);
  const chunkStuck = await say(p, 'where');
  check('and Chunk simply cannot (' + chunkStuck + ')', /Chunk -1\./.test(chunkStuck));

  // ================= MOVING ON ONE KEYBOARD =================
  console.log('\n--- one keyboard, two people ---');
  await admin(p, 'floor 1'); await wait(700);
  const start = await say(p, 'where');
  await p.keyboard.down('KeyA'); await p.keyboard.down('ArrowRight');
  await wait(900);
  await p.keyboard.up('KeyA'); await p.keyboard.up('ArrowRight');
  await wait(300);
  const apart = await say(p, 'where');
  check('they move at the same time, in opposite directions', start !== apart);

  // ================= THE DOOR NEEDS BOTH =================
  console.log('\n--- the way out needs both of them ---');
  await admin(p, 'floor 1'); await wait(700);
  const f0 = await floorOf(p);
  await admin(p, 'exit chunk'); await wait(1000);
  check('one of them on the pad is not enough (still floor ' + await floorOf(p) + ')',
    await floorOf(p) === f0);
  await admin(p, 'exit both'); await wait(1200);
  check('both of them on it opens the door (floor ' + f0 + ' -> ' + await floorOf(p) + ')',
    await floorOf(p) === f0 + 1);

  // ================= THE TRICKS =================
  console.log('\n--- the things they can do ---');
  await admin(p, 'floor 3'); await wait(800);
  await admin(p, 'put pip -4 -1'); await wait(500);
  for (let i = 0; i < 5; i++) { await hold(p, ['ArrowUp', 'ShiftRight'], 400); await wait(220); }
  check('Pip cannot reach the high switch by jumping (' + await plates(p) + ')',
    (await plates(p)).indexOf('0/') === 0);

  await admin(p, 'put chunk -4 0');
  await admin(p, 'put pip -4 1'); await wait(600);
  await p.keyboard.press('KeyE');            // Chunk picks Pip up
  await wait(500);
  const carried = await say(p, 'where');
  check('Chunk can pick Pip up (' + carried + ')', / h2\.2/.test(carried));
  await hold(p, ['KeyW'], 500); await wait(300);
  await hold(p, ['ShiftRight', 'ArrowUp'], 500);
  await wait(900);
  check('and carried over, Pip gets to it (' + await plates(p) + ')',
    (await plates(p)).indexOf('1/') === 0);

  await admin(p, 'floor 4'); await wait(800);
  const crate0 = await say(p, 'where');
  await admin(p, 'put chunk -2 9'); await wait(500);
  await hold(p, ['KeyW'], 2600); await wait(400);
  const crate1 = await say(p, 'where');
  check('Chunk can shove a crate about (' + crate0.split('crates')[1] + ' ->' +
    crate1.split('crates')[1] + ')', crate0 !== crate1);

  await admin(p, 'floor 5'); await wait(800);
  await admin(p, 'put pip -8 0'); await wait(500);
  await hold(p, ['ArrowRight'], 900);
  await hold(p, ['ArrowRight', 'ShiftRight'], 700);
  await wait(1700);
  check('Pip cannot jump the pit by himself (' + await plates(p) + ')',
    (await plates(p)).indexOf('0/') === 0);
  await admin(p, 'put chunk -6 0');
  await admin(p, 'put pip -6 1'); await wait(600);
  await p.keyboard.press('KeyE'); await wait(500);
  await hold(p, ['KeyD'], 300); await wait(250);
  await p.keyboard.press('KeyE');            // THROW
  await wait(2200);
  const thrown = await say(p, 'where');
  check('but thrown, he sails right over it (' + thrown + ')', /Pip [1-9]/.test(thrown));

  // ================= THE PROMISE =================
  console.log('\n--- and now the promise: no floor can be done alone ---');
  for (let f = 1; f <= total; f++) {
    await admin(p, 'floor ' + f); await wait(700);
    const name = await p.$eval('#floorname', e => e.textContent);
    // park Pip in a corner and let Chunk try absolutely everything
    await admin(p, 'put pip -15 -11'); await wait(200);
    for (const keys of [['KeyD'], ['KeyD','KeyW'], ['KeyD','KeyS'], ['KeyW'], ['KeyS'],
                        ['KeyD','Space'], ['KeyA']]) {
      await hold(p, keys, 700);
    }
    await wait(400);
    check('floor ' + f + ' "' + name + '" cannot be finished by Chunk alone',
      await floorOf(p) === f);
  }

  // ================= IT FINISHES =================
  console.log('\n--- and together, it finishes ---');
  await p.reload({ waitUntil: 'load' });
  await wait(1300);
  await p.click('#btn-play');
  await wait(900);
  for (let f = 1; f <= total; f++) { await admin(p, 'exit both'); await wait(1000); }
  check('all ' + total + ' floors, start to finish', await p.isVisible('#done'));
  check('and it tells you how you did ("' +
    (await p.$eval('#donetext', e => e.textContent)).slice(0, 44) + '…")',
    /tower/.test(await p.$eval('#donetext', e => e.textContent)));

  // ================= THE HOUSE RULES =================
  console.log('\n--- the house rules ---');
  const src = require('fs').readFileSync('/home/user/OllieGames/games/chunkpip/index.html', 'utf8');
  check('nobody dies and nothing is killed', !/\bdie\b|\bdead\b|\bkill/i.test(src));
  check('the clock has a safety catch on it',
    /Math\.min\(\(now - last\) \/ 1000, 0\.05\)/.test(src));
  check('slowing down is by time, not by frames', /Math\.exp\(-\(P\.onGround/.test(src));
  check('joining ships switched OFF, as it should', /const ROOM_SERVER = "";/.test(src));

  const frames = await p.evaluate(() => new Promise(done => {
    const gaps = []; let last = performance.now();
    function tick() {
      const now = performance.now();
      gaps.push(now - last); last = now;
      if (gaps.length < 150) requestAnimationFrame(tick);
      else { gaps.sort((a, b) => a - b); done(gaps[Math.floor(gaps.length / 2)]); }
    }
    requestAnimationFrame(tick);
  }));
  check('it keeps up (middling frame ' + frames.toFixed(1) + 'ms, no graphics card at all)',
    frames < 110);

  console.log('\nerrors: ' + (errs.length ? errs.slice(0, 3) : 'none'));
  console.log(pass + ' passed, ' + fail + ' failed');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('BLEW UP: ' + e.message); process.exit(1); });
