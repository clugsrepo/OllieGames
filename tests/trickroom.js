/* Trick Room, in a real browser.

   Every check here goes through the game as a player would - real keys,
   real clicks, the admin panel - and there is not one line of test-only
   code in the game itself.

   The hard part of testing a room full of illusions is that "it looks
   right" is exactly what an illusion is for. So nothing in here squints
   at a screenshot. Each trick is asked a question with a NUMBER for an
   answer, from the magic spot and then from somewhere else, and the
   answer has to be right in both places. An illusion that works from
   everywhere is not an illusion, it is a mistake. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const OUT = '/tmp/claude-0/-home-user-OllieGames/30e3b9ca-dcff-5425-9868-5f2b3cb63fbb/scratchpad/';
const GAME = 'http://127.0.0.1:8099/games/trickroom/index.html';
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

/* Hold the keys down and keep looking, rather than holding them for a
   guessed number of milliseconds and hoping. On a machine drawing a
   frame every fiftieth of a second a second of held W is seven metres;
   on this one, with two portals being drawn, it can be two. Timing the
   walk made the test flaky without the game being flaky at all. */
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
  console.log('--- the room, and the two ways of looking ---');
  check('it starts up with no complaints', errs.length === 0);
  await page.click('#btn-play');
  await wait(600);
  check('pressing START puts you in it', await page.$eval('#start', e => e.hidden));
  check('and you start off building', (await page.$eval('#modename', e => e.textContent)) === 'BUILDING');
  check('with the box of tricks out', !(await page.$eval('#tools', e => e.hidden)));

  const spawn = await at();
  check('you are looking across the room, not at the nearest wall (z ' +
        spawn.z + ', yaw ' + spawn.yaw + ')', spawn.z > 10 && Math.abs(spawn.yaw) < 0.2);

  // ---------------------------------------------------- W goes forwards
  /* The question that matters is not "did I move" but "did I get NEARER
     to the thing I am looking at". W walking backwards passes any test
     that only checks you moved, because exactly reversed is still
     moving - which is how it went unnoticed the first time. */
  await say(';mode walk');
  await say(';put 0 0.2 20');
  await say(';look 0 0');
  const markAhead = { x: 0, z: -20 };
  const before = Math.hypot(0 - markAhead.x, 20 - markAhead.z);
  await hold(['KeyW'], 700);
  await wait(120);
  const p1 = await at();
  const after = Math.hypot(p1.x - markAhead.x, p1.z - markAhead.z);
  check('W takes you TOWARDS what you are looking at (' +
        before.toFixed(1) + 'm -> ' + after.toFixed(1) + 'm)', after < before - 1);

  await say(';put 0 0.2 20');
  await say(';look 1.5708 0');
  await hold(['KeyW'], 600);
  const p2 = await at();
  check('and looking left then walking takes you left (x ' + p2.x + ')', p2.x < -1);

  // ---------------------------------------------------- portals
  console.log('\n--- portals are really windows, and you go through them ---');
  await say(';clear');
  await say(';portal blue -35 0 0 1 0 0');
  await say(';portal orange 35 0 0 -1 0 0');
  check('both portals are up', /facing 1\.0.*facing -1\.0/s.test(await say(';portals')));

  /* Walk at the left-hand wall and you should turn up at the right-hand
     one, thirty-five metres away - but do not ask for x to be past
     thirty-four, because you come out of a portal walking AWAY from it,
     which means holding W marches you straight back across the room to
     the other portal and through it again. Which is exactly right, and
     very funny, and no way to write a test: asking to catch somebody in
     the last metre of a ping-pong match is asking to be unlucky. The
     far HALF of the room is the honest question. */
  await say(';put -33 0.2 0');
  await say(';look 1.5708 0');
  const out = await walkTill(['KeyW'], p => p.x > 20, 6000);
  check('walk into one and you come out at the other side of the room (x ' +
        out.x + ')', out.x > 20);
  check('and you come out going the way you went in (yaw ' + out.yaw + ')',
        Math.abs(Math.abs(out.yaw) - 1.5708) < 0.2);

  /* ---- what the portals cost ----

     Two extra draws of the whole room every frame is the thing that
     could have sunk this game, so it gets measured.

     Measuring it took three goes. Averaging how long a frame takes is
     useless here: this machine is shared, draws everything in software,
     and gave 49ms, 71ms, 105ms and once 197ms for identical code.
     Timing the drawing from inside the page is worse - the answer comes
     back as nought, because the real work happens in another process
     and nothing in the page can wait for it.

     What IS steady is the SHORTEST gap between frames. The screen
     refreshes sixty times a second, so a frame that is ready in time
     waits for the next refresh and the gap is 16.7ms; one that misses
     waits for the one after, and the gap is 33.3ms. The shortest gap
     over a hundred and fifty frames therefore says exactly how many
     refreshes the drawing needs, and it came back the same to one
     decimal place every single time:

        a plain frame   16.7ms  - one refresh, sixty a second
        with portals    33.2ms  - two refreshes, thirty a second

     So the portals cost about one extra refresh on a machine with no
     graphics card at all, and that is the number this checks. */
  const gaps = n => page.evaluate(count => new Promise(done => {
    const ts = []; let seen = 0;
    const tick = t => {
      ts.push(t);
      if (++seen < count) return requestAnimationFrame(tick);
      const g = [];
      for (let i = 1; i < ts.length; i++) g.push(ts[i] - ts[i - 1]);
      g.sort((a, b) => a - b);
      done({ quickest: g[0], middling: g[Math.floor(g.length / 2)] });
    };
    requestAnimationFrame(tick);
  }), n);

  await say(';put 0 6 25');
  await say(';look 0 0');
  await say(';clear');
  await gaps(40);                       // warm up, and throw it away
  const plain = await gaps(150);
  check('an empty room is ready inside one screen refresh (' +
        plain.quickest.toFixed(1) + 'ms at its quickest)', plain.quickest < 20);

  await say(';portal blue -35 0 0 1 0 0');
  await say(';portal orange 35 0 0 -1 0 0');
  await gaps(40);
  const both = await gaps(150);
  console.log('  (quickest frame: ' + plain.quickest.toFixed(1) + 'ms plain, ' +
              both.quickest.toFixed(1) + 'ms with both portals drawn)');
  check('and two portals on screen still make it in two (' +
        both.quickest.toFixed(1) + 'ms, want 34 or under)', both.quickest < 34);

  // ---------------------------------------------------- holes
  console.log('\n--- a painted hole holds you up, a real one does not ---');
  await say(';clear');
  await say(';hole fake 6 0');
  await say(';hole real -6 0');
  await say(';mode walk');
  await say(';put 6 0.2 0');
  await wait(900);
  const onFake = await at();
  check('standing on the painted one, you stay on the floor (y ' + onFake.y + ')',
        onFake.y > -1);
  await say(';put -6 0.2 0');
  /* Watching it fall rather than peeking once. A single peek caught it
     a foot down and called that "did not fall", which was the test
     being impatient and not the hole being wrong. */
  let deepest = 0;
  for (let i = 0; i < 12; i++) { await wait(100); deepest = Math.min(deepest, (await at()).y); }
  check('standing on the real one, down you go (' + deepest.toFixed(1) + 'm down)',
        deepest < -8);
  await wait(1200);
  const back = await at();
  check('and you end up beside it, not down it again (' +
        back.x.toFixed(1) + ',' + back.y.toFixed(1) + ')', back.y > -1);

  console.log('\n--- building shows the truth, walking hides it ---');
  await say(';mode build');
  const shown = await say(';marks');
  check('both holes wear a sign while you are building (' + shown + ')', /^2 of 2/.test(shown));
  await say(';mode walk');
  const hidden = await say(';marks');
  check('and the signs come off the moment you walk (' + hidden + ')', /^0 of 2/.test(hidden));

  // ---------------------------------------------------- the hidden door
  console.log('\n--- the door that is only there from one spot ---');
  await say(';clear');
  await say(';mode walk');
  await say(';door 0 22 0');
  await wait(200);
  const onSpot = num(await say(';lineup'));
  check('from the magic spot all 24 pieces land in a door-shaped box (' +
        onSpot[1] + ' x ' + onSpot[2] + ')',
        onSpot[0] === 24 && onSpot[1] < 0.5 && onSpot[2] > onSpot[1]);

  await say(';put 3 0.2 22');
  const threeRight = num(await say(';lineup'));
  check('three steps right and it falls to bits (' + threeRight[1] + ' wide, was ' +
        onSpot[1] + ')', threeRight[1] > onSpot[1] * 2);

  await say(';put -6 0.2 22');
  const sixLeft = num(await say(';lineup'));
  check('six steps left and it is confetti (' + sixLeft[1] + ' wide)',
        sixLeft[1] > onSpot[1] * 3);

  // ---------------------------------------------------- the twins
  console.log('\n--- two boxes the same size, one of them enormous ---');
  await say(';clear');
  await say(';mode walk');
  const built = await say(';pair 0 22 0');
  const sizes = num(built);
  check('one is little and near, one is a whopper far off (' + built + ')',
        sizes[0] < 1 && sizes[2] > 2 && sizes[3] > sizes[1] * 3);

  await wait(200);
  /* near <w> wide at <x> · far <w> wide at <x> · same size to <r>x · <g> apart,
     where x goes from -1 at the left of the screen to +1 at the right. */
  const twins = async () => {
    const line = await say(';twins');
    const n = num(line);
    return { line, nearWide: n[0], nearAt: n[1], farWide: n[2], farAt: n[3],
             ratio: n[4], apart: n[5] };
  };
  const twinsOn = await twins();
  check('from the magic spot they look the same size (' + twinsOn.ratio +
        ' times as big)', Math.abs(twinsOn.ratio - 1) < 0.06);
  check('and they sit side by side, not on top of each other (' + twinsOn.apart + ' apart)',
        twinsOn.apart > 0.05);
  check('and both of them are on the screen (' + twinsOn.nearAt + ' and ' +
        twinsOn.farAt + ')', Math.abs(twinsOn.nearAt) < 1 && Math.abs(twinsOn.farAt) < 1);

  /* Stepping sideways does not change how BIG they look much - a box
     three paces off and a box fifteen metres off both stay roughly the
     size they were. What falls apart is where they SIT: the near one
     swings right across your view while the far one barely shifts, and
     the tidy little pair comes apart. That is the number to watch. */
  await say(';put 3 0.2 22');
  const twinsOff = await twins();
  check('three steps sideways and the pair comes apart (' + twinsOff.apart +
        ' apart, was ' + twinsOn.apart + ')', twinsOff.apart > twinsOn.apart * 2.5);
  check('   ... with the near one swung clean off the side of the screen (' +
        twinsOff.nearAt + ') while the far one hardly moved (' + twinsOff.farAt + ')',
        Math.abs(twinsOff.nearAt) > 1 && Math.abs(twinsOff.farAt) < 0.3);

  // ---------------------------------------------------- bigger inside
  console.log('\n--- a shed that is bigger inside than outside ---');
  await say(';clear');
  await say(';mode walk');
  const madeShed = await say(';shed');
  check('one press builds the shed and the hall (' + madeShed + ')', /shed 4\.0/.test(madeShed));

  /* Inside the little shed, measured. Getting in needs building mode,
     where you float through walls - which is the only way in, because
     the doorway is a portal and walking at it takes you somewhere
     else entirely. That IS the trick. */
  await say(';mode build');
  await say(';put 0 -0.4 14');
  await wait(200);
  const inShed = num(await say(';span'));
  check('the shed really is a shed inside (' + inShed[0] + ' across)',
        inShed[0] > 2 && inShed[0] < 5);

  await say(';mode walk');
  await say(';put 0 0.2 19');
  await say(';look 0 0');
  const inside = await walkTill(['KeyW'], p => p.z < -25, 6000);
  check('walk in the shed door and you are right across the room (z ' +
        inside.z + ')', inside.z < -25);
  await say(';put 0 0.2 -22');       // out from between the pillars to measure
  await wait(200);
  const hall = num(await say(';span'));
  check('and the room you came out in is ' + hall[0] + ' across, not ' + inShed[0],
        hall[0] > 20);
  check('   ... and ' + hall[1] + ' deep', hall[1] > 15 && hall[1] < 26);

  await page.screenshot({ path: OUT + 'tr-inside-hall.png' });

  /* Out again the way you came, which has to work or the shed is a
     trap rather than a trick. You come out of a portal facing away from
     it, exactly like coming through a door, so getting out means
     turning round and walking back at the wall you appeared from. */
  await say(';put 0 0.2 -30');
  await say(';look 0 0');
  const outAgain = await walkTill(['KeyW'], p => p.z > 10, 6000);
  check('and you can walk back out to the shed again (z ' + outAgain.z + ')',
        outAgain.z > 10);

  console.log('\n--- taking it all away again ---');
  const solidsBefore = await page.evaluate(() => SOLIDS.length);
  await say(';clear');
  const solidsAfter = await page.evaluate(() => SOLIDS.length);
  check('clearing the room takes the shed walls out of the world too (' +
        solidsBefore + ' -> ' + solidsAfter + ')', solidsAfter < solidsBefore - 10);
  check('and both portals come down with it', /not placed.*not placed/s.test(await say(';portals')));
  await say(';mode walk');
  await say(';put 0 0.2 20');
  await say(';look 0 0');
  const walkThrough = await walkTill(['KeyW'], p => p.z < 13, 6000);
  check('and you can walk straight through where it was (z ' + walkThrough.z + ')',
        walkThrough.z < 13);

  // ---------------------------------------------------- phones
  console.log('\n--- the three phone sizes ---');
  for (const [w, h, name] of [[320, 568, 'small'], [390, 844, 'tall'], [768, 1024, 'tablet']]) {
    await page.setViewportSize({ width: w, height: h });
    await wait(400);
    const bad = await page.evaluate(() => {
      const out = [];
      for (const id of ['tools', 'swap', 'modepill', 'countpill', 'helppill', 'home']) {
        const e = document.getElementById(id);
        if (!e || e.hidden) continue;
        const r = e.getBoundingClientRect();
        if (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1) out.push(id);
      }
      const t = document.getElementById('tools').getBoundingClientRect();
      const s = document.getElementById('swap').getBoundingClientRect();
      if (t.bottom > s.top + 1) out.push('tools over swap');
      return out;
    });
    check(name + ' (' + w + 'x' + h + '): nothing off screen or overlapping' +
          (bad.length ? ' [' + bad.join(', ') + ']' : ''), bad.length === 0);
  }

  console.log('\n' + (errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no errors at all'));
  check('nothing blew up anywhere in that lot', errs.length === 0);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('BLEW UP: ' + e.message); process.exit(1); });
