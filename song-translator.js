// @key-title Song Title Romanizer & Translator
// @description Romanizes & translates player bar song names (stacked, synced, with ASCII filter).
// @spectatehaze

(function SongTranslatorAndRomanizer() {
  if (!Spicetify.Player || !Spicetify.Platform) {
    setTimeout(SongTranslatorAndRomanizer, 500);
    return;
  }

  const TARGET_LANG = 'en'; // Target translation language
  const CACHE_KEY = 'spicetify-song-meta-cache';

  // Regex to detect foreign scripts (Japanese, Chinese, Korean, Cyrillic, Greek, Arabic, Hebrew, Hindi, Thai)
  const FOREIGN_SCRIPT_REGEX = /[\u3040-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF\uAC00-\uD7AF\u1100-\u11FF\u0400-\u04FF\u0370-\u03FF\u0600-\u06FF\u0590-\u05FF\u0900-\u097F\u0E00-\u0E7F]/;

  // Helper to check if a title actually needs translation/romanization
  function needsProcessing(text) {
    return FOREIGN_SCRIPT_REGEX.test(text);
  }

  // 1. Inject the marquee keyframes style tag once
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes spicetify-marquee {
      0% { transform: translateX(0); }
      8% { transform: translateX(0); }
      92% { transform: translateX(var(--scroll-amount)); }
      100% { transform: translateX(var(--scroll-amount)); }
    }
  `;
  document.head.appendChild(style);
  
  // 2. Initialize the persistent metadata cache
  let metaCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  function saveCache() {
    localStorage.setItem(CACHE_KEY, JSON.stringify(metaCache));
  }

  // 3. Fetch both Translation and Romanization in a single query
  async function fetchSongMeta(text) {
    // If the text is already standard Latin/ASCII, skip the API call immediately
    if (!needsProcessing(text)) {
      return { t: null, r: null };
    }

    if (metaCache[text]) {
      return metaCache[text];
    }

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

  // Helper to handle text updates and determine if a scrolling marquee is needed
  function setTextAndMarquee(container, text) {
    const span = container.querySelector('.spicetify-marquee-text');
    span.textContent = text;
    
    // Reset properties before calculating
    span.style.animation = 'none';
    span.style.transform = 'translateX(0)';
    container.style.textOverflow = 'ellipsis';
    container.style.display = 'block';

    // Wait a brief frame for Spotify to render container widths
    setTimeout(() => {
      const containerWidth = container.clientWidth;
      const textWidth = span.offsetWidth;

      if (textWidth > containerWidth) {
        // Hide standard ellipsis dots during animation
        container.style.textOverflow = 'clip';
        
        // Calculate dynamic translation amount (+15px extra breathing room at the end)
        const scrollAmt = textWidth - containerWidth + 15;
        span.style.setProperty('--scroll-amount', `-${scrollAmt}px`);
        
        // Calculate uniform duration based on text length (~25px scroll distance per second)
        const duration = Math.max(5, Math.round(scrollAmt / 25));
        
        // Apply back-and-forth alternate animation
        span.style.animation = `spicetify-marquee ${duration}s ease-in-out infinite alternate`;
      }
    }, 50);
  }

  // ----------------------------------------------------
  // NOW PLAYING BAR (Synchronized Subtitles)
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

    // Create the master wrapper and synchronized track if they don't exist
    let wrapperEl = document.getElementById('spicetify-subtitles-wrapper');
    let trackEl = document.getElementById('spicetify-subtitles-track');
    let romanizedEl = document.getElementById('spicetify-player-romanized');
    let translatedEl = document.getElementById('spicetify-player-translated');

    if (!wrapperEl) {
      wrapperEl = document.createElement('div');
      wrapperEl.id = 'spicetify-subtitles-wrapper';
      wrapperEl.style.width = '100%';
      wrapperEl.style.overflow = 'hidden';
      
      trackEl = document.createElement('div');
      trackEl.id = 'spicetify-subtitles-track';
      trackEl.style.display = 'flex';
      trackEl.style.flexDirection = 'column';
      trackEl.style.width = 'max-content'; // Shrinks/grows to fit the widest line

      romanizedEl = document.createElement('div');
      romanizedEl.id = 'spicetify-player-romanized';
      romanizedEl.style.fontSize = '0.75rem';
      romanizedEl.style.color = '#b3b3b3'; // Matches standard Spotify artist color
      romanizedEl.style.marginTop = '2px';
      romanizedEl.style.whiteSpace = 'nowrap';

      translatedEl = document.createElement('div');
      translatedEl.id = 'spicetify-player-translated';
      translatedEl.style.fontSize = '0.70rem';
      translatedEl.style.color = '#727272'; // Dimmer grey for hierarchy
      translatedEl.style.marginTop = '1px';
      translatedEl.style.whiteSpace = 'nowrap';

      trackEl.appendChild(romanizedEl);
      trackEl.appendChild(translatedEl);
      wrapperEl.appendChild(trackEl);
      trackInfo.appendChild(wrapperEl);
    }

    // Reset styles and values
    trackEl.style.animation = 'none';
    trackEl.style.transform = 'translateX(0)';
    
    romanizedEl.textContent = '';
    romanizedEl.style.display = 'none';
    translatedEl.textContent = '';
    translatedEl.style.display = 'none';
    wrapperEl.style.display = 'none';

    // Get metadata (fetches or returns cached)
    const meta = await fetchSongMeta(originalTitle);

    let hasContent = false;
    if (meta.r) {
      romanizedEl.textContent = meta.r;
      romanizedEl.style.display = 'block';
      hasContent = true;
    }
    if (meta.t) {
      translatedEl.textContent = meta.t;
      translatedEl.style.display = 'block';
      hasContent = true;
    }

    if (hasContent) {
      wrapperEl.style.display = 'block';

      // Wait a frame for Spicetify to calculate container widths
      setTimeout(() => {
        const containerWidth = wrapperEl.clientWidth;
        const trackWidth = trackEl.offsetWidth;

        if (trackWidth > containerWidth) {
          // Calculate scroll distance (with 15px safety buffer at the end)
          const scrollAmt = trackWidth - containerWidth + 15;
          trackEl.style.setProperty('--scroll-amount', `-${scrollAmt}px`);
          
          // Calculate duration proportional to the scroll distance (~25px per second)
          const duration = Math.max(5, Math.round(scrollAmt / 25));
          
          // Apply animation to the entire track containing both lines
          trackEl.style.animation = `spicetify-marquee ${duration}s ease-in-out infinite alternate`;
        }
      }, 50);
    }
  }

  // Hook player changes
  Spicetify.Player.addEventListener("songchange", updateNowPlaying);
  updateNowPlaying();
})();
