// ---------------------------------------------------------------------------
// Claude's moves.
//
// Deliberately NOT an API call. A memory game is won by remembering cards, and
// that is a memory problem, not a language problem — so the moves are decided
// here, instantly, offline, every time. What Claude actually says out loud is
// the part that needs a language model, and that lives in server/ai.js.
//
// The difficulty knob is honest: it is how much of what it saw it forgets.
// ---------------------------------------------------------------------------

const FORGET_RATE = {
  easy: 0.55, // forgets more than half of what it sees — a young child's memory
  normal: 0.2,
  hard: 0, // perfect recall
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function createOpponent({ skill = "normal" } = {}) {
  /** cardId -> pairId, but only for the cards it actually managed to remember */
  const memory = new Map();
  const forgetRate = FORGET_RATE[skill] ?? FORGET_RATE.normal;

  /** Called for every card either player turns over. */
  function observe(cardId, pairId) {
    if (Math.random() < forgetRate) return;
    memory.set(cardId, pairId);
  }

  function forget(cardIds) {
    for (const id of cardIds) memory.delete(id);
  }

  /** Two remembered cards that make a pair and are both still on the board. */
  function knownPair(available) {
    const byPair = new Map();
    for (const id of available) {
      const pairId = memory.get(id);
      if (pairId === undefined) continue;
      if (byPair.has(pairId)) return [byPair.get(pairId), id];
      byPair.set(pairId, id);
    }
    return null;
  }

  function chooseFirst(available) {
    const known = knownPair(available);
    if (known) return known[0];

    // Nothing known — turn over something new, to learn as much as possible.
    const unseen = available.filter((id) => !memory.has(id));
    return pick(unseen.length ? unseen : available);
  }

  function chooseSecond(firstId, available) {
    const wanted = memory.get(firstId);
    if (wanted !== undefined) {
      const partner = available.find((id) => id !== firstId && memory.get(id) === wanted);
      if (partner) return partner;
    }

    const rest = available.filter((id) => id !== firstId);
    const unseen = rest.filter((id) => !memory.has(id));
    return pick(unseen.length ? unseen : rest);
  }

  return { observe, forget, chooseFirst, chooseSecond, get size() { return memory.size; } };
}
