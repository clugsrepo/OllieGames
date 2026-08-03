/* =====================================================================
   THE ADMIN PANEL, THE SAME IN EVERY GAME

   Star Arena grew its own admin panel first. This is that same idea
   packed up so the other games can have one too without copying it out
   three times: a 🛠 button, a searchable list of commands, a command
   bar you type into (press ;), and a little note of what just happened.

   A game switches it on like this:

     OllieAdmin.start({
       commands: [
         { name: "coins", args: "<number>", help: "Set your coins",
           run: words => "Coins set to " + words[0] }
       ]
     });

   Every command's `run` gets the words you typed after it and returns
   the line to show. Return { bad: "why not" } to show it in red.
   ===================================================================== */
(function () {
  const CSS = `
  #oa-btn {
    position: fixed; z-index: 60;
    right: max(12px, env(safe-area-inset-right));
    bottom: max(12px, env(safe-area-inset-bottom));
    width: 48px; height: 48px;
    font-size: 1.2rem;
    border-radius: 14px; cursor: pointer;
    color: #1a1a2e; background: #ffd93d;
    border: 2px solid #fff3b0;
    box-shadow: 0 6px 18px rgba(0,0,0,0.45);
  }
  #oa-btn:active { transform: scale(0.93); }

  #oa-panel[hidden], #oa-bar[hidden], #oa-btn[hidden] { display: none !important; }

  #oa-panel {
    position: fixed; z-index: 61;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    display: flex; flex-direction: column;
    width: min(430px, 94vw);
    max-height: min(540px, 84vh);
    font-family: 'Trebuchet MS', Verdana, sans-serif;
    background: rgba(16,13,38,0.97);
    border: 2px solid #ffd93d;
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 18px 46px rgba(0,0,0,0.65);
  }
  #oa-top {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px;
    background: linear-gradient(90deg, rgba(255,217,61,0.22), rgba(255,217,61,0.05));
    border-bottom: 1px solid rgba(255,217,61,0.35);
  }
  #oa-title {
    font-size: 0.9rem; font-weight: bold; color: #ffd93d;
    letter-spacing: 1px; white-space: nowrap;
  }
  #oa-search {
    flex: 1; font-family: inherit; font-size: 0.85rem;
    padding: 7px 10px; border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.25);
    background: rgba(0,0,0,0.4); color: #fff;
  }
  #oa-close {
    font-family: inherit; font-size: 0.9rem; font-weight: bold;
    width: 30px; height: 30px; border-radius: 8px; cursor: pointer;
    color: #1a1a2e; background: #ffd93d; border: none;
  }
  #oa-list { overflow-y: auto; padding: 8px; flex: 1; }
  .oa-cmd {
    display: flex; align-items: center; gap: 10px;
    width: 100%; text-align: left;
    font-family: inherit; font-size: 0.85rem;
    margin-bottom: 5px; padding: 8px 10px;
    border-radius: 9px; cursor: pointer; color: #fff;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.15);
  }
  .oa-cmd:hover { background: rgba(255,255,255,0.14); }
  .oa-cmd.on { background: rgba(255,217,61,0.24); border-color: #ffd93d; }
  .oa-cmd .oa-name { font-weight: bold; color: #ffd93d; white-space: nowrap; }
  .oa-cmd .oa-args { color: #9fb4ff; font-size: 0.75rem; white-space: nowrap; }
  .oa-cmd .oa-help {
    flex: 1; color: #d8d4ff; font-size: 0.75rem;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .oa-cmd .oa-state { font-size: 0.7rem; font-weight: bold; color: #ffd93d; }
  #oa-foot {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 12px;
    border-top: 1px solid rgba(255,255,255,0.15);
    font-size: 0.7rem; color: #c9c2ff; line-height: 1.35;
  }
  #oa-barbtn {
    font-family: inherit; font-size: 0.75rem; font-weight: bold;
    padding: 7px 10px; border-radius: 8px; cursor: pointer; white-space: nowrap;
    color: #1a1a2e; background: #ffd93d; border: none;
  }

  #oa-bar {
    position: fixed; z-index: 62;
    left: 50%; bottom: max(80px, calc(env(safe-area-inset-bottom) + 74px));
    transform: translateX(-50%);
    width: min(520px, 94vw);
    font-family: 'Trebuchet MS', Verdana, sans-serif;
  }
  #oa-line {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 12px;
    background: rgba(16,13,38,0.97);
    border: 2px solid #ffd93d; border-radius: 12px;
  }
  #oa-prefix { color: #ffd93d; font-weight: bold; }
  #oa-input {
    flex: 1; font-family: inherit; font-size: 0.95rem;
    background: none; border: none; outline: none; color: #fff;
  }
  #oa-sug {
    margin-bottom: 6px;
    background: rgba(16,13,38,0.97);
    border: 1px solid rgba(255,217,61,0.5);
    border-radius: 12px; overflow: hidden;
    max-height: 190px; overflow-y: auto;
  }
  #oa-sug:empty { display: none; }
  .oa-sug {
    display: flex; gap: 8px; align-items: baseline;
    padding: 7px 12px; font-size: 0.82rem; cursor: pointer;
  }
  .oa-sug .oa-name { color: #ffd93d; font-weight: bold; }
  .oa-sug .oa-help { color: #c9c2ff; font-size: 0.74rem; }
  .oa-sug.pick { background: rgba(255,217,61,0.25); }

  /* Bottom right, just above the 🛠 button - the top corners already
     have toolbars and counters in them in these games. */
  #oa-log {
    position: fixed; z-index: 59;
    right: max(12px, env(safe-area-inset-right));
    bottom: max(72px, calc(env(safe-area-inset-bottom) + 68px));
    display: flex; flex-direction: column; align-items: flex-end; gap: 4px;
    pointer-events: none;
    max-width: min(60vw, 300px); text-align: right;
    font-family: 'Trebuchet MS', Verdana, sans-serif;
  }
  .oa-logline {
    font-size: 0.75rem; padding: 5px 10px; border-radius: 8px;
    background: rgba(16,13,38,0.88);
    border-left: 3px solid #ffd93d; color: #fff;
  }
  .oa-logline.bad { border-left-color: #ff6b6b; color: #ffd0d0; }
  `;

  let commands = [];
  let suggestions = [];
  let suggestAt = 0;
  let openId = 0;
  let started = false;
  let el = {};

  function find(word) {
    const w = String(word || "").toLowerCase();
    return commands.find(c => c.name === w || (c.alias || []).indexOf(w) >= 0);
  }

  function log(text, bad) {
    const line = document.createElement("div");
    line.className = "oa-logline" + (bad ? " bad" : "");
    line.textContent = text;                    // never innerHTML
    el.log.appendChild(line);
    while (el.log.children.length > 5) el.log.removeChild(el.log.firstChild);
    setTimeout(() => { if (line.parentNode) line.parentNode.removeChild(line); }, 4200);
  }

  function run(line) {
    const raw = String(line == null ? "" : line).trim().replace(/^[;:/]+/, "");
    if (!raw) return false;

    const words = raw.split(/\s+/);
    const first = words.shift();
    const cmd = find(first);
    if (!cmd) { log('No command called "' + first + '"', true); return false; }

    const result = cmd.run(words);
    if (result && result.bad) { log(result.bad, true); return false; }
    log(typeof result === "string" ? result : cmd.name, false);
    refresh();
    return true;
  }

  function refresh() {
    commands.forEach(c => {
      const row = document.getElementById("oa-cmd-" + c.name);
      if (!row || !c.state) return;
      const state = c.state();
      row.querySelector(".oa-state").textContent = state;
      row.classList.toggle("on", state === "ON");
    });
  }

  function buildList() {
    commands.forEach(c => {
      const row = document.createElement("button");
      row.className = "oa-cmd";
      row.type = "button";
      row.id = "oa-cmd-" + c.name;
      row.dataset.name = c.name;
      row.dataset.words = (c.name + " " + (c.alias || []).join(" ") + " " + c.help)
                            .toLowerCase();

      const parts = [["oa-name", ";" + c.name], ["oa-args", c.args || ""],
                     ["oa-help", c.help], ["oa-state", ""]];
      parts.forEach(([cls, text]) => {
        const span = document.createElement("span");
        span.className = cls;
        span.textContent = text;
        row.appendChild(span);
      });

      row.addEventListener("click", () => {
        // a command that NEEDS something typed opens the bar ready to go
        if ((c.args || "").indexOf("<") === 0) { openBar(c.name + " "); return; }
        run(c.name);
      });
      el.list.appendChild(row);
    });
    refresh();
  }

  function filter(text) {
    const want = String(text || "").toLowerCase().trim();
    el.list.querySelectorAll(".oa-cmd").forEach(row => {
      row.hidden = want !== "" && row.dataset.words.indexOf(want) < 0;
    });
  }

  function togglePanel(show) {
    const open = show === undefined ? el.panel.hidden : !!show;
    el.panel.hidden = !open;
    if (open) { el.search.value = ""; filter(""); refresh(); }
  }

  function openBar(startWith) {
    openId++;
    el.bar.hidden = false;
    el.input.value = startWith || "";
    el.input.focus();
    showSuggestions();
  }

  function closeBar() {
    el.bar.hidden = true;
    el.input.value = "";
    el.sug.textContent = "";
    suggestions = [];
    if (document.activeElement === el.input) el.input.blur();
  }

  function showSuggestions() {
    const typed = el.input.value.trim().toLowerCase();
    const word = typed.split(/\s+/)[0] || "";

    suggestions = (typed.indexOf(" ") >= 0 && find(word))
      ? []
      : commands.filter(c => c.name.indexOf(word) === 0 ||
          (c.alias || []).some(a => a.indexOf(word) === 0)).slice(0, 6);

    suggestAt = Math.min(suggestAt, Math.max(0, suggestions.length - 1));
    el.sug.textContent = "";

    suggestions.forEach((c, i) => {
      const row = document.createElement("div");
      row.className = "oa-sug" + (i === suggestAt ? " pick" : "");

      const name = document.createElement("span");
      name.className = "oa-name";
      name.textContent = ";" + c.name + (c.args ? " " + c.args : "");

      const help = document.createElement("span");
      help.className = "oa-help";
      help.textContent = c.help;

      row.appendChild(name); row.appendChild(help);
      row.addEventListener("mousedown", e => {        // before the blur
        e.preventDefault();
        el.input.value = c.name + (c.args ? " " : "");
        el.input.focus();
        showSuggestions();
      });
      el.sug.appendChild(row);
    });
  }

  function typingSomewhere() {
    const node = document.activeElement;
    return !!node && (node.tagName === "INPUT" || node.tagName === "TEXTAREA");
  }

  function make(tag, id, parent) {
    const node = document.createElement(tag);
    if (id) node.id = id;
    (parent || document.body).appendChild(node);
    return node;
  }

  function start(options) {
    if (started) return;
    started = true;
    commands = (options && options.commands) || [];

    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    el.button = make("button", "oa-btn");
    el.button.type = "button";
    el.button.textContent = "🛠";
    el.button.title = "Admin panel";

    el.panel = make("div", "oa-panel");
    el.panel.hidden = true;

    const top = make("div", "oa-top", el.panel);
    el.title = make("span", "oa-title", top);
    el.title.textContent = "🛠 ADMIN";
    el.search = make("input", "oa-search", top);
    el.search.placeholder = "Search commands…";
    el.search.autocomplete = "off";
    el.close = make("button", "oa-close", top);
    el.close.type = "button";
    el.close.textContent = "✕";

    el.list = make("div", "oa-list", el.panel);

    const foot = make("div", "oa-foot", el.panel);
    foot.id = "oa-foot";
    el.barBtn = make("button", "oa-barbtn", foot);
    el.barBtn.type = "button";
    el.barBtn.textContent = "⌨ Command bar";
    const tip = make("span", null, foot);
    tip.textContent = "Tap a command to run it — or press ; to type one";

    el.bar = make("div", "oa-bar");
    el.bar.hidden = true;
    el.sug = make("div", "oa-sug", el.bar);
    const line = make("div", "oa-line", el.bar);
    const prefix = make("span", "oa-prefix", line);
    prefix.textContent = ";";
    el.input = make("input", "oa-input", line);
    el.input.autocomplete = "off";
    el.input.spellcheck = false;
    el.input.placeholder = "type a command";

    el.log = make("div", "oa-log");

    buildList();

    el.button.addEventListener("click", () => togglePanel());
    el.close.addEventListener("click", () => togglePanel(false));
    el.barBtn.addEventListener("click", () => { togglePanel(false); openBar(""); });
    el.search.addEventListener("input", () => filter(el.search.value));

    el.input.addEventListener("input", () => { suggestAt = 0; showSuggestions(); });

    el.input.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.preventDefault(); closeBar(); return; }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!suggestions.length) return;
        suggestAt = (suggestAt + (e.key === "ArrowDown" ? 1 : suggestions.length - 1))
                    % suggestions.length;
        showSuggestions();
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        if (suggestions.length) {
          el.input.value = suggestions[suggestAt].name
                         + (suggestions[suggestAt].args ? " " : "");
          showSuggestions();
        }
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        let text = el.input.value.trim();
        if (!text) { closeBar(); return; }

        // half a word plus the highlighted suggestion is what you meant
        const bits = text.split(/\s+/);
        if (!find(bits[0].replace(/^[;:/]+/, "")) && suggestions.length) {
          bits[0] = suggestions[suggestAt].name;
          text = bits.join(" ");
        }
        run(text);
        closeBar();
      }
    });

    // a delayed close must not slam shut a bar reopened in the meantime
    el.input.addEventListener("blur", () => {
      const openedAs = openId;
      setTimeout(() => {
        if (openedAs === openId && document.activeElement !== el.input) closeBar();
      }, 120);
    });

    addEventListener("keydown", e => {
      if (typingSomewhere()) return;
      if (e.key === ";" || e.key === "/" || e.key === ":") {
        e.preventDefault(); openBar(""); return;
      }
      if (e.code === "KeyP") { e.preventDefault(); togglePanel(); }
    });
  }

  window.OllieAdmin = {
    start: start,
    run: run,
    log: log,
    refresh: refresh,
    openBar: openBar,
    closeBar: closeBar,
    togglePanel: togglePanel,
    isOpen: () => started && !el.panel.hidden,
    started: () => started
  };
})();
