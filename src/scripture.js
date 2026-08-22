/**
 * Daily scripture for the stewardship layer.
 *
 * Verses are quoted from the World English Bible (WEB), which is in the
 * public domain — no license or attribution required, though the dashboard
 * card names the translation anyway.
 *
 * Each verse carries one theme so model() can match the day's verse to the
 * shape of the household's month (over plan → contentment, heavy debt →
 * debt, nothing set aside to give → giving, and so on). Selection is
 * deterministic by calendar day: both partners open the app and see the
 * same verse, and it changes at midnight, not on refresh.
 */

export const VERSE_THEMES = [
  "giving", "planning", "contentment", "debt", "provision", "diligence", "together",
];

export const VERSES = [
  // giving
  { ref: "Proverbs 3:9", theme: "giving",
    text: "Honor Yahweh with your substance, with the first fruits of all your increase." },
  { ref: "2 Corinthians 9:7", theme: "giving",
    text: "Let each man give according as he has determined in his heart, not grudgingly or under compulsion; for God loves a cheerful giver." },
  { ref: "Proverbs 11:25", theme: "giving",
    text: "The liberal soul shall be made fat. He who waters shall be watered also himself." },
  { ref: "Acts 20:35", theme: "giving",
    text: "Remember the words of the Lord Jesus, that he himself said, 'It is more blessed to give than to receive.'" },
  { ref: "Luke 6:38", theme: "giving",
    text: "Give, and it will be given to you: good measure, pressed down, shaken together, and running over, will be given to you." },
  { ref: "Proverbs 19:17", theme: "giving",
    text: "He who has pity on the poor lends to Yahweh; he will reward him." },
  { ref: "Proverbs 22:9", theme: "giving",
    text: "He who has a generous eye will be blessed, for he shares his food with the poor." },
  { ref: "2 Corinthians 9:6", theme: "giving",
    text: "He who sows sparingly will also reap sparingly. He who sows bountifully will also reap bountifully." },
  { ref: "Malachi 3:10", theme: "giving",
    text: "Bring the whole tithe into the storehouse, that there may be food in my house, and test me now in this, says Yahweh of Armies." },

  // planning
  { ref: "Proverbs 21:5", theme: "planning",
    text: "The plans of the diligent surely lead to profit; and everyone who is hasty surely rushes to poverty." },
  { ref: "Luke 14:28", theme: "planning",
    text: "For which of you, desiring to build a tower, doesn't first sit down and count the cost, to see if he has enough to complete it?" },
  { ref: "Proverbs 27:23", theme: "planning",
    text: "Know well the state of your flocks, and pay attention to your herds." },
  { ref: "Proverbs 24:3-4", theme: "planning",
    text: "Through wisdom a house is built; by understanding it is established; by knowledge the rooms are filled with all rare and beautiful treasure." },
  { ref: "Proverbs 6:6-8", theme: "planning",
    text: "Go to the ant, you sluggard. Consider her ways, and be wise; which having no chief, overseer, or ruler, provides her bread in the summer, and gathers her food in the harvest." },
  { ref: "Proverbs 16:3", theme: "planning",
    text: "Commit your deeds to Yahweh, and your plans shall succeed." },
  { ref: "Proverbs 15:22", theme: "planning",
    text: "Where there is no counsel, plans fail; but in a multitude of counselors they are established." },

  // contentment
  { ref: "1 Timothy 6:6", theme: "contentment",
    text: "But godliness with contentment is great gain." },
  { ref: "Hebrews 13:5", theme: "contentment",
    text: "Be free from the love of money, content with such things as you have, for he has said, 'I will in no way leave you, neither will I in any way forsake you.'" },
  { ref: "Philippians 4:12", theme: "contentment",
    text: "I know how to be humbled, and I also know how to abound. In everything and in all things I have learned the secret both to be filled and to be hungry, both to abound and to be in need." },
  { ref: "Proverbs 15:16", theme: "contentment",
    text: "Better is little, with the fear of Yahweh, than great treasure with trouble." },
  { ref: "Ecclesiastes 5:10", theme: "contentment",
    text: "He who loves silver shall not be satisfied with silver; nor he who loves abundance, with increase." },
  { ref: "Luke 12:15", theme: "contentment",
    text: "Beware! Keep yourselves from covetousness, for a man's life doesn't consist of the abundance of the things which he possesses." },
  { ref: "Matthew 6:21", theme: "contentment",
    text: "For where your treasure is, there your heart will be also." },
  { ref: "Proverbs 30:8", theme: "contentment",
    text: "Give me neither poverty nor riches. Feed me with the food that is needful for me." },

  // debt
  { ref: "Proverbs 22:7", theme: "debt",
    text: "The rich rule over the poor. The borrower is servant to the lender." },
  { ref: "Romans 13:8", theme: "debt",
    text: "Owe no one anything, except to love one another; for he who loves his neighbor has fulfilled the law." },
  { ref: "Psalm 37:21", theme: "debt",
    text: "The wicked borrow, and don't pay back, but the righteous give generously." },
  { ref: "Proverbs 22:26-27", theme: "debt",
    text: "Don't you be one of those who strike hands, of those who are collateral for debts. If you don't have means to pay, why should he take away your bed from under you?" },

  // provision
  { ref: "Matthew 6:26", theme: "provision",
    text: "See the birds of the sky, that they don't sow, neither do they reap, nor gather into barns. Your heavenly Father feeds them. Aren't you of much more value than they?" },
  { ref: "Philippians 4:19", theme: "provision",
    text: "My God will supply every need of yours according to his riches in glory in Christ Jesus." },
  { ref: "Matthew 6:33", theme: "provision",
    text: "But seek first God's Kingdom and his righteousness; and all these things will be given to you as well." },
  { ref: "Psalm 23:1", theme: "provision",
    text: "Yahweh is my shepherd; I shall lack nothing." },
  { ref: "Matthew 6:34", theme: "provision",
    text: "Therefore don't be anxious for tomorrow, for tomorrow will be anxious for itself. Each day's own evil is sufficient." },
  { ref: "Proverbs 10:22", theme: "provision",
    text: "Yahweh's blessing brings wealth, and he adds no trouble to it." },

  // diligence — earning, keeping, and building slowly
  { ref: "Proverbs 21:20", theme: "diligence",
    text: "There is precious treasure and oil in the dwelling of the wise, but a foolish man swallows it up." },
  { ref: "Proverbs 13:11", theme: "diligence",
    text: "Wealth gained dishonestly dwindles away, but he who gathers by hand makes it grow." },
  { ref: "Proverbs 10:4", theme: "diligence",
    text: "He becomes poor who works with a lazy hand, but the hand of the diligent brings wealth." },
  { ref: "Proverbs 13:22", theme: "diligence",
    text: "A good man leaves an inheritance to his children's children." },
  { ref: "Proverbs 28:20", theme: "diligence",
    text: "A faithful man is rich with blessings; but one who is eager to be rich will not go unpunished." },

  // together — two people, one plan
  { ref: "Ecclesiastes 4:9", theme: "together",
    text: "Two are better than one, because they have a good reward for their labor." },
  { ref: "Ecclesiastes 4:12", theme: "together",
    text: "If a man prevails against one who is alone, two shall withstand him; and a threefold cord is not quickly broken." },
  { ref: "Amos 3:3", theme: "together",
    text: "Do two walk together, unless they have agreed?" },
];

// Stable index for "today" — same all day, ticks over at local midnight.
export const dayIndex = (d = new Date()) =>
  d.getFullYear() * 372 + d.getMonth() * 31 + (d.getDate() - 1);

/**
 * Today's verse. Pass a theme to draw from that theme's pool (model() picks
 * one from the month's shape); pass null to rotate through everything.
 */
export function verseForDay(theme, d = new Date()) {
  const pool = theme ? VERSES.filter((v) => v.theme === theme) : VERSES;
  const list = pool.length ? pool : VERSES;
  return list[dayIndex(d) % list.length];
}
