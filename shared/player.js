/* =====================================================================
   WHO IS PLAYING

   One place that remembers your name, shared by every game. You type
   it once on the home page and all the games know it.

   Five names in this house get admin powers in any game: Ollie, Doug,
   Clare, Ella and Chloe. Anybody else can still unlock them with the
   secret code.

   Same warning as ever: this is a SECRET, not a lock. Everything a web
   page does lives inside the page, so a friend who really goes looking
   can find this list and type one of the names in. It's for fun, and
   admin powers only ever change YOUR OWN game.
   ===================================================================== */
(function () {
  const KEY = "ollie-games-player";

  const ADMIN_NAMES = ["ollie", "doug", "clare", "ella", "chloe"];

  /* Names get typed by people and read back from storage, so tidy them
     up on the way in AND on the way out: letters, numbers and a few
     safe marks only, no runaway length. */
  function cleanName(raw) {
    return String(raw == null ? "" : raw)
      .replace(/[^\p{L}\p{N} _'\-!?.]/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12);
  }

  function name() {
    try { return cleanName(localStorage.getItem(KEY)); } catch (e) { return ""; }
  }

  function setName(raw) {
    const tidy = cleanName(raw);
    try {
      if (tidy) localStorage.setItem(KEY, tidy);
      else localStorage.removeItem(KEY);
    } catch (e) { /* private browsing - the name just won't stick */ }
    return tidy;
  }

  function isAdminName(raw) {
    return ADMIN_NAMES.indexOf(cleanName(raw).toLowerCase()) >= 0;
  }

  // is whoever is signed in one of the five?
  function isAdmin() { return isAdminName(name()); }

  window.OlliePlayer = {
    KEY: KEY,
    ADMIN_NAMES: ADMIN_NAMES,
    cleanName: cleanName,
    name: name,
    setName: setName,
    isAdminName: isAdminName,
    isAdmin: isAdmin
  };
})();
