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

/** Whether verses should render at all, per the household's own setting. */
export const versesOn = (state) =>
  !!(state.faith && state.faith.enabled) && (state.faith.scripture || "relevant") !== "off";

/** Prayer prompts follow the faith layer itself, not the scripture dial. */
export const prayersOn = (state) => !!(state.faith && state.faith.enabled);
