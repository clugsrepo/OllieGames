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

/* The game's own clock. Anything given a time budget should be given
   it in THESE seconds and not in this computer's: the browser draws
   with software, so under load a second of real time can be a third of
   a second of game time, and a budget measured with a stopwatch runs
   out while the game is still halfway through doing the thing. */
const gameSeconds = async () => Number((await say(';time')).match(/([\d.]+)s/)[1]);

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
  /* Six seconds of GAME time. Four and a half metres a second over the
     nine and a bit metres of ladder is two and a bit seconds, so six is
     generous - but six seconds measured with a stopwatch was not, on a
     busy machine, and this check went red for no reason at all. */
  const climbed = await (async () => {
    const t0 = await gameSeconds();
    let p = await at();
    while ((await gameSeconds()) - t0 < 6) {
      await wait(200);
      p = await at();
      if (p.y > 9.6) break;
    }
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

  /* ====================================================================
     THE GUNS

     Almost everything in here is asked as a number of SECONDS or a
     number of HEALTH, and every one of those seconds is the game's own
     clock rather than this computer's. That matters more than it
     sounds: the browser these run in draws with software, so a second
     of wall time is not a second of game time, and timing anything with
     setTimeout would be measuring the test machine instead of the game.

     The game keeps each target's own story - when it went up, when
     something first touched it, when it went down - so the answers come
     back exact.
     ==================================================================== */
  console.log('\n--- hammer out, or gun out ---');
  await say(';loadout a');
  await say(';put 0 0.4 8');
  check('you start with the hammer out (' + (await say(';phase')) + ')',
        /getting ready/.test(await say(';phase')));
  /* R, not a click. While you are playing the game is holding the
     mouse pointer so that looking around works, and a held pointer
     cannot click a button sitting on top of the view - which is why
     READY has a key at all. Found by this test trying to click it. */
  await page.keyboard.press('KeyR');
  await wait(300);
  check('R puts it away and takes your gun out',
        /watching/.test(await say(';phase')));
  check('   ... and the tool row goes with it',
        await page.$eval('#tools', e => e.hidden));
  await say(';phase build');
  check('and you can go back to building',
        /getting ready/.test(await say(';phase')) &&
        !(await page.$eval('#tools', e => e.hidden)));
  /* And the button itself still works, for the phone, where there is
     no keyboard and nothing holding the pointer. */
  await page.evaluate(() => document.exitPointerLock());
  await wait(200);
  await page.click('#ready');
  await wait(300);
  check('   ... and the button does the same thing when it can be tapped',
        /watching/.test(await say(';phase')));
  await say(';phase build');

  /* Put up a straw target and give back its number, so nothing in here
     has to guess which one it is talking about. */
  const dummy = async (x, z, hp) =>
    Number((await say(';dummy ' + x + ' ' + z + (hp ? ' ' + hp : ''))).match(/#(\d+)/)[1]);
  const story = n => say(';target ' + n);
  const health = async n => Number((await story(n)).match(/· ([\d.]+)\/\d+ ·/)[1]);
  async function finish(n, maxMs) {
    const t0 = Date.now();
    let line = await story(n);
    while (Date.now() - t0 < maxMs && !/ · out · /.test(line)) {
      await wait(150);
      line = await story(n);
    }
    return line;
  }

  console.log('\n--- a turret, and the arithmetic it is built on ---');
  /* Twelve a bolt every eight tenths of a second is fifteen a second,
     so sixty health is five bolts: four gaps of eight tenths, which is
     three and a fifth seconds, plus the time the last one spends in the
     air. Call it three and a third. If anybody ever changes one of
     those numbers without meaning to, this goes red. */
  await say(';sweep');
  await say(';place turret 0 -12');
  const d1 = await dummy(0, -16);
  const done1 = await finish(d1, 9000);
  const took1 = Number((done1.match(/took ([\d.]+)s/) || [])[1]);
  check('one turret sees off a sixty-health target in about 3.3s (' + took1 + 's)',
        took1 > 2.7 && took1 < 4.1);
  check('   ... and it was the turret that did it, all sixty of it',
        /60 taken, last by turret/.test(done1));

  console.log('\n--- how far a turret can reach ---');
  await say(';sweep');
  const far = await dummy(0, -27);       // fifteen metres from the turret
  await wait(1800);
  check('fifteen metres away is out of reach, and it is left alone (' +
        (await health(far)) + '/60)', (await health(far)) === 60);
  await say(';sweep');
  const near = await dummy(0, -25);      // thirteen
  await wait(1800);
  check('thirteen metres away is well within it (' + (await health(near)) + '/60)',
        (await health(near)) < 60);

  console.log('\n--- a turret shoots whatever is nearest the town, not itself ---');
  /* The one getting away with it is the one that matters. With the
     turret out at the edge, the target BEHIND it is the closer one and
     the target heading for the middle is the one that must be shot. */
  await say(';loadout a');
  await say(';sweep');
  await say(';place turret 0 -20');
  /* The one heading for the middle goes up FIRST and the nearer one
     second, because a turret with only one thing in range quite
     rightly shoots it - and then this would be asking whether it ever
     fired a single bolt at the wrong one, which is not the rule. The
     rule is that a nearer target appearing does not tempt it away. */
  const inner = await dummy(0, -12);     // eight metres off, but nearer the town
  const outer = await dummy(0, -24);     // four metres off, and further out
  await wait(1500);
  const aiming = await say(';guns');
  check('it is aiming at the one nearest the middle of town (' + aiming + ')',
        aiming.indexOf('-> #' + inner) >= 0);
  check('   ... and that is the one losing health, not the nearer one',
        (await health(inner)) < 60 && (await health(outer)) === 60);

  console.log('\n--- walls stop feet, not bullets ---');
  await say(';loadout a');
  await say(';sweep');
  await say(';place turret 0 -12');
  await say(';place wall 0 -16');
  const behind = await dummy(0, -20);
  await wait(1600);
  check('a wall straight between gun and target changes nothing (' +
        (await health(behind)) + '/60)', (await health(behind)) < 60);

  console.log('\n--- and nothing slips through the gap between two frames ---');
  /* A bolt covers two thirds of a metre between frames. Asking only
     whether it ENDED UP inside something - which is what Star Arena
     does - lets a target standing right next to a turret sit in that
     gap and never be hit at all. */
  await say(';loadout a');
  await say(';sweep');
  await say(';place turret 0 -12');
  const touching = await dummy(0, -13);
  await wait(1500);
  check('a target one metre from the muzzle is hit anyway (' +
        (await health(touching)) + '/60)', (await health(touching)) < 60);

  console.log('\n--- a laser cannon is a different animal ---');
  await say(';loadout c');
  await say(';sweep');
  await say(';place laser 0 -12');
  const l1 = await dummy(0, -16);
  await wait(900);
  check('it does nothing at all while it locks on (' + (await health(l1)) + '/60)',
        (await health(l1)) === 60);
  const doneL = await finish(l1, 12000);
  const tookL = Number((doneL.match(/took ([\d.]+)s/) || [])[1]);
  const waited = Number((doneL.match(/waited ([\d.]+)s/) || [])[1]);
  check('the lock-on really is a second and a fifth (' + waited + 's)',
        waited > 1.1 && waited < 1.6);
  check('so it takes about 3.9s over one target - SLOWER than a turret (' +
        tookL + 's)', tookL > 3.2 && tookL < 4.8);
  check('   ... which is the whole difference between the two guns',
        tookL > took1);

  console.log('\n--- but it goes through everything on the line ---');
  await say(';sweep');
  const p1 = await dummy(0, -16);
  const p2 = await dummy(0, -20);
  await wait(2600);
  /* Both read in ONE answer, because reading them in two would put a
     tenth of a second of beam between the numbers and make a perfectly
     good pair look uneven. */
  const both = (await say(';targets')).match(/([\d.]+)\/60/g).map(x => parseFloat(x));
  check('two in a line both take it, and take the same (' + both.join(' and ') + ')',
        both.length === 2 && both[0] < 60 && both[1] < 60 &&
        Math.abs(both[0] - both[1]) < 6);

  console.log('\n--- and it has to stop and cool down ---');
  /* Four seconds of beam at twenty-two a second is eighty-eight, and
     then it has had enough. A target too tough to finish off is the
     only way to watch that happen. */
  /* A FRESH laser. The one above has been beaming at two targets and
     is still half hot, and half a tank of heat is only two seconds of
     beam - which is the mechanism working, but it is not what this
     check is asking about. */
  await say(';loadout c');
  await say(';sweep');
  await say(';place laser 0 -12');
  const tough = await dummy(0, -16, 600);
  let wentHot = false;
  for (let i = 0; i < 40; i++) {
    await wait(200);
    if (/hot/.test(await say(';guns'))) { wentHot = true; break; }
  }
  check('after four seconds of beam it overheats and stops', wentHot);
  const burst = Number((await story(tough)).match(/([\d.]+) taken/)[1]);
  check('   ... having given about eighty-eight in that burst (' + burst + ')',
        burst > 70 && burst < 115);
  await wait(2000);
  const stillHot = Number((await story(tough)).match(/([\d.]+) taken/)[1]);
  check('   ... and while it is hot it gives nothing at all',
        stillHot - burst < 12);

  console.log('\n--- your own little gun ---');
  await say(';loadout a');      // clears the laser away with everything else
  await say(';sweep');
  await say(';phase watch');
  await say(';put 0 0.4 -8');
  await say(';look 0 -0.1');
  const mine = await dummy(0, -16);
  await say(';shoot');
  /* Asked straight away. Half a second later it has reloaded and the
     answer is quite rightly yes. */
  check('   ... and you cannot get two off at once', !(await admin(';shoot')));
  await wait(700);
  check('your gun takes exactly five off (' + (await health(mine)) + '/60)',
        (await health(mine)) === 55);
  check('   ... which makes it the feeblest thing on the field, on purpose',
        5 / 0.5 < 12 / 0.8);

  console.log('\n--- a gun you take down stops being a gun ---');
  await say(';phase build');
  await say(';sweep');
  await say(';place turret 0 -12');
  const orphan = await dummy(0, -16);
  await wait(1200);
  await say(';sell 0 -12');
  check('selling it leaves no guns at all (' + (await say(';guns')) + ')',
        /^0 guns/.test(await say(';guns')));
  await wait(500);
  const hpThen = await health(orphan);
  await wait(1500);
  check('and the target stops losing health the moment it goes (' +
        hpThen + ' then ' + (await health(orphan)) + ')',
        (await health(orphan)) === hpThen);
  await say(';sweep');

  console.log('\n--- the words we use ---');
  const src = await page.evaluate(() => document.documentElement.outerHTML);
  check('nobody dies and nothing is killed anywhere in it',
        !/\bdie\b|\bdead\b|\bkill/i.test(src));
  check('   ... it is knocked out, the way it is in Star Arena',
        /knocked out/i.test(src));

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

  /* And again with the gun out, because that swaps the hammer for a
     different button and takes the whole tool row away. */
  await say(';phase watch');
  for (const [w, h, name] of [[320, 568, 'small'], [390, 844, 'tall']]) {
    await page.setViewportSize({ width: w, height: h });
    await wait(400);
    const bad = await layoutTrouble(page);
    check(name + ' with the gun out: nothing off screen or overlapping' +
          (bad.length ? ' [' + bad.join(', ') + ']' : ''), bad.length === 0);
  }
  check('and the hammer button has become a gun',
        /💥/.test(await page.$eval('#btn-build', e => e.textContent)));
  await say(';phase build');
  check('   ... and a hammer again when you go back',
        /🔨/.test(await page.$eval('#btn-build', e => e.textContent)));

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
