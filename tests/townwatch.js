/* Town Watch, in a real browser.

   Same discipline as the others: real keys, real clicks, real admin
   commands, and not one line of test-only code in the game.

   The town is laid out on a four metre grid on purpose, so almost
   everything in here can be asked as a question with a number for an
   answer instead of a picture to squint at. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const OUT = '/tmp/';
const GAME = 'http://127.0.0.1:8099/games/townwatch/index.html';
const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage',
              '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
              '--disable-backgrounding-occluded-windows'];

let pass = 0, fail = 0;
const check = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? '  PASS  ' : '  FAIL  ') + n); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const num = s => (String(s).match(/-?\d+\.?\d*/g) || []).map(Number);

let page;
const admin = l => page.evaluate(x => window.OllieAdmin.run(x), l);
async function say(cmd) {
  const ok = await admin(cmd);
  const line = await page.evaluate(() => {
    const l = document.querySelectorAll('.oa-logline');
    return l.length ? l[l.length - 1].textContent : '?';
  });
  if (!ok) throw new Error('admin refused: ' + cmd + ' -> ' + line);
  return line;
}
const hold = async (keys, ms) => {
  for (const k of keys) await page.keyboard.down(k);
  await wait(ms);
  for (const k of keys) await page.keyboard.up(k);
};
async function at() {
  const n = num(await say(';where'));
  return { x: n[0], y: n[1], z: n[2], yaw: n[3] };
}

/* Hold the keys and keep looking, rather than holding them for a
   guessed number of milliseconds and hoping. A slow frame makes a timed
   walk flaky without the game being flaky at all. */
async function walkTill(keys, there, maxMs) {
  for (const k of keys) await page.keyboard.down(k);
  const t0 = Date.now();
  let p = await at();
  while (Date.now() - t0 < maxMs) {
    await wait(80);
    p = await at();
    if (there(p)) break;
  }
  for (const k of keys) await page.keyboard.up(k);
  return p;
}

