/* ==================================================================
   one verse per stewardship bucket — curated, static, guiding

   These are the household's chosen framing, not the AI's voice: fixed
   text (KJV, public domain), one per bucket, shown only when the faith
   layer is on AND the household's biblical-perspective setting isn't
   "off". A verse sits beside a number as guidance — never as a verdict
   on how they're doing. Keep them short; the point is orientation,
   not a sermon.
   ================================================================== */

/* Plain modern English, from the World English Bible (public domain). */
export const STEW_VERSES = {
  provision: {
    ref: "James 1:17",
    text: "Every good gift and every perfect gift is from above.",
  },
  needs: {
    ref: "Matthew 6:32",
    text: "Your heavenly Father knows that you need all these things.",
  },
  giving: {
    ref: "Proverbs 3:9",
    text: "Honor the Lord with your wealth, with the firstfruits of all your increase.",
  },
  obligations: {
    ref: "Romans 13:7–8",
    text: "Give everyone what you owe… owe no one anything, except to love one another.",
  },
  saving: {
    ref: "Proverbs 21:20",
    text: "There is precious treasure and oil in the dwelling of the wise.",
  },
  enjoyment: {
    ref: "1 Timothy 6:17",
    text: "God richly provides us with everything to enjoy.",
  },
  future: {
    ref: "Proverbs 13:22",
    text: "A good man leaves an inheritance to his children's children.",
  },
  enough: {
    ref: "1 Timothy 6:6",
    text: "Godliness with contentment is great gain.",
  },
};

/* One more for the moment of deciding — wisdom, asked for out loud. */
export const DECIDE_VERSE = {
  ref: "James 1:5",
  text: "If any of you lacks wisdom, let him ask of God, who gives to all liberally.",
};

/* The meeting walks its steps through the same framework. */
export const MEETING_VERSES = {
  gratitude: STEW_VERSES.provision,
  stand: STEW_VERSES.needs,
  celebrate: STEW_VERSES.enjoyment,
  conversation: STEW_VERSES.giving,
  decide: DECIDE_VERSE,
  close: STEW_VERSES.enough,
};

/* Short prayer prompts for the moments a decision is actually made.
   Static and optional — offered as "if it's your practice", never
   required, never AI-written. */
export const PRAYERS = {
  gratitude: "Thank You for what came into our hands this week — it was enough for today.",
  decision: "Lord, this money was Yours before it was ours. Give us wisdom and one mind — and peace with whatever we choose together.",
  close: "Keep us faithful with what we have, content with what we don't, and generous either way. Amen.",
};

/* ==================================================================
   the way of life — Scripture's broad teaching on money, held as a
   lifestyle. Each principle: what the Bible says (short, plain-English
   public-domain quotes) and what this household practices because of
   it. This is the deep frame behind every screen — and it is general
   revealed teaching, never a verdict on a specific decision. The app
   still never says what God wants them to choose; the two of them do.
   ================================================================== */

