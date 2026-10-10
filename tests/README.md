# The tests

These drive the real games in a real browser — the actual DOM, actual key
and mouse events, and `OllieAdmin.run()`, which is a real shipped thing
rather than a back door. **There is no test-only code inside any game.**

They live in here because they have now been lost three times to a machine
being wiped, and rebuilding them from memory each time is daft.

## Running them

Chromium is already installed. **Do not run `playwright install`.**

Serve the site first:

```bash
npx http-server . -p 8099 -c-1
```

Then:

```bash
node tests/chunkpip.js     # Chunk & Pip on one keyboard: every floor
node tests/trickroom.js    # Trick Room: all four illusions, measured
node tests/deep.js         # Deep Blue  (not yet moved in here)
```

For the two that need the room server, start it as well:

```bash
cd tools/game-rooms
npx wrangler dev --local --port 8787 \
  --var ALLOWED_ORIGINS:"http://127.0.0.1:8099,http://localhost:8099"
```

```bash
node tests/rooms.js        # the room server on its own
node tests/net.js          # two browsers in one room
```

`tests/net.js` fills in `ROOM_SERVER` as it loads the page, exactly the way
deploying the Worker would. The shipped game still has it empty, which is
correct — joining stays off until a grown-up switches it on.

## What they're actually checking

The interesting ones aren't "does it run", they're the promises:

- **Every floor of Chunk & Pip is impossible on your own.** Not "harder" —
  impossible. Each floor gets a check that drives one character with the
  other parked and proves the door never opens.
- **No words ever travel between two players.** Seven goes at smuggling
  text through the room server, all dropped, with a normal message still
  working straight afterwards.
- **Only the host moves everybody on to the next floor.** The joiner being
  able to do it would mean two machines disagreeing about whether you'd
  finished.
- **Standing still costs nothing.** The free allowance is 100,000 messages
  a day, so two children thinking about a puzzle must send none at all.
- **Every illusion in Trick Room works from one spot and nowhere else.**
  An illusion that worked from everywhere would be a mistake, so each one
  is asked a question with a number for an answer, from the magic spot and
  then from three steps away, and both answers have to be right. Nothing
  in there squints at a screenshot.
- **A fiddled save file cannot build anything.** The notebook is a file on
  a computer and files get fiddled with, so loading walks *our* list of
  what a trick is and asks the saved notes about each one. A made-up trick,
  a word where a number goes, a hole four hundred miles away: all thrown
  away, and the one good trick in among them still comes back.
