// @key-title Song Title Romanizer & Translator
// @description Romanizes & translates player bar song names (stacked lines).
// @author Your Name

(function SongTranslatorAndRomanizer() {
  if (!Spicetify.Player || !Spicetify.Platform) {
    setTimeout(SongTranslatorAndRomanizer, 500);
    return;
  }

  const TARGET_LANG = 'en'; // Target translation language
  const CACHE_KEY = 'spicetify-song-meta-cache';
  
  // 1. Initialize the persistent metadata cache
  let metaCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  function saveCache() {
    localStorage.setItem(CACHE_KEY, JSON.stringify(metaCache));
  }

  // 2. Fetch both Translation and Romanization in a single query
  async function fetchSongMeta(text) {
    if (metaCache[text]) {
      return metaCache[text];
    }

    // dt=t (translation) & dt=rm (romanization) combined with dj=1 (key-value JSON)
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${TARGET_LANG}&dt=t&dt=rm&dj=1&q=${encodeURIComponent(text)}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data && data.sentences && data.sentences.length > 0) {
        // Parse translation text
        const translated = data.sentences
          .map(s => s.trans)
          .join('')
          .trim();
        
        // Parse romanized text
        const romanized = data.sentences
          .map(s => s.src_translit)
          .filter(Boolean)
          .join(' ')
          .trim();
        
        // Save to cache (only if they are different from the original title)
        const result = {
          t: (translated && translated.toLowerCase() !== text.toLowerCase()) ? translated : null,
          r: (romanized && romanized.toLowerCase() !== text.toLowerCase()) ? romanized : null
        };

        metaCache[text] = result;
        saveCache();
        return result;
      }
    } catch (error) {
      console.error(`Failed to fetch metadata for "${text}":`, error);
    }
    return { t: null, r: null };
  }

  // ----------------------------------------------------
  // NOW PLAYING BAR (Stacked Subtitles)
  // ----------------------------------------------------
  async function updateNowPlaying() {
    const trackInfo = document.querySelector('.main-nowPlayingWidget-trackInfo');
    if (!trackInfo) {
      setTimeout(updateNowPlaying, 500);
      return;
    }

    const currentTrack = Spicetify.Player.data?.item;
    if (!currentTrack) return;

    const originalTitle = currentTrack.name;

    // Create separate subtitle elements for stacked lines
    let romanizedEl = document.getElementById('spicetify-player-romanized');
    let translatedEl = document.getElementById('spicetify-player-translated');

    if (!romanizedEl) {
      romanizedEl = document.createElement('div');
      romanizedEl.id = 'spicetify-player-romanized';
      romanizedEl.style.fontSize = '0.75rem';
      romanizedEl.style.color = '#b3b3b3'; // Matches standard Spotify artist name color
      romanizedEl.style.marginTop = '2px';
      romanizedEl.style.whiteSpace = 'nowrap';
      romanizedEl.style.overflow = 'hidden';
      romanizedEl.style.textOverflow = 'ellipsis';
      trackInfo.appendChild(romanizedEl);
    }

    if (!translatedEl) {
      translatedEl = document.createElement('div');
      translatedEl.id = 'spicetify-player-translated';
      translatedEl.style.fontSize = '0.70rem';
      translatedEl.style.color = '#727272'; // Dimmer grey for hierarchy
      translatedEl.style.marginTop = '1px';
      translatedEl.style.whiteSpace = 'nowrap';
      translatedEl.style.overflow = 'hidden';
      translatedEl.style.textOverflow = 'ellipsis';
      trackInfo.appendChild(translatedEl);
    }

    // Reset display
    romanizedEl.textContent = '';
    romanizedEl.style.display = 'none';
    translatedEl.textContent = '';
    translatedEl.style.display = 'none';

    // Get metadata (fetches or returns cached)
    const meta = await fetchSongMeta(originalTitle);

    if (meta.r) {
      romanizedEl.textContent = meta.r;
      romanizedEl.style.display = 'block';
    }
    if (meta.t) {
      translatedEl.textContent = meta.t;
      translatedEl.style.display = 'block';
    }
  }

  // Hook player changes
  Spicetify.Player.addEventListener("songchange", updateNowPlaying);
  updateNowPlaying();
})();
