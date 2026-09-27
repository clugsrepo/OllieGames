# Letting friends join by code

Ollie asked for a two-player game where a friend types your code and drops
into your game. This folder is everything needed to make that work. **It is
switched off until a grown-up sets it up** — Chunk & Pip plays perfectly
well with two people on one keyboard without any of this.

This needs about five minutes. It's Doug's call, not Ollie's.

Unlike Verity's brain, **this one costs nothing at all**. There's no AI in
it. It just passes messages between two children.

---

## Why a server is needed at all

Ollie Games is a *static* site: GitHub Pages hands people files and that's
the end of it. Two children in two different houses cannot be introduced to
each other by a file — something has to sit in the middle and pass messages
between them.

```
Ollie's browser  ──▶  your Worker  ──▶  his friend's browser
                      (a room called BFGK)
```

That's the whole job. One room = one four-letter code.

---

## What it does, and what it deliberately doesn't

It is thick as two short planks, on purpose. It does not know what Chunk &
Pip is, what a floor is, or what any of the numbers mean. It knows: here's
a room, there are at most two people in it, and what one says goes to the
other. That means a bug in here can't break the game's rules, because it
hasn't been told any — and any later game can use the same rooms.

**There is no chat in it, and that is enforced by the server.** Every
message has to be a short list whose first item is one of five known words
and **whose every other item is a number**. Anything else is thrown away
without being passed on. That matters because a room can be joined by
anybody who guesses a four-letter code, so "there's no chat" needs to be a
fact about the server rather than a fact about the game — the game is a
file on a public web page and anybody can edit a copy of it.

There's a test for exactly this. It throws seven different attempts at
smuggling words through — a word where a number goes, an unknown message
type, raw text, nested objects — and checks that none of them arrive, and
that an ordinary position update still works straight afterwards.

Other things it does: only the games site may open rooms (`ALLOWED_ORIGINS`),
a room holds two people and turns the third away, and codes avoid I, O, S,
Z, 0, 1, 2 and 5 so nobody misreads one down the phone.

---

## What it costs

Nothing. Durable Objects have been on the Cloudflare **free plan** since
April 2025, and Cloudflare's own announcement names multiplayer games as
the use case.

The free plan gives **100,000 requests a day**, and — this is the part that
shapes the game — **every WebSocket message counts as one**. Sending
positions sixty times a second for two players would be 120 messages a
second and would spend the whole day's allowance in under twenty minutes.

So the game doesn't do that. It sends positions **ten** times a second and
smooths them out at the other end, and it **only sends anything when
something actually changed** — two children standing still working out a
puzzle send nothing whatsoever, which is a surprising amount of the time in
a game like this.

| | roughly |
|---|---|
| Two of them charging about | about **12 messages a second** |
| Two of them standing still thinking | **nothing at all** |
| A day's free allowance | a couple of hours of solid charging about, and a lot more in practice |

If the allowance ever does run out, the game says so in plain words and
offers the one-keyboard option instead of breaking.

---

## Setting it up

```bash
cd tools/game-rooms
npx wrangler login          # opens a browser, once
npx wrangler deploy
```

That prints a URL like `https://game-rooms.<your-subdomain>.workers.dev`.

Then paste it into the game — `games/chunkpip/index.html`, near the top of
the script, the line that says:

```js
const ROOM_SERVER = "";     // <- put the Worker's URL in here
```

Leave it empty and the game simply says joining isn't switched on yet, and
offers two-players-on-one-keyboard instead. Nothing breaks.

---

## Trying it without deploying anything

You don't need an account or a deployment to check it works:

```bash
cd tools/game-rooms
npx wrangler dev --local --port 8787 \
  --var ALLOWED_ORIGINS:"http://127.0.0.1:8099"
```

That runs the real Durable Object on your own machine. Serve the games
folder alongside it (`npx http-server . -p 8099 -c-1`) and point
`ROOM_SERVER` at `http://127.0.0.1:8787`.

---

## Turning it off again

```bash
npx wrangler delete
```

and blank out `ROOM_SERVER` in the game. Back to two on one keyboard, with
everything else exactly as it was.
