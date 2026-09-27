/* =====================================================================
   THE ROOM SERVER

   Ollie Games is a static site: GitHub Pages hands people files and
   that's the end of it. Two children in two different houses cannot be
   introduced to each other by a file. Something has to sit in the middle
   and pass messages between them, and this is it.

   It is deliberately thick as two short planks. It does not know what
   Chunk & Pip is, what a floor is, or what any of the numbers mean. It
   knows: here is a room with a four-letter name, there are at most two
   people in it, and anything one of them says gets handed to the other.
   That makes it reusable by any later game, and - much more to the point
   - it makes it impossible for a bug in here to break the game's rules,
   because it hasn't been told any.

   One room = one Durable Object, named after the code. That is the whole
   reason for using Durable Objects: "the room called BFGK" is a thing
   that exists in exactly one place in the world, so both players
   demonstrably end up in the SAME room and not two rooms with the same
   name.
   ===================================================================== */

import { DurableObject } from "cloudflare:workers";

/* The only things anybody is allowed to say.
     p - where I am            [x, y, z, yaw]
     w - what the world is up to (doors, crates, which floor) - host only
     e - an emote, by number
     f - the floor changed - host only
     r - restart

   Note what is NOT in that list: anything at all with words in it. See
   `tidy` below, which is where that promise is actually kept. */
const KINDS = new Set(["p", "w", "e", "f", "r"]);

const MAX_IN_A_ROOM = 2;
const MAX_MESSAGE = 400;          // bytes; a position update is about 40

/* ---------------------------------------------------------------------
   THE PROMISE THAT NO WORDS EVER TRAVEL BETWEEN TWO PLAYERS

   This is a children's game whose rooms can be joined by anybody who
   guesses a four-letter code. There is no chat in it, and "there is no
   chat in it" needs to be a fact about the server rather than a fact
   about the game, because the game is a file on a public web page that
   anybody can edit a copy of.

   So: every message is a short list. The first item has to be one of the
   five words above. EVERY OTHER ITEM MUST BE A NUMBER. Not "should be" -
   the message is thrown away otherwise. There is no arrangement of bytes
   a modified game could send that would get a word to the other child.
   --------------------------------------------------------------------- */
function tidy(raw) {
  if (typeof raw !== "string" || raw.length > MAX_MESSAGE) return null;
  let m;
  try { m = JSON.parse(raw); } catch (e) { return null; }
  if (!Array.isArray(m) || m.length < 1 || m.length > 24) return null;
  if (typeof m[0] !== "string" || !KINDS.has(m[0])) return null;
  for (let i = 1; i < m.length; i++) {
    if (typeof m[i] !== "number" || !isFinite(m[i])) return null;
  }
  return JSON.stringify(m);
}

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    /* Ping and pong get answered without ever waking this object up.
       Two children staring at a puzzle send no position updates at all,
       and we want that to genuinely cost nothing. */
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("This is a door for games, not for browsers.", { status: 426 });
    }

    const already = this.ctx.getWebSockets();
    if (already.length >= MAX_IN_A_ROOM) {
      return new Response("That room already has two people in it.", { status: 409 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    /* acceptWebSocket, NOT server.accept(). This is the hibernating kind:
       the two of them stay connected while this object is asleep and
       costing nothing, and it wakes up when somebody actually moves. */
    this.ctx.acceptWebSocket(server);

    const host = already.length === 0;
    server.serializeAttachment({ host });
    server.send(JSON.stringify(["hello", host ? 1 : 0]));

    // tell whoever was already here that their friend has arrived
    for (const other of already) other.send(JSON.stringify(["mate", 1]));
    if (already.length) server.send(JSON.stringify(["mate", 1]));

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, raw) {
    const clean = tidy(raw);
    if (clean === null) return;          // not a shape we know: dropped, silently
    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue;
      try { other.send(clean); } catch (e) { /* they've gone; close will tidy up */ }
    }
  }

  webSocketClose(ws) {
    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue;
      try { other.send(JSON.stringify(["mate", 0])); } catch (e) {}
    }
  }

  webSocketError(ws) { this.webSocketClose(ws); }
}

/* ---------------------------------------------------------------------
   THE FRONT DOOR
   --------------------------------------------------------------------- */

/* Codes are four letters with no I, O, S, Z, 0, 1, 5 or 2 in them, so
   nobody ever reads one down the phone to a friend and gets it wrong. */
const CODE_LETTERS = /^[ABCDEFGHJKLMNPQRTUVWXY]{4}$/;

function allowed(request, env) {
  const origin = request.headers.get("Origin") || "";
  const list = (env.ALLOWED_ORIGINS || "https://clugsrepo.github.io")
    .split(",").map(s => s.trim()).filter(Boolean);
  return list.indexOf(origin) >= 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("awake", { headers: { "content-type": "text/plain" } });
    }

    const match = url.pathname.match(/^\/room\/([A-Za-z]{4})$/);
    if (!match) return new Response("No such door.", { status: 404 });

    if (!allowed(request, env)) {
      return new Response("Not a site that's allowed to use these rooms.", { status: 403 });
    }

    const code = match[1].toUpperCase();
    if (!CODE_LETTERS.test(code)) {
      return new Response("That isn't a room code.", { status: 400 });
    }

    // the code IS the room: the same four letters always reach the same
    // object, wherever in the world the two of them happen to be
    const stub = env.ROOMS.getByName(code);
    return stub.fetch(request);
  }
};
