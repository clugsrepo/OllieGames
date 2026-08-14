/* =====================================================================
   VERITY'S BRAIN

   A tiny server that sits between the game and a real AI.

   Why it exists at all: the game is a web page, and everything in a web
   page can be read by anyone who opens it. The key that lets you talk to
   the AI must NOT be in there, or the first person who looks can spend
   somebody else's money with it. So the key lives here instead, on a
   computer nobody can read, and the game just asks this server nicely.

   This is a Cloudflare Worker. Setup instructions are in README.md next
   to this file - it takes about ten minutes and needs a grown-up.

   What it does, in order:
     1. only answers POST, and only from the games site;
     2. checks the question is a sensible short piece of text;
     3. counts how many questions have been asked today and stops if
        that's too many;
     4. asks Claude, with a system prompt that keeps her in character and
        gives her the real state of the maze;
     5. sends back ONE line of text and nothing else.

   The key never leaves this file's environment, and the game never sees
   it.
   ===================================================================== */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/* Small on purpose. Verity says one or two sentences - a bigger number
   here just means bigger bills for answers nobody reads. */
const MAX_ANSWER_TOKENS = 120;
const MAX_QUESTION_CHARS = 200;
const MAX_REPLY_CHARS = 400;

/* How many questions the whole world may ask in one day. This is a
   seatbelt, not the brakes: the REAL limit is the spend cap you set in
   the Anthropic console. See the README. */
const DEFAULT_DAILY_LIMIT = 2000;

function corsHeaders(origin, allowed) {
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

/* Only the games site may use this. Without that check, anyone could
   point their own page at the Worker and spend the budget. */
function isAllowed(origin, env) {
  const list = (env.ALLOWED_ORIGINS || "https://clugsrepo.github.io")
    .split(",").map(s => s.trim()).filter(Boolean);
  return !!origin && list.indexOf(origin) >= 0;
}

function reply(text, status, origin, allowed) {
  return new Response(JSON.stringify({ reply: text }), {
    status: status || 200,
    headers: { "content-type": "application/json",
               ...corsHeaders(origin, allowed) }
  });
}

/* Everything below here came off the internet, so nothing is trusted:
   the question is trimmed to a sensible length, and every piece of game
   state is turned into a number or a short plain string before it goes
   anywhere near the prompt. */
function tidy(raw, limit) {
  return String(raw == null ? "" : raw)
    .replace(/[^\P{C}\n]/gu, " ")          // no control characters
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function number(raw, low, high) {
  const n = Number(raw);
  if (!isFinite(n)) return low;
  return Math.max(low, Math.min(high, Math.round(n)));
}

function describe(seen) {
  if (!seen || typeof seen !== "object") return "You can't see the maze just now.";
  const bits = [
    "Room " + number(seen.room, 1, 99) + " of " + number(seen.rooms, 1, 99)
      + ' (called "' + tidy(seen.roomName, 24) + '")',
    "Hearts left: " + number(seen.hearts, 0, 99),
    "Seconds so far: " + number(seen.seconds, 0, 99999),
    seen.stepsToExit === null || seen.stepsToExit === undefined
      ? "A locked door is between you and the way out."
      : "Steps to the way out: " + number(seen.stepsToExit, 0, 9999),
    "Spikes right next to the player: " + (seen.spikes ? "yes" : "no"),
    "Locked doors left in this room: " + number(seen.doorsLeft, 0, 99),
    "Keys held: " + (tidy(seen.keys, 40) || "none")
  ];
  return bits.join(". ") + ".";
}

function systemPrompt(seen, playerName) {
  return [
    "You are Verity: a small, cheerful ball of light with a smiling face,",
    "floating beside a child who is playing a maze game. You were invented",
    "by a nine-year-old called Ollie. You are kind, brave and helpful, and",
    "you like helping more than anything.",
    "",
    "You are talking to a child, probably between 6 and 12.",
    "",
    "Rules you always follow:",
    "- Answer in ONE or TWO short sentences. Your words appear in a small",
    "  speech bubble and are read aloud, so keep them short and easy to say.",
    "- Be warm and plain. No lists, no headings, no markdown, no emoji.",
    "- Only use the maze facts below. If you don't know something, say so",
    "  cheerfully rather than making it up.",
    "- Never ask for or repeat anyone's real name, address, school, age or",
    "  anything else private. The player's name in the game is all you know.",
    "- If a question is unkind, frightening or not for children, say gently",
    "  that you'd rather talk about the maze, and offer to show the way.",
    "- If asked, say honestly that you are a computer program, not a person.",
    "",
    "The player is called " + tidy(playerName, 12) + ".",
    "",
    "What you can see in the maze right now:",
    describe(seen)
  ].join("\n");
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const allowed = isAllowed(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin, allowed) });
    }
    if (request.method !== "POST") {
      return reply("I can only answer questions sent properly.", 405, origin, allowed);
    }
    if (!allowed) {
      return reply("That's not a page I'm allowed to help.", 403, origin, allowed);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return reply("My brain isn't plugged in yet.", 500, origin, allowed);
    }

    let body = null;
    try { body = await request.json(); } catch (e) { body = null; }
    const question = tidy(body && body.question, MAX_QUESTION_CHARS);
    if (!question) {
      return reply("Ask me anything you like!", 400, origin, allowed);
    }

    // ---- the seatbelt: a daily cap, if a counter is available ----
    const limit = number(env.DAILY_LIMIT || DEFAULT_DAILY_LIMIT, 1, 1000000);
    if (env.COUNTER) {
      const today = new Date().toISOString().slice(0, 10);
      const key = "asked-" + today;
      const soFar = number(await env.COUNTER.get(key), 0, 1000000);
      if (soFar >= limit) {
        return reply("I've done a LOT of thinking today - ask me tomorrow!",
                     200, origin, allowed);
      }
      // 2 days so yesterday's counter tidies itself away
      ctx.waitUntil(env.COUNTER.put(key, String(soFar + 1),
                                    { expirationTtl: 60 * 60 * 48 }));
    }

    let answer = "";
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: env.MODEL || "claude-haiku-4-5",
          max_tokens: MAX_ANSWER_TOKENS,
          system: systemPrompt(body && body.seen, body && body.player),
          messages: [{ role: "user", content: question }]
        })
      });

      if (!res.ok) {
        return reply("My thinking got stuck. Ask me again in a moment!",
                     200, origin, allowed);
      }
      const data = await res.json();

      // Claude can decline a question. That is a normal answer, not a
      // crash - check for it before reading what she said.
      if (data.stop_reason === "refusal") {
        return reply("I'd rather talk about the maze. Shall I show you the way?",
                     200, origin, allowed);
      }
      answer = (data.content || [])
        .filter(b => b && b.type === "text")
        .map(b => b.text)
        .join(" ");
    } catch (e) {
      return reply("I couldn't reach my thinking just then. Try again!",
                   200, origin, allowed);
    }

    answer = tidy(answer, MAX_REPLY_CHARS);
    if (!answer) answer = "I'm not sure about that one. Ask me about the maze!";
    return reply(answer, 200, origin, allowed);
  }
};
