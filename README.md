# Ollie's Games

A collection of games made by Ollie, hosted on GitHub Pages.

## Play

The games are live at:

**https://clugsrepo.github.io/OllieGames/**

Note the capital letters — GitHub Pages URLs are case-sensitive, and the
lowercase version returns a 404.

## How it's put together

| File / folder | What it does                                        |
| ------------- | --------------------------------------------------- |
| `index.html`  | The home page: sign in, then a card for every game   |
| `games/`      | One folder per game, each with its own `index.html`  |
| `shared/`     | Bits every game uses: who's playing, the admin panel |
| `.nojekyll`   | Tells GitHub Pages to serve the files as they are    |

## Signing in

The home page asks for your name before it shows the games, and every
game reads it (`shared/player.js`). Five names in this house — Ollie,
Doug, Clare, Ella and Chloe — get admin powers in any game: press
<kbd>P</kbd> for a panel of commands, or <kbd>;</kbd> to type one.
Anybody else can unlock them in Star Arena with a secret code.

This is a secret, not a lock. Everything a web page does lives inside
the page, so somebody who really goes looking can find the list of
names. Admin powers only ever change your own game — never anybody
else's.

## Adding a new game

1. Make a new folder inside `games/`, e.g. `games/spaceblaster/`
2. Put an `index.html` inside it
3. Open `index.html` at the top level and add the game to the `games` list:

```js
{
  name: "Space Blaster",
  emoji: "🚀",
  blurb: "Shoot the asteroids before they get you!",
  link: "games/spaceblaster/index.html",
  ready: true
}
```

## Turning on GitHub Pages

In the repo on GitHub: **Settings → Pages → Source: Deploy from a branch**,
pick the `main` branch and the `/ (root)` folder, then **Save**.
