// The first-visit tour of Greenmere: one stop per keeper, the notice board, and the
// Delve Gate, in clockwise order round the square (north is -z): from the gate road to
// the inn (NE), the forge (E), the Circle (S), the bank (SW), the store (W), the still
// (NW), the board, and back north to the gate. Pure data. play/intro.js frames each
// stop and ui/intro.js shows the two cards: who stands here (left) and what you can do
// here (right).
//
// focus: "square" (the opening wide shot), "keeper" (a keeper at their counter,
// seen through the cut-away roof), "board" (the notice board), "gate" (the portal).

export const INTRO_STOPS = [
  {
    id: "welcome",
    focus: "square",
    eyebrow: "Welcome, Warden",
    name: "Greenmere",
    title: "the last town before the Underwood",
    who: "A small town in the Outer Wood, built over a dungeon that has no last floor. The people here keep the lamps lit for the one who goes down: you.",
    doTitle: "Between delves",
    can: [
      "Sell what you carry up and spend it on better gear",
      "Train, rest, and brew draughts for the next delve",
      "The deeper you go, the more the town grows"
    ]
  },
  {
    id: "pell",
    focus: "keeper",
    building: "inn",
    eyebrow: "The Banked Fire",
    name: "Pell",
    title: "innkeeper",
    who: "Pell never leaves the bar, so everything the town hears ends up with Pell.",
    doTitle: "At the inn",
    can: [
      "Rest to restore your health and mana",
      "Sleep until morning, or doze until evening",
      "Hear rumours about the next floor and its boss"
    ]
  },
  {
    id: "orrin",
    focus: "keeper",
    building: "smith",
    eyebrow: "The Quench",
    name: "Orrin Vale",
    title: "smith",
    who: "Orrin works the forge east of the square. Few words, good steel.",
    doTitle: "At the forge",
    can: [
      "Upgrade worn gear one item level at a time, for gold and materials",
      "Craft oils and kits that sharpen your gear",
      "He can only forge as deep as you have been: extract from deeper floors to unlock higher levels"
    ]
  },
  {
    id: "tamsin",
    focus: "keeper",
    building: "trainer",
    eyebrow: "The Circle",
    name: "Old Tamsin",
    title: "trainer",
    who: "Old Tamsin has trained wardens for forty years, and watches every one of them go down.",
    doTitle: "In the Circle",
    can: [
      "Spend the skill points you earn as you level up",
      "Edge for your strikes, Bulwark for your Ward",
      "Mend for healing, Delver for speed and a faster extract"
    ]
  },
  {
    id: "aldous",
    focus: "keeper",
    building: "bank",
    eyebrow: "The Counting House",
    name: "Aldous Penn",
    title: "banker",
    who: "Aldous keeps the town's ledger and its strongroom. Nothing has gone missing from it yet.",
    doTitle: "At the bank",
    can: [
      "Bank your gold and stash spare gear",
      "Anything banked or stashed is safe if you fall below",
      "Your purse and your pack are not"
    ]
  },
  {
    id: "maud",
    focus: "keeper",
    building: "store",
    eyebrow: "Bramble & Board",
    name: "Maud Bramble",
    title: "shopkeeper",
    who: "Maud keeps the general store on the west side of the square. There is a price for everything, and the scales are trusted more than most people.",
    doTitle: "At the store",
    can: [
      "Buy health and mana draughts",
      "Sell the gear you bring up from below",
      "Buy back anything you sold by mistake"
    ]
  },
  {
    id: "wen",
    focus: "keeper",
    building: "still",
    eyebrow: "The Still",
    name: "Sister Wen",
    title: "distiller",
    who: "Sister Wen tends the copper still by the gate road. Some days the whole town smells of it.",
    doTitle: "At the still",
    can: [
      "Distill health draughts from heartwood",
      "Distill mana draughts from rootfiber",
      "Bring up materials from the Underwood to keep her stocked"
    ]
  },
  {
    id: "board",
    focus: "board",
    eyebrow: "The Square",
    name: "Notice Board",
    title: "the town's requests",
    who: "Every morning the town pins up new jobs for the Warden. Keepers ask for favours too. Look for the ! over their heads.",
    doTitle: "At the board",
    can: [
      "Take daily notices: slay foes, reach a floor, gather materials",
      "Hand them in for gold and experience",
      "New notices go up every day"
    ]
  },
  {
    id: "gate",
    focus: "gate",
    eyebrow: "The North Gate",
    name: "The Delve Gate",
    title: "the way into the Underwood",
    who: "Beneath Greenmere lies the Underwood. Every floor is new, and every floor goes deeper. Every ten floors the Underwood changes, and every fifth floor a warden guards the stairs.",
    doTitle: "Delving",
    can: [
      "Walk through the veil to start on floor 1",
      "Find the stairs on each floor to go deeper",
      "Hold X to extract and bring your spoils home",
      "If you fall, you lose what you carried. Worn gear, the bank, and your levels stay"
    ]
  }
];