export const LIFE = [
  {
    key: "owner",
    glyph: "🌾",
    go: { label: "See the whole picture", view: "stew" },
    title: "It was His before it was ours",
    refs: [
      { ref: "Psalm 24:1", text: "The earth is the Lord's, with its fullness — the world, and those who dwell in it." },
      { ref: "1 Chronicles 29:14", text: "All things come from You, and of Your own have we given You." },
    ],
    practice: "It's why this app opens with provision, not net worth — everything managed here was received first.",
  },
  {
    key: "know",
    glyph: "📋",
    go: { label: "Open our plan", view: "plan" },
    title: "Know the state of what you keep",
    refs: [
      { ref: "Proverbs 27:23", text: "Know well the state of your flocks, and pay attention to your herds." },
      { ref: "Luke 14:28", text: "Which of you, desiring to build a tower, doesn't first sit down and count the cost?" },
    ],
    practice: "It's why every dollar is counted — the plan, the envelopes, the calendar. Attention is stewardship's first act.",
  },
  {
    key: "little",
    glyph: "🧾",
    go: { label: "Log the little things", view: "txn" },
    title: "Faithful in very little",
    refs: [
      { ref: "Luke 16:10", text: "He who is faithful in a very little is faithful also in much." },
    ],
    practice: "It's why logging the $14 lunch matters. Small faithfulness is the training ground for larger trust.",
  },
  {
    key: "provide",
    glyph: "🏠",
    go: { label: "Keep the bills current", view: "bills" },
    title: "Provide for your own household",
    refs: [
      { ref: "1 Timothy 5:8", text: "If anyone doesn't provide for his own, especially his own household, he has denied the faith." },
    ],
    practice: "It's why needs and bills are funded before comfort — and before anything gets to call itself generosity.",
  },
  {
    key: "give",
    glyph: "💛",
    go: { label: "Set your giving", view: "plan" },
    title: "Give first, and cheerfully",
    refs: [
      { ref: "Proverbs 3:9", text: "Honor the Lord with your wealth, with the firstfruits of all your increase." },
      { ref: "2 Corinthians 9:7", text: "Let each man give as he has determined in his heart — for God loves a cheerful giver." },
      { ref: "Acts 20:35", text: "It is more blessed to give than to receive." },
    ],
    practice: "It's why giving comes off the top at a number you chose — decided in your hearts, not squeezed from what's left.",
  },
  {
    key: "debt",
    glyph: "🔓",
    go: { label: "See the payoff plan", view: "worth" },
    title: "Walk out of debt's shadow",
    refs: [
      { ref: "Proverbs 22:7", text: "The borrower is servant to the lender." },
      { ref: "Romans 13:8", text: "Owe no one anything, except to love one another." },
    ],
    practice: "It's why the payoff plan attacks the most expensive debt first, and why the debt-free date is real arithmetic.",
  },
  {
    key: "store",
    glyph: "🛟",
    go: { label: "Build the fund", view: "goals" },
    title: "Store up in summer",
    refs: [
      { ref: "Proverbs 6:6–8", text: "Go to the ant… she prepares her bread in the summer, and gathers her food in the harvest." },
      { ref: "Proverbs 21:20", text: "There is precious treasure and oil in the dwelling of the wise." },
    ],
    practice: "It's why the emergency fund exists — summer work for winter's certainty. Preparation is wisdom, not doubt.",
  },
  {
    key: "fear",
    glyph: "🕊️",
    go: { label: "See where you stand", view: "dash" },
    title: "Plan without fear",
    refs: [
      { ref: "Matthew 6:26", text: "See the birds of the sky… your heavenly Father feeds them. Aren't you of much more value than they?" },
      { ref: "Matthew 6:34", text: "Therefore don't be anxious for tomorrow." },
    ],
    practice: "It's why the numbers are always on the table. Knowing where you stand is how planning replaces worry instead of feeding it.",
  },
  {
    key: "love",
    glyph: "⚖️",
    go: { label: "Define enough", view: "stew" },
    title: "Guard against the love of it",
    refs: [
      { ref: "1 Timothy 6:10", text: "The love of money is a root of all kinds of evil." },
      { ref: "Luke 12:15", text: "One's life doesn't consist of the abundance of the things which he possesses." },
    ],
    practice: "It's why Enough is a line you write down — past it, money becomes a decision to make, never a score to run up.",
  },
  {
    key: "enjoy",
    glyph: "🍜",
    go: { label: "Fund the fun", view: "budget" },
    title: "Enjoy what's been given",
    refs: [
      { ref: "Ecclesiastes 5:19", text: "Everyone to whom God has given riches and wealth… to rejoice in his labor — this is the gift of God." },
      { ref: "1 Timothy 6:17", text: "God richly provides us with everything to enjoy." },
    ],
    practice: "It's why enjoyment has its own envelopes, agreed and guilt-free. None of this was meant to be grim.",
  },
  {
    key: "together",
    glyph: "🤝",
    go: { label: "Hold the meeting", view: "meeting" },
    title: "Better together",
    refs: [
      { ref: "Ecclesiastes 4:9–10", text: "Two are better than one… for if they fall, the one will lift up his fellow." },
    ],
    practice: "It's why the meeting has two votes and no budget cop, and why big decisions end with the two of you, together.",
  },
  {
    key: "legacy",
    glyph: "🌱",
    go: { label: "Fund what outlasts you", view: "goals" },
    title: "Leave something behind",
    refs: [
      { ref: "Proverbs 13:22", text: "A good man leaves an inheritance to his children's children." },
    ],
    practice: "It's why the future gets funded now, while it's cheap — goals and net worth as legacy, not leaderboard.",
  },
];

/** Whether verses should render at all, per the household's own setting. */
export const versesOn = (state) =>
  !!(state.faith && state.faith.enabled) && (state.faith.scripture || "relevant") !== "off";

/** Prayer prompts follow the faith layer itself, not the scripture dial. */
export const prayersOn = (state) => !!(state.faith && state.faith.enabled);
