// Persistent meta: one versioned JSON blob in localStorage. Every access is
// try/catch'd (private browsing). No currency, no grind — just bests, feats,
// and settings.

const KEY = 'dodgeblock-remix-v1';

const DEFAULTS = {
  version: 1,
  highscores: [], // [{ score, height, zone, seed, date, daily }] top 10
  bestHeight: 0,
  bestScore: 0,
  dailyBest: {}, // 'YYYY-MM-DD' -> score
  unlocks: {}, // palette id -> true
  goldrushClears: 0,
  settings: { palette: 'classic' },
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const d = JSON.parse(raw);
    return { ...structuredClone(DEFAULTS), ...d, settings: { ...DEFAULTS.settings, ...d.settings } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

class Storage {
  constructor() {
    this.data = load();
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* private browsing */
    }
  }

  // returns which records were beaten so the game-over card can celebrate
  recordRun({ score, height, zone, seed, daily, date }) {
    const d = this.data;
    const result = {
      newBestScore: score > d.bestScore,
      newBestHeight: height > d.bestHeight,
      newDailyBest: false,
    };
    d.bestScore = Math.max(d.bestScore, score);
    d.bestHeight = Math.max(d.bestHeight, height);
    d.highscores.push({ score, height, zone, seed, date, daily: !!daily });
    d.highscores.sort((a, b) => b.score - a.score);
    d.highscores.length = Math.min(d.highscores.length, 10);
    if (daily && date) {
      if (score > (d.dailyBest[date] ?? 0)) {
        d.dailyBest = { [date]: score }; // keep only today's
        result.newDailyBest = true;
      }
    }
    this.save();
    return result;
  }

  unlock(id) {
    if (this.data.unlocks[id]) return false;
    this.data.unlocks[id] = true;
    this.save();
    return true;
  }

  addGoldrushClear() {
    this.data.goldrushClears++;
    this.save();
    return this.data.goldrushClears;
  }

  setPalette(id) {
    this.data.settings.palette = id;
    this.save();
  }
}

export const storage = new Storage();
