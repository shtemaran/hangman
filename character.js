// character.js — phone bridge. Wires the shared character controller
// (rig/character.js) to the game's state stream. The character observes; it
// never calls back into the game.
(function () {
  const el = document.getElementById('person');
  if (!el || typeof createCharacter !== 'function' || !window.subscribeGameState) return;
  const character = createCharacter(el);
  window.subscribeGameState(character.onState);
})();