(async () => {
  const b = await chromium.launch({ args: ARGS });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 680 } });
  await ctx.addInitScript(() => localStorage.setItem('ollie-games-player', 'Ollie'));
  page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await page.goto(GAME, { waitUntil: 'load' });
  await wait(900);

  // ---------------------------------------------------- getting in
  console.log('--- a town, and five people in it ---');
  check('it starts up with no complaints', errs.length === 0);
  await page.click('[data-kit="a"]');
  await wait(600);
  check('picking a way to start puts you in it',
        await page.$eval('#start', e => e.hidden));

  const town = await say(';town');
  const t = num(town);
  check('the ring is 48 metres across on a 4 metre grid (' + town + ')',
        t[0] === 48 && t[1] === 4);
  check('   ... with four gates and twelve gate cells to fill',
        t[2] === 4 && t[3] === 12);

  const gates = await say(';gates');
  check('the four ways in are each on a side, not a corner (' + gates + ')',
        /north at 0,-24/.test(gates) && /east at 24,0/.test(gates) &&
        /south at 0,24/.test(gates) && /west at -24,0/.test(gates));

  const folk = await say(';people');
  check('five people live here and all five are up (' + folk.slice(0, 20) + ')',
        /^5 up, 0 down/.test(folk));
  const inside = await page.evaluate(() =>
    FOLK.every(f => Math.abs(f.x) < 24 && Math.abs(f.z) < 24));
  check('   ... and every one of them is inside the walls', inside);

  // ---------------------------------------------------- the three kits
  /* Ollie picked these three numbers himself and they balance exactly:
     all three come to ninety wood, which is only true if a turret is
     worth twenty and a laser forty. This check is here so that if
     anybody ever quietly rebalances one of them, it goes red. */
  console.log('\n--- the three ways to start are worth the same ---');
  for (const [which, name] of [['a', 'Steady'], ['b', 'Carpenter'], ['c', 'Gunner']]) {
    await say(';loadout ' + which);
    const worth = await say(';worth');
    check(name + ' is worth ninety wood (' + worth + ')',
          num(worth).pop() === 90);
  }

  await say(';loadout a');
  const kitA = await say(';wood');
  check('and Steady is his two turrets and fifty wood (' + kitA + ')',
        /^50 wood, 2 turrets, 0 lasers/.test(kitA));
  await say(';loadout c');
  const kitC = await say(';wood');
  check('and Gunner is his two lasers and ten (' + kitC + ')',
        /^10 wood, 0 turrets, 2 lasers/.test(kitC));
  await say(';loadout a');

  // ---------------------------------------------------- what things cost
  console.log('\n--- what things cost, exactly ---');
  await say(';wood 100');
  await say(';place wall 0 -24');
  check('a wall takes exactly five wood (' + (await say(';wood')) + ')',
        num(await say(';wood'))[0] === 95);
  await say(';place turret 0 -16');
  const afterTurret = await say(';worth');
  check('a turret is worth twenty of it (' + afterTurret + ')',
        /1x20/.test(afterTurret));
  await say(';loadout c');
  await say(';wood 100');
  await say(';place laser 0 -16');
  const afterLaser = await say(';worth');
  check('and a laser forty (' + afterLaser + ')', /1x40/.test(afterLaser));
  await say(';loadout a');

  // ---------------------------------------------------- the clamp
  /* Your eyes are 1.62m up, so a ray a single degree below level lands
     ninety-three metres away - and out there one mouse pixel slides it
     most of a cell. Past twelve metres we stop asking where you pointed
     and put it a few paces ahead instead, somewhere you can judge. */
  console.log('\n--- you cannot build somewhere you cannot aim ---');
  await say(';put 0 0.4 0');
  await say(';look 0 -0.0175');            // one degree down
  await wait(350);
  const flat = await say(';reach');
  check('pointing one degree down does NOT put it ninety metres away (' +
        flat + ')', num(flat)[2] <= 12);
  await say(';look 0 -0.5');
  await wait(350);
  const steep = await say(';reach');
  check('and pointing properly down puts it where the ray lands (' +
        num(steep)[2] + 'm)', num(steep)[2] > 1 && num(steep)[2] < 6);

  // ---------------------------------------------------- the grid
  console.log('\n--- one cell, one thing ---');
  await say(';loadout a');
  const placed = await say(';place wall 1 -23');
  check('a wall put down at 1,-23 lands on the cell centre 0,-24 (' +
        placed + ')', /wall at 0,-24/.test(placed));

  const woodWas = num(await say(';wood'))[0];
  const twice = await admin(';place wall 0 -24');
  check('a second wall in the same cell is refused', twice === false);
  check('   ... and costs nothing (' + woodWas + ' wood either side)',
        num(await say(';wood'))[0] === woodWas);

  check('you cannot build on the town\'s own stone ring',
        (await admin(';place wall 8 -24')) === false);
  await say(';put 0 0.4 -16');
  await wait(200);
  check('nor in the cell you are stood in',
        (await admin(';place wall 0 -16')) === false);

  await say(';place wall -4 -24');
  await say(';place wall 4 -24');
  const cells = await say(';cells');
  check('shutting a gate is something you can count (' + cells + ')',
        /12 gate cells · 3 filled · 3 gates still open/.test(cells));

  // ---------------------------------------------------- it is really there
  console.log('\n--- and you bump into what you built ---');
  await say(';put 0 0.4 -20');
  await say(';look 0 0');
  await walkTill(['KeyW'], p => p.z < -23.2, 4000);
  const blocked = await at();
  check('walk at a gate you have shut and you stop at it (z ' + blocked.z +
        ', the wall is at -24)', blocked.z > -23.6 && blocked.z < -22.8);

  const sold = await say(';sell 0 -24');
  check('selling gives you back exactly what it cost (' + sold + ')',
        /40 wood/.test(sold) || /wood/.test(sold));
  await say(';put 0 0.4 -20');
  const through = await walkTill(['KeyW'], p => p.z < -30, 5000);
  check('and with a gap in it you walk straight out (z ' + through.z + ')',
        through.z < -30);

  await say(';loadout a');

  // ---------------------------------------------------- W goes forwards
  /* The question that matters is not "did I move" but "did I get NEARER
     to the thing I am looking at". W walking backwards passes any check
     that only asks whether you moved, because exactly reversed is still
     moving. */
  console.log('\n--- walking ---');
  await say(';put 0 0.4 20');
  await say(';look 0 0');
  const before = 20;
  await hold(['KeyW'], 700);
  await wait(120);
  const walked = await at();
  check('W takes you TOWARDS what you are looking at (z ' + before +
        ' -> ' + walked.z + ')', walked.z < before - 1.5);

  await say(';put 0 0.4 20');
  await say(';look 1.5708 0');
  await hold(['KeyW'], 600);
  const left = await at();
  check('and looking left then walking takes you left (x ' + left.x + ')', left.x < -1);

  /* The stone ring is solid. Walk at a stretch of it that is not a gate
     and you stop outside it. */
  await say(';put 0 0.4 -18');
  await say(';look 0.9 0');          // off to one side of the north gate
  await walkTill(['KeyW'], p => p.z < -22, 4000);
  const stopped = await at();
  check('you cannot walk through the stone ring (z ' + stopped.z +
        ', the wall is at -24)', stopped.z > -24);

  // ---------------------------------------------------- the bell tower
  console.log('\n--- the bell tower, which is how you see your own town ---');
  await say(';put 0 0.4 2.1');       // at the foot of the ladder
  await say(';look 0 0');
  await wait(200);
  const atFoot = await say(';tower');
  check('standing at the foot of it, the game knows you are on the ladder (' +
        atFoot + ')', /on the ladder/.test(atFoot));

  const top = await walkTill([], () => false, 1);   // settle
  await page.keyboard.down('Space');
  const climbed = await (async () => {
    const t0 = Date.now();
    let p = await at();
    while (Date.now() - t0 < 6000) { await wait(200); p = await at(); if (p.y > 9.6) break; }
    return p;
  })();
  await page.keyboard.up('Space');
  check('hold up and you climb it (y ' + climbed.y + ', the platform is at 9)',
        climbed.y > 9.4);

  /* Just far enough to clear the hole the ladder comes up through. The
     platform is seven metres square, so holding forwards for a whole
     second walks across it and off the other side - which is the
     player's business, not this check's. */
  await hold(['KeyW'], 320);
  await wait(500);
  const onTop = await at();
  check('step forward off the ladder and you are stood on the platform (y ' +
        onTop.y + ')', onTop.y > 9 && onTop.y < 10);

  /* The whole reason the tower exists: from up there you can see where
     they will be coming from. Asked as a number - how many of the four
     gates you have a clear line to - from the same spot on the ground
     and on the platform, so the only thing that differs is height.

     Two earlier goes at this measured the wrong thing. Firing a ray due
     north sails over a three metre wall from eleven metres up and
     reports seeing nothing. Counting PEOPLE on screen is worse: they
     stand beside their own huts, which block them from everywhere, and
     from the middle of the square most of them are behind you whatever
     height you are at. The gates are the thing you actually need to
     see. */
  const gateViews = y => page.evaluate(h => {
    const eye = new THREE.Vector3(0, h + EYE, -2);
    let clear = 0;
    for (const g of GATES) {
      const to = new THREE.Vector3(g.at[0], 1.2, g.at[1]);
      const dir = to.clone().sub(eye);
      const far = dir.length();
      dir.normalize();
      const hits = new THREE.Raycaster(eye, dir, 0.3, far - 1.5)
        .intersectObjects(SHOOTABLE, false);
      if (!hits.length) clear++;
    }
    return clear;
  }, y);

  const fromGround = await gateViews(0.4);
  const fromTop = await gateViews(9.4);
  check('from the ground you cannot see all four gates (' + fromGround + ' of 4)',
        fromGround < 4);
  check('from the top of the tower you can see every one of them (' +
        fromTop + ' of 4)', fromTop === 4);

  /* THE ROCKET BUG. Stepping off the tower holding forwards used to
     accelerate you for the whole way down, because the speed cap only
     applied with your feet on the ground. The first time this was
     tried, a nine metre drop turned into sixty-five metres of travel. */
  console.log('\n--- and stepping off it does not fire you across the county ---');
  await say(';put 0 9.4 -2');
  await say(';look 0 0');
  await wait(200);
  await hold(['KeyW'], 1600);
  await wait(900);
  const landed = await at();
  const flung = Math.hypot(landed.x, landed.z);
  check('walking off the top lands you near the tower (' + flung.toFixed(0) +
        'm away, not 65)', flung < 20);

  // ---------------------------------------------------- phones
  console.log('\n--- the three phone sizes ---');
  const layoutTrouble = pg => pg.evaluate(() => {
    const ids = ['nightpill', 'stuffpill', 'helppill', 'home', 'ready',
                 'tools', 'stick-move', 'btn-up', 'btn-build'];
    const out = [], boxes = [];
    for (const id of ids) {
      const e = document.getElementById(id);
      if (!e || e.hidden) continue;
      const style = getComputedStyle(e);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.right > innerWidth + 1 || r.left < -1 ||
          r.bottom > innerHeight + 1 || r.top < -1) out.push(id + ' off screen');
      boxes.push({ id, r });
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r, c = boxes[j].r;
        if (a.left < c.right - 2 && c.left < a.right - 2 &&
            a.top < c.bottom - 2 && c.top < a.bottom - 2) {
          out.push(boxes[i].id + ' over ' + boxes[j].id);
        }
      }
    }
    return out;
  });

  for (const [w, h, name] of [[320, 568, 'small'], [390, 844, 'tall'], [768, 1024, 'tablet']]) {
    await page.setViewportSize({ width: w, height: h });
    await wait(400);
    const bad = await layoutTrouble(page);
    check(name + ' (' + w + 'x' + h + '): nothing off screen or overlapping' +
          (bad.length ? ' [' + bad.join(', ') + ']' : ''), bad.length === 0);
  }

  await page.setViewportSize({ width: 1000, height: 680 });
  await say(';put 0 9.4 -2');
  await say(';look 0 -0.35');
  await wait(500);
  await page.screenshot({ path: OUT + 'tw-from-the-tower.png' });

  console.log('\n' + (errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no errors at all'));
  check('nothing blew up anywhere in that lot', errs.length === 0);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('BLEW UP: ' + e.message); process.exit(1); });
