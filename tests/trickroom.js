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

  // ---------------------------------------------------- a body
  console.log('\n--- there is somebody there now ---');
  await say(';mode walk');
  await say(';put 0 0.2 10');
  await say(';look 0 0');
  await say(';view first');
  await wait(200);
  const unseen = await page.evaluate(() => myBody.group.visible);
  check('through your own eyes you cannot see your own body', unseen === false);

  await say(';view third');
  await wait(300);
  const third = await say(';view');        // asked AFTER a frame has drawn
  check('press V and there you are (' + third + ')', /at yourself/.test(third));
  check('   ... and the camera really has moved back (' +
        num(third)[0] + 'm)', num(third)[0] > 3);
  check('   ... and now you can see yourself',
        (await page.evaluate(() => myBody.group.visible)) === true);

  /* Backed up against a wall the camera has to stop short, or it ends up
     inside the bricks showing you the inside of the world. */
  await say(';put 0 0.2 33');          // front wall is at z 35
  await say(';look 0 0');              // facing the room, back to the wall
  await wait(350);
  const squashed = num(await say(';view'))[0];
  check('with your back to a wall the camera stops short of it (' +
        squashed + 'm, not 3.6)', squashed < 2.6);

  await say(';view first');
  await wait(150);

  console.log('\n--- but the tricks still belong to your own eyes ---');
  await say(';clear');
  await say(';door 0 22 0');
  await wait(200);
  const ownEyes = await say(';lineup');
  check('from your own eyes the pieces sit right on the door (' +
        num(ownEyes)[3] + ' off)', /your own eyes/.test(ownEyes) && num(ownEyes)[3] < 0.01);
  await say(';view third');
  await wait(350);
  const fromBehind = await say(';lineup');
  /* Straight backwards is the KINDEST way to move away from this trick:
     every piece stays roughly on the ray it was put on, just further
     off. So the door only drifts a little - and the box it fits in
     actually gets SMALLER, which is how the first version of this check
     managed to call a broken door a fixed one. */
  check('from behind your head the door has drifted off its outline (' +
        num(fromBehind)[3] + ' off, was ' + num(ownEyes)[3] + ')',
        /behind you/.test(fromBehind) && num(fromBehind)[3] > 0.02);
  await say(';view first');

  /* The twin boxes are a different story, and this is the one that
     earns third person its warning. They are built out of DISTANCES -
     one box near and small, one far and huge, arranged to look the same
     - and backing the camera up changes every distance in the sum. */
  await say(';clear');
  await say(';pair 0 22 0');
  await wait(250);
  const twinsEye = num(await say(';twins'))[4];
  await say(';view third');
  await wait(350);
  const twinsBack = num(await say(';twins'))[4];
  check('and the twin boxes stop matching altogether from back there (' +
        twinsBack + ' times as big, was ' + twinsEye + ')',
        Math.abs(twinsEye - 1) < 0.06 && Math.abs(twinsBack - 1) > 0.15);
  await say(';view first');
  await say(';clear');

  // ---------------------------------------------------- hiding
  console.log('\n--- being part of the wall ---');
  await say(';clear');
  await say(';mode walk');
  await say(';put 0 0.2 0');            // middle of the room, nothing near
  await wait(200);
  const nowhere = await admin(';hide on');
  check('out in the open there is nothing to hide against', nowhere === false);

  /* Back to the left-hand wall, which is at x -35. */
  await say(';put -34.3 0.2 0');
  await say(';look 1.5708 0');
  const pressed = await say(';hide on');
  check('with your back to a wall you start melting into it (' + pressed + ')',
        /settling/.test(pressed));
  await wait(900);
  const melted = await say(';hide');       // asking, not pressing again
  check('and half a second later you have gone (' + melted + ')', /gone/.test(melted));

  const blended = await say(';blended');
  check('every last bit of you is the wall colour, not a near miss (' +
        blended + ')', /^0 of \d+ bits/.test(blended));

  /* The colour is the WALL'S OWN material, so it cannot be a shade out
     however the lights change. */
  const sameStuff = await page.evaluate(() =>
    !!hideWall && myBody.skins.every(m => m.material === hideWall.look));
  check('   ... because it is the wall\'s own paint, not a copy of it', sameStuff);

  console.log('\n--- and moving gives you away ---');
  await hold(['KeyW'], 300);
  await wait(200);
  const spotted = await say(';hide');
  check('one step and you are out in the open again (' + spotted + ')',
        /Out in the open/.test(spotted));
  const ownAgain = await page.evaluate(() =>
    myBody.skins.every((m, i) => m.material === myBody.colours[i]));
  check('   ... and you have your own colours back', ownAgain);

  await say(';put -34.3 0.2 0');
  await say(';hide on');
  await wait(800);
  await say(';mode build');
  await wait(200);
  const floated = await page.evaluate(() => ({
    gone: hidden, wall: !!hideWall,
    own: myBody.skins.every((m, i) => m.material === myBody.colours[i])
  }));
  check('you cannot hide while floating about building',
        !floated.gone && !floated.wall && floated.own);
  await say(';mode walk');

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

  await say(';portal blue -35 0 0 1 0 0');
  await say(';portal orange 35 0 0 -1 0 0');
  await gaps(40);
  const both = await gaps(150);
  console.log('  (quickest frame: ' + plain.quickest.toFixed(1) + 'ms plain, ' +
              both.quickest.toFixed(1) + 'ms with both portals drawn)');
  if (plain.quickest > 34) {
    console.log('  (the machine is busy - on a quiet one this is 16.6ms either way)');
  }
  /* The one that has to hold: whatever this machine happens to be doing
     at the time, both measurements are taken a few seconds apart under
     the same conditions, so the DIFFERENCE between them is the
     portals. One extra refresh, against the three times the drawing the
     plan was braced to pay for. */
  check('two portals on screen cost no more than one extra refresh (' +
        both.quickest.toFixed(1) + 'ms against ' + plain.quickest.toFixed(1) + ')',
        both.quickest <= plain.quickest + 17);
  /* And a very loose floor under the whole thing, which only goes off
     if something has gone properly wrong rather than if the machine is
     having a busy afternoon. */
  check('and the game is still playable at ' + both.quickest.toFixed(0) + 'ms a frame',
        both.quickest < 120);

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
  check('   ... sitting right on the door they make (' + onSpot[3] + ' off)',
        onSpot[3] < 0.01);

  await say(';put 3 0.2 22');
  const threeRight = num(await say(';lineup'));
  check('three steps right and it falls to bits (' + threeRight[1] + ' wide, was ' +
        onSpot[1] + '; ' + threeRight[3] + ' off the door)',
        threeRight[1] > onSpot[1] * 2 && threeRight[3] > 0.1);

  await say(';put -6 0.2 22');
  const sixLeft = num(await say(';lineup'));
  check('six steps left and it is confetti (' + sixLeft[1] + ' wide, ' +
        sixLeft[3] + ' off)', sixLeft[1] > onSpot[1] * 3 && sixLeft[3] > 0.2);

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
  /* Where everything is, asked rather than written in by hand. The hall
     has moved once already and six checks in here carried its z around
     with them; now there is one answer and they all read it.

     Read by NAME, not by counting numbers along the line - counting is
     how you get a test that breaks the next time somebody adds a figure
     to the middle of a sentence. */
  const spot = (text, label) => {
    const m = new RegExp(label + ' (-?[\\d.]+),(-?[\\d.]+)').exec(text);
    return m ? { x: Number(m[1]), z: Number(m[2]) } : null;
  };
  const door = spot(madeShed, 'doorway at');
  const hallMid = spot(madeShed, 'hall middle at');
  const comeOut = spot(madeShed, 'you come out at');
  check('and it says where everything is', !!door && !!hallMid && !!comeOut);
  const hallZ = hallMid.z, comeOutZ = comeOut.z, doorZ = door.z;

  /* The whole point of the move: from inside the room you cannot see
     the thing you are about to be inside. Fire a ray from where you
     stand straight at the hall and it has to hit the room's own back
     wall long before it gets there. */
  await say(';put 0 0.2 20');
  const blocked = await page.evaluate(zAt => {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, 1.6, 20), new THREE.Vector3(0, 0, -1), 0.1, 400);
    const hits = ray.intersectObjects(SHOOTABLE, false);
    return hits.length ? hits[0].distance : -1;
  }, hallZ);
  check('and from in the room you cannot see the hall at all - the back ' +
        'wall is in the way ' + blocked.toFixed(1) + 'm off, it is ' +
        Math.abs(hallZ - 20).toFixed(0) + 'm off',
        blocked > 0 && blocked < Math.abs(hallZ - 20) - 20);

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
  const inside = await walkTill(['KeyW'], p => p.z < comeOutZ + 6, 6000);
  check('walk in the shed door and you are somewhere else entirely (z ' +
        inside.z + ', the shed door is at ' + doorZ + ')',
        inside.z < comeOutZ + 6);
  await say(';put 0 0.2 ' + hallZ);  // out from between the pillars to measure
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
  await say(';put 0 0.2 ' + (comeOutZ + 2));
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

  // ---------------------------------------------------- keeping it
  console.log('\n--- the room is still there next time ---');
  await say(';clear');
  await say(';hole real -7 3');
  await say(';hole fake 7 3');
  await say(';door 2 20 0.5');
  await say(';pair -2 18 -0.4');
  await say(';shed');
  const builtList = await say(';tricks');
  const written = await say(';saved');
  check('everything you built gets written down (' + written + ')',
        /5 written down/.test(written) && /2 portals/.test(written));

  await page.reload({ waitUntil: 'load' });
  await wait(1200);
  await page.click('#btn-play');
  await wait(500);
  const cameBack = await say(';tricks');
  check('and it is all there again after a reload', cameBack === builtList);
  check('   ... portals and all (' + (await say(';portals')).slice(0, 60) + ')',
        !/not placed/.test(await say(';portals')));

  /* The shed is a building, so coming back has to rebuild its walls as
     well as its picture - a shed you can walk through is not a shed. */
  await say(';mode walk');
  await say(';put 0 0.2 19');
  await say(';look 0 0');
  /* Where the hall is was asked once, at the top. Asking ;shed again
     here gets you a flat refusal - there is already a shed, which is
     exactly what this check is about. */
  const wentIn = await walkTill(['KeyW'], p => p.z < comeOutZ + 6, 6000);
  check('and the shed that came back still takes you to the hall (z ' +
        wentIn.z + ')', wentIn.z < comeOutZ + 6);

  console.log('\n--- a fiddled notebook cannot build anything ---');
  /* Somebody will open the notebook and type in it - it is a file on a
     computer. The rule is that we walk OUR list and ask it about each
     kind we know, so a made-up one is never asked about. */
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.indexOf('ollie-trickroom') === 0);
    localStorage.setItem(key, JSON.stringify({ v: 1, tricks: [
      { kind: 'realhole', x: 4, z: 4 },                    // a good one
      { kind: 'deathtrap', x: 0, z: 0 },                   // made up
      { kind: 'constructor', x: 0, z: 0 },                 // cheeky
      { kind: 'realhole', x: 99999, z: 0 },                // miles away
      { kind: 'realhole', x: 'over there', z: 0 },         // a word
      { kind: 'fakehole' },                                // no numbers at all
      'just a string',
      null
    ], portals: [['x', 0, 0, 1, 0, 0], null] }));
  });
  await page.reload({ waitUntil: 'load' });
  await wait(1200);
  await page.click('#btn-play');
  await wait(500);
  const afterFiddle = await say(';tricks');
  check('only the one real trick in a notebook of nonsense survives (' +
        afterFiddle + ')', afterFiddle === 'realhole 4.0,4.0');
  check('and no portal went up from a made-up one',
        /not placed.*not placed/s.test(await say(';portals')));
  const stillErrs = errs.length;
  check('and reading it threw nothing', stillErrs === 0);

  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.indexOf('ollie-trickroom') === 0);
    localStorage.setItem(key, 'this is not even json {{{');
  });
  await page.reload({ waitUntil: 'load' });
  await wait(1200);
  await page.click('#btn-play');
  await wait(400);
  check('a notebook full of gibberish just gives you an empty room (' +
        (await say(';tricks')) + ')', /nothing in here/.test(await say(';tricks')));

  // ---------------------------------------------------- phones
  /* Everything on the screen against everything else on the screen.
     The first go at this only asked whether each thing was inside the
     window, and whether two named things overlapped - and missed the
     badges sitting on top of the Home button, and the whole box of
     tricks sitting under somebody's left thumb. Ask about every pair
     and there is nowhere for that to hide. */
  const layoutTrouble = pg => pg.evaluate(() => {
    const ids = ['tools', 'swap', 'modepill', 'countpill', 'helppill', 'home',
                 'stick-move', 'btn-up', 'btn-down', 'btn-view', 'btn-hide'];
    const out = [], boxes = [];
    for (const id of ids) {
      const e = document.getElementById(id);
      if (!e || e.hidden) continue;
      const style = getComputedStyle(e);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;          // not really there
      if (r.right > innerWidth + 1 || r.left < -1 ||
          r.bottom > innerHeight + 1 || r.top < -1) out.push(id + ' off screen');
      boxes.push({ id, r });
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r, b = boxes[j].r;
        if (a.left < b.right - 2 && b.left < a.right - 2 &&
            a.top < b.bottom - 2 && b.top < a.bottom - 2) {
          out.push(boxes[i].id + ' over ' + boxes[j].id);
        }
      }
    }
    return out;
  });

  console.log('\n--- the three phone sizes ---');
  /* In BUILDING, because that is when there is most on the screen: the
     whole box of tricks is out. Checking this while walking proves
     nothing, since the tools are hidden and a hidden thing cannot be
     in the way of anything. */
  await say(';mode build');
  for (const [w, h, name] of [[320, 568, 'small'], [390, 844, 'tall'], [768, 1024, 'tablet']]) {
    await page.setViewportSize({ width: w, height: h });
    await wait(400);
    const bad = await layoutTrouble(page);
    if (await page.$eval('#tools', e => e.hidden)) bad.push('the tools are not even out');
    check(name + ' (' + w + 'x' + h + '): nothing off screen or overlapping' +
          (bad.length ? ' [' + bad.join(', ') + ']' : ''), bad.length === 0);
  }

  /* And the same again on something with a touchscreen, where the
     stick and the up/down buttons come out and the whole bottom of the
     screen belongs to two thumbs. This needs a browser of its own -
     you cannot hand a page a touchscreen after it has opened. */
  console.log('\n--- and on something you hold in your hands ---');
  const phone = await b.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true
  });
  await phone.addInitScript(() => localStorage.setItem('ollie-games-player', 'Ollie'));
  const handheld = await phone.newPage();
  const phoneErrs = [];
  handheld.on('pageerror', e => phoneErrs.push(String(e)));
  await handheld.goto(GAME, { waitUntil: 'load' });
  await wait(900);
  check('it knows it is being held, and puts the thumb controls out',
        !(await handheld.$eval('#touch', e => e.hidden)));
  await handheld.tap('#btn-play');
  await wait(700);
  await handheld.evaluate(() => window.OllieAdmin.run(';shed'));
  await wait(500);
  const phoneBad = await layoutTrouble(handheld);
  check('phone (390x844): nothing off screen, and nothing on top of' +
        ' anything else' + (phoneBad.length ? ' [' + phoneBad.join(', ') + ']' : ''),
        phoneBad.length === 0);
  check('and you can still reach the tools with a thumb',
        !(await handheld.$eval('#tools', e => e.hidden)));
  check('nothing blew up on the phone either' +
        (phoneErrs.length ? ': ' + phoneErrs.join(' | ') : ''), phoneErrs.length === 0);
  await phone.close();

  console.log('\n' + (errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no errors at all'));
  check('nothing blew up anywhere in that lot', errs.length === 0);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('BLEW UP: ' + e.message); process.exit(1); });
