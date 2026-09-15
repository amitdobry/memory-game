// ---------------------------------------------------------------------------
// שומר המדורה — the Firekeeper.
//
// The children do not talk to "an AI". They talk to a small campfire who lives at
// the top of the panel, reacts to what they just did, and introduces the workshop.
// That is not decoration: a 10-year-old will happily argue with a character and
// will not argue with a text box, and arguing with it — "no, I meant BIGGER" — is
// the whole skill the workshop is trying to teach.
//
// Which face he wears comes back from the model on every answer (see `face` in
// LIVE's /api/workshop/*). This module only renders it, and never trusts it.
// ---------------------------------------------------------------------------
import { FIREKEEPER_FACES, DEFAULT_FACE } from "./schema.js";

const FACES = Object.keys(FIREKEEPER_FACES);

/** Never point an <img> at a name the model invented. */
export function safeFace(name) {
  return FACES.includes(name) ? name : DEFAULT_FACE;
}

/**
 * Mount the Firekeeper into `root`.
 * Returns a handle for changing his face and what he is saying.
 */
export function createFirekeeper(root, { name = "שומר המדורה" } = {}) {
  root.innerHTML = "";
  root.className = "keeper";

  const portrait = document.createElement("div");
  portrait.className = "keeper__portrait";

  const img = document.createElement("img");
  img.src = `firekeeper/${DEFAULT_FACE}.webp`;
  img.alt = name;
  portrait.append(img);

  const bubble = document.createElement("div");
  bubble.className = "keeper__bubble";

  const who = document.createElement("div");
  who.className = "keeper__name";
  who.textContent = name;

  const line = document.createElement("div");
  line.className = "keeper__line";

  bubble.append(who, line);
  root.append(portrait, bubble);

  let current = DEFAULT_FACE;

  return {
    /** Change expression. Unknown names fall back rather than breaking the image. */
    face(next) {
      const wanted = safeFace(next);
      if (wanted === current) return;
      current = wanted;
      img.src = `firekeeper/${wanted}.webp`;
      // Restart the flicker so a change is felt, not just seen.
      portrait.classList.remove("is-reacting");
      void portrait.offsetWidth;
      portrait.classList.add("is-reacting");
    },

    /** What he is saying right now. Empty hides the bubble. */
    say(text) {
      line.textContent = text ?? "";
      bubble.hidden = !text;
    },

    element: root,
  };
}

// ---------------------------------------------------------------------------
// Onboarding
//
// Scripted, not generated, and that is deliberate. It runs before a child has a
// workshop code, it has to work when the venue's wifi does not, it has to be
// identical for every child so an instructor can talk over it, and it must never
// make a 10-year-old wait on a spinner to find out what the app is. The model's
// judgement is worth paying for when a child asks for something; it is worth
// nothing for a sentence we already know we want to say.
// ---------------------------------------------------------------------------

export const ONBOARDING = [
  {
    face: "warm",
    text: "היי! אני שומר המדורה. אני הולך לעזור לך היום לבנות משחק.",
  },
  {
    face: "ambient",
    text: "רואה את המשחק מצד שמאל? הוא עובד — אבל הוא לא גמור. הוא אפור, קטן ומשעמם קצת.",
  },
  {
    face: "winking",
    text: "וכאן זה נהיה כיף: אתה לא צריך לדעת לתכנת. אתה פשוט כותב לי מה לשנות, בעברית רגילה, ואני משנה.",
  },
  {
    face: "ambient",
    text: 'נסה דברים כמו "תעשה לוח 6 על 6", "אני רוצה 30 שניות", או "תחליף לנושא של חלל".',
  },
  {
    face: "concerned",
    text: "אבל שים לב — לפעמים אני טועה, או מבין משהו אחר ממה שהתכוונת. זה קורה גם ל-AI.",
  },
  {
    face: "warm",
    text: "לכן אחרי כל שינוי — תשחק ותבדוק. אם זה לא מה שרצית, תגיד לי, ונתקן ביחד. יאללה, מתחילים!",
  },
];

/**
 * Run the intro. Resolves when the child finishes or skips it.
 * Skipping is a first-class option: some children want to press things immediately,
 * and the worst possible start is a character blocking the game they came to play.
 */
export function runOnboarding(host, { onStep } = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "intro";

    const keeperBox = document.createElement("div");
    const keeper = createFirekeeper(keeperBox, {});
    keeper.element.classList.add("keeper--big");

    const dots = document.createElement("div");
    dots.className = "intro__dots";

    const controls = document.createElement("div");
    controls.className = "intro__controls";

    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "btn btn--ghost btn--small";
    skip.textContent = "דלג";

    const next = document.createElement("button");
    next.type = "button";
    next.className = "btn";

    controls.append(skip, next);
    dialog.append(keeperBox, dots, controls);
    document.body.append(dialog);

    let step = 0;

    function render() {
      const current = ONBOARDING[step];
      keeper.face(current.face);
      keeper.say(current.text);
      next.textContent = step === ONBOARDING.length - 1 ? "יאללה!" : "הבא";

      dots.innerHTML = "";
      ONBOARDING.forEach((_, i) => {
        const dot = document.createElement("span");
        dot.className = "intro__dot" + (i === step ? " is-on" : "");
        dots.append(dot);
      });

      onStep?.(step, current);
    }

    function finish() {
      dialog.close();
      dialog.remove();
      resolve();
    }

    next.addEventListener("click", () => {
      if (step === ONBOARDING.length - 1) finish();
      else {
        step += 1;
        render();
      }
    });
    skip.addEventListener("click", finish);

    // Escape should not strand a half-open dialog over the game.
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish();
    });

    render();
    dialog.showModal();
    next.focus();
  });
}
