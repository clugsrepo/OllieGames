# Giving Verity a real brain

Ollie asked for Verity to be a real AI. This folder is everything needed to do
it. **It is switched off until a grown-up sets it up** — the game works
perfectly without it, and nothing here costs anything until someone deliberately
turns it on.

This needs about ten minutes and a card. It's Doug's call, not Ollie's.

---

## Why a server is needed at all

Ollie Games is a *static* site: GitHub Pages just hands people files. Everything
in those files can be read by anyone who opens the page — including, if you put
it there, the secret key that lets you talk to the AI. Someone could take it and
spend your money with it.

So the key doesn't go in the game. It goes on a tiny server (a Cloudflare
Worker, free) that sits in the middle:

```
the game  ──asks──▶  your Worker  ──uses the key──▶  Claude
   (public)            (private)                     (answers)
```

The game never sees the key. The Worker only answers requests coming from the
games site, only sends short answers, and counts how many questions have been
asked today.

---

## What it costs

Nothing to build. What costs money is the AI thinking, charged per word in and
out.

The Worker is set up to use **Claude Haiku 4.5** ($1 per million words in, $5
per million out) with short questions and short answers.

| | roughly |
|---|---|
| One question | about **a tenth of a penny** |
| A long afternoon of playing (200 questions) | about **20p** |
| The daily cap in the Worker (2,000 questions) | about **£2** |

To use a cleverer (and dearer) model instead, set the `MODEL` variable to
`claude-opus-5` — about five times the price for input and output.

**Set a spending limit anyway.** The daily counter in the Worker is a seatbelt;
the limit in the Anthropic console is the brakes. Step 5 below.

---

## Setup

**1. Get a Claude API key.**
Go to <https://console.anthropic.com>, make an account, add a card, and create
an API key. Copy it — it looks like `sk-ant-...`. Treat it like a bank card
number: don't paste it into chat, email, or any file that goes into git.

**2. Get a free Cloudflare account** at <https://dash.cloudflare.com>, then
install the tool that deploys Workers:

```sh
npm install -g wrangler
wrangler login
```

**3. Deploy the Worker.** From this folder:

```sh
wrangler deploy
```

It prints an address like `https://verity-brain.YOUR-NAME.workers.dev`. Keep it.

**4. Give it the key** (this stores it encrypted on Cloudflare, not in the file):

```sh
wrangler secret put ANTHROPIC_API_KEY
```

Paste the key when it asks.

**5. Set a spending limit.** In the Anthropic console, under Billing, set a
monthly limit — £5 is plenty. **Do not skip this.** The game is a public link;
if it ever gets shared widely, or someone writes a program to hammer it, this
limit is what stops the bill.

**6. Switch it on in the game.** Open `games/verity/index.html`, find this line
near the top of the script:

```js
const BRAIN_URL = "";
```

and put the Worker address between the quotes:

```js
const BRAIN_URL = "https://verity-brain.YOUR-NAME.workers.dev";
```

Commit and push. That's it — Verity starts answering for real.

To turn her back into the offline version, empty that string again.

### Trying it without editing the file

An admin (a family name, or the secret code) can point Verity at a Worker from
the admin panel, just on their own device:

```
;brain https://verity-brain.YOUR-NAME.workers.dev
;brain off
```

Good for testing before committing it for everyone.

---

## Optional: the daily counter

The daily cap only works if the Worker has somewhere to count. Make one:

```sh
wrangler kv namespace create COUNTER
```

Put the `id` it prints into `wrangler.toml` where it says `id = ""`, then
`wrangler deploy` again. Without this the Worker still works — it just doesn't
count, and the console spending limit is your only cap.

---

## Things worth knowing before saying yes

- **She can answer anything.** That's the point, and it's also the risk. Any
  child who opens the link can type anything and get an answer. The Worker asks
  Claude to stay in character, keep it short, keep it child-appropriate, refuse
  anything unkind, and never ask for or repeat personal details — but it is a
  request, not a guarantee.
- **Questions leave the device.** The offline Verity answers entirely inside the
  browser. With a brain, each question and the state of the maze are sent to
  Anthropic. No names beyond the in-game one are sent.
- **She gets slower.** About a second per answer instead of instant.
- **She stops working offline.** The word-matching Verity is kept as a fallback,
  so on a train with no signal she still helps — she just isn't clever.
- **Route-finding never goes to the AI.** "Where do I go?" is still worked out
  by the game itself: instant, free, and always right. Only conversation goes to
  Claude.
