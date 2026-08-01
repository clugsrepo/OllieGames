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
| `index.html`  | The home page with a card for every game             |
| `games/`      | One folder per game, each with its own `index.html`  |
| `.nojekyll`   | Tells GitHub Pages to serve the files as they are    |

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
