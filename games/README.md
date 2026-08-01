# Games

Each game lives in its own folder in here, with an `index.html` inside it.

```
games/
  game1/
    index.html
  spaceblaster/
    index.html
```

When a game is ready, open the main `index.html` at the top of the project
and add it to the `games` list near the bottom:

```js
{
  name: "Space Blaster",
  emoji: "🚀",
  blurb: "Shoot the asteroids before they get you!",
  link: "games/spaceblaster/index.html",
  ready: true
}
```

Set `ready: true` to make the card clickable. Leave it `false` to show a
"Coming soon" card.
