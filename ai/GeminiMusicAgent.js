const { GoogleGenerativeAI } = require('@google/generative-ai');

// Models to try in order when one fails with 404/503
const MODEL_FALLBACK_LIST = [
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-2.5-flash',
  'gemini-pro'
];

class GeminiMusicAgent {
  constructor() {
    this.genAI = null;
    this.model = null;
    this.activeModelName = null;
    this.init();
  }

  init() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('\x1b[33m[GEMINI WARNING] GEMINI_API_KEY tidak ditemukan di .env. Fitur AI akan menggunakan mode fallback.\x1b[0m');
      return;
    }
    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      // Use configurable model from env, fallback to first in list
      const modelName = process.env.GEMINI_MODEL || MODEL_FALLBACK_LIST[0];
      this.activeModelName = modelName;
      this.model = this.genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json'
        }
      });
      console.log(`\x1b[32m✅ [GEMINI] Model aktif: ${modelName}\x1b[0m`);
    } catch (err) {
      console.error('[Gemini Initialisation Error]', err.message);
    }
  }

  /**
   * Retry generateContent with exponential backoff.
   * On 404 (model not found), tries the next model in fallback list.
   */
  async _generateWithRetry(prompt, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await this.model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }]
        });
        return response;
      } catch (err) {
        const msg = err.message || '';
        const is404 = msg.includes('404') || msg.toLowerCase().includes('not found');
        const is503 = msg.includes('503') || msg.toLowerCase().includes('unavailable') || msg.toLowerCase().includes('high demand');

        if (is404) {
          // Try next model in fallback list
          const currentIdx = MODEL_FALLBACK_LIST.indexOf(this.activeModelName);
          const nextIdx = currentIdx + 1;
          if (nextIdx < MODEL_FALLBACK_LIST.length) {
            const nextModel = MODEL_FALLBACK_LIST[nextIdx];
            console.warn(`\x1b[33m[GEMINI] Model "${this.activeModelName}" tidak tersedia (404). Mencoba "${nextModel}"...\x1b[0m`);
            this.activeModelName = nextModel;
            this.model = this.genAI.getGenerativeModel({
              model: nextModel,
              generationConfig: { responseMimeType: 'application/json' }
            });
            continue; // retry immediately with new model
          }
          // All models exhausted
          throw err;
        }

        if (is503 && attempt < retries) {
          // Exponential backoff: 1s, 2s, 4s
          const waitMs = Math.pow(2, attempt - 1) * 1000;
          console.warn(`\x1b[33m[GEMINI] 503 High demand. Retrying in ${waitMs}ms (attempt ${attempt}/${retries})...\x1b[0m`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }

        throw err;
      }
    }
  }

  async parseQuery(userQuery, context = {}) {
    // Re-initialize if API key was updated in web dashboard settings after boot
    if (!this.genAI && process.env.GEMINI_API_KEY) {
      this.init();
    }

    if (!this.genAI || !this.model) {
      // Fallback mode if Gemini is not set up
      return { type: 'search', query: userQuery };
    }

    const { currentSong, previousSong, queue } = context;

    const systemInstruction = `You are a Discord music bot assistant. Your job is to parse natural language music requests from users and translate them into a structured JSON response.
You MUST return ONLY a JSON object matching the following structure:
{
  "type": "search" | "url" | "recommendation" | "playlist",
  "query": "string (the search query to use)",
  "queries": ["string", "string"] (optional, if multiple songs/playlist are requested, return list of individual song search queries),
  "artist": "string" (optional, detected artist name),
  "title": "string" (optional, detected song title),
  "url": "string" (optional, if the user input is a URL)
}

Guidelines:
1. If the input is a URL (starts with http or https), set type to 'url' and include the 'url' field. Do not change or normalize the URL.
2. If the user asks for 'lagu yang tadi' (the previous song) or 'putar ulang yang tadi', check the context for 'previousSong'. If available, set type to 'search' and set query to the title and artist of the previous song.
3. If the user asks for 'yang mirip lagu ini' or 'similar to this song', check the context for 'currentSong'. Set type to 'recommendation' and generate a search query for a similar song.
4. If the user asks for multiple songs (e.g., '5 lagu dari hindia', '3 songs from Coldplay', 'playlist lagu santai'), set type to 'playlist' and generate a list of individual search queries in the 'queries' array.
5. Otherwise, normalize the query (e.g. remove words like 'putar', 'play', 'music') and output type 'search' with the normalized query.`;

    const contextStr = JSON.stringify({
      currentSong: currentSong ? `${currentSong.title} by ${currentSong.artist}` : null,
      previousSong: previousSong ? `${previousSong.title} by ${previousSong.artist}` : null,
      queue: queue ? queue.map(s => `${s.title} by ${s.artist}`) : []
    });

    const prompt = `${systemInstruction}\n\nContext: ${contextStr}\nUser Input: "${userQuery}"`;

    try {
      const response = await this._generateWithRetry(prompt, 3);
      const responseText = response.response.text();
      const parsed = JSON.parse(responseText.trim());
      return parsed;
    } catch (err) {
      console.error('[Gemini parseQuery Error]', err.message);
      // Graceful fallback — use the raw user query as a direct search
      return { type: 'search', query: userQuery };
    }
  }
}

module.exports = new GeminiMusicAgent();
