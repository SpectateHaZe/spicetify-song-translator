// @key-title Song Title Romanizer & Translator
// @description Romanizes & translates player bar song names and lists globally with topbar settings and unbreakable DOM selectors.
// @spectatehaze

(function SongTranslatorAndRomanizer() {
  if (!Spicetify.Player || !Spicetify.Platform || !Spicetify.Topbar) {
    setTimeout(SongTranslatorAndRomanizer, 500);
    return;
  }

  const TARGET_LANG = 'en'; // Target translation language
  const CACHE_KEY = 'spicetify-song-meta-cache';
  const SETTING_KEY = 'spicetify-ui-translate-mode';

  // Current translation/romanization mode for UI tracklists: "romanize", "translate", "off"
  let currentMode = localStorage.getItem(SETTING_KEY) || 'romanize';

  // Regex to detect foreign scripts (Japanese, Chinese, Korean, Cyrillic, Greek, Arabic, Hebrew, Hindi, Thai)
  const FOREIGN_SCRIPT_REGEX = /[\u3040-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF\uAC00-\uD7AF\u1100-\u11FF\u0400-\u04FF\u0370-\u03FF\u0600-\u06FF\u0590-\u05FF\u0900-\u097F\u0E00-\u0E7F]/;

  // Globe SVG Icon for Topbar Settings
  const GLOBE_SVG = `<svg role="img" height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM2.54 8a5.38 5.38 0 01.14-1.25h1.94a11.19 11.19 0 000 2.5H2.68A5.38 5.38 0 012.54 8zm1.09-2.5h1.7a12.42 12.42 0 01.5-1.92 5.48 5.48 0 00-2.2 1.92zm2.93-1.99a11.08 11.08 0 00-.51 1.99h2.9a11.08 11.08 0 00-.51-1.99 4.3 4.3 0 00-1.88 0zm2.25 1.99a12.42 12.42 0 01.5 1.92h1.7a5.48 5.48 0 00-2.2-1.92zM6.1 8a9.92 9.92 0 010-1.25h3.8a9.92 9.92 0 010 2.5H6.1A9.92 9.92 0 016.1 8zm3.28 3.42a12.42 12.42 0 01.5-1.92h-3.76a12.42 12.42 0 01.5 1.92 4.3 4.3 0 002.76 0zm-4.04-1.92a12.42 12.42 0 01-.5 1.92h-1.7a5.48 5.48 0 012.2-1.92zm5.72 1.92a12.42 12.42 0 01-.5-1.92 5.48 5.48 0 012.2 1.92h-1.7z"/>
  </svg>`;

  // Helper to check if a title actually needs translation/romanization
  function needsProcessing(text) {
    return text && FOREIGN_SCRIPT_REGEX.test(text);
  }

  // Capitalize the first letter of each word (for translated titles)
  function titleCase(str) {
    if (!str) return str;
    return str.replace(/\b\w/g, c => c.toUpperCase());
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
      console.error(`[Song Translator] Failed to fetch metadata for "${text}":`, error);
    }
    return { t: null, r: null };
  }

  // ----------------------------------------------------
  // SEQUENTIAL REQUEST QUEUE (Prevents Google Rate Limits)
  // ----------------------------------------------------
  const requestQueue = [];
  let isProcessingQueue = false;

  async function processQueue() {
    if (isProcessingQueue || requestQueue.length === 0) return;
    isProcessingQueue = true;

    while (requestQueue.length > 0) {
      const task = requestQueue.shift();
      await task();
      // Safe 120ms gap between network requests to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 120));
    }

    isProcessingQueue = false;
  }

  function queueTranslation(text, callback) {
    requestQueue.push(async () => {
      const result = await fetchSongMeta(text);
      callback(result);
    });
    processQueue();
  }

  // Helper to handle text updates and determine if a scrolling marquee is needed
  function setTextAndMarquee(container, text) {
    const span = container.querySelector('.spicetify-marquee-text');
    if (!span) return;
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
  // PART 1: NOW PLAYING BAR (Synchronized Subtitles)
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
      wrapperEl.style.cursor = 'pointer'; // Make it look clickable
      wrapperEl.title = 'Click to cycle title mode (Romanize / Translate / Off)';

      // Cycle translation/romanization modes on click for quick controls
      wrapperEl.addEventListener('click', () => {
        let nextMode = 'romanize';
        if (currentMode === 'romanize') nextMode = 'translate';
        else if (currentMode === 'translate') nextMode = 'off';

        setMode(nextMode);
        Spicetify.showNotification(`Title Mode: ${nextMode.toUpperCase()}`);
      });

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
      translatedEl.textContent = titleCase(meta.t);
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

  // ----------------------------------------------------
  // PART 2: WHOLE UI TRACKLISTS (Settings Dependent)
  // ----------------------------------------------------
  let isUpdatingUI = false;

  function applyReplacement(textNode, meta, originalTitle) {
    let replacement = null;
    if (currentMode === 'romanize') {
      replacement = meta.r;
    } else if (currentMode === 'translate') {
      replacement = titleCase(meta.t);
    }

    if (replacement) {
      try {
        isUpdatingUI = true;
        textNode.textContent = replacement;
        textNode.dataset.spicetifyProcessed = currentMode;
      } finally {
        isUpdatingUI = false;
      }
    } else {
      // Revert if no translation/romanization exists (or matches the original text)
      if (textNode.textContent !== originalTitle) {
        try {
          isUpdatingUI = true;
          textNode.textContent = originalTitle;
        } finally {
          isUpdatingUI = false;
        }
      }
      textNode.dataset.spicetifyProcessed = currentMode;
    }
  }

  function processTrackRow(row) {
    // Find all gridcells in this row
    const gridcells = row.querySelectorAll('[role="gridcell"]');
    if (gridcells.length === 0) return;

    let textNode = null;
    let textIsForeign = false;

    for (const cell of gridcells) {
      const cellText = cell.textContent.trim();
      if (/^\d+$/.test(cellText)) continue;

      const candidates = cell.querySelectorAll('span, div, a');
      for (const candidate of candidates) {
        const text = candidate.textContent.trim();
        if (!text || text.length > 200) continue;
        if (candidate.children.length > 0 && candidate.querySelector('span, div, a')) continue;

        // Check if this element has foreign text OR is already showing a cached replacement
        if (needsProcessing(text)) {
          textNode = candidate;
          textIsForeign = true;
          break;
        }

        // Also check: is this element already showing a cached replacement?
        // (e.g. element text = "Grey and Blue" which is a cached translation of "灰色と青")
        if (candidate.dataset.spicetifyOriginal && candidate.dataset.spicetifyProcessed === currentMode) {
          // Already processed and showing the right replacement — skip entirely
          return;
        }

        break;
      }
      if (textNode) break;
    }

    if (!textNode) return;

    // Cache the original title on the element
    if (!textNode.dataset.spicetifyOriginal) {
      textNode.dataset.spicetifyOriginal = textNode.textContent.trim();
    }

    const originalTitle = textNode.dataset.spicetifyOriginal;

    // Revert if disabled
    if (currentMode === 'off') {
      if (textNode.textContent !== originalTitle) {
        try {
          isUpdatingUI = true;
          textNode.textContent = originalTitle;
        } finally {
          isUpdatingUI = false;
        }
      }
      textNode.dataset.spicetifyProcessed = 'false';
      return;
    }

    // Skip if already processed in the current mode
    if (textNode.dataset.spicetifyProcessed === currentMode) return;

    // FAST PATH: If we already have this in cache, apply synchronously (no flicker)
    if (metaCache[originalTitle]) {
      applyReplacement(textNode, metaCache[originalTitle], originalTitle);
      return;
    }

    // SLOW PATH: Queue the API call to avoid rate limits
    textNode.dataset.spicetifyProcessed = 'pending';
    queueTranslation(originalTitle, (meta) => {
      applyReplacement(textNode, meta, originalTitle);
    });
  }

  function scanAndProcessUI() {
    // Use the confirmed-working role="row" selector
    const rows = document.querySelectorAll('div[role="row"], .main-trackList-trackListRow');
    rows.forEach(row => {
      processTrackRow(row);
    });
  }

  function resetUI() {
    try {
      isUpdatingUI = true;
      const elements = document.querySelectorAll('[data-spicetify-original]');
      elements.forEach(el => {
        if (el.dataset.spicetifyOriginal) {
          el.textContent = el.dataset.spicetifyOriginal;
        }
        delete el.dataset.spicetifyProcessed;
      });
    } finally {
      isUpdatingUI = false;
    }
    scanAndProcessUI();
  }

  // ----------------------------------------------------
  // PART 3: TOPBAR CONFIG CONTROL BUTTON
  // ----------------------------------------------------
  function setMode(newMode) {
    currentMode = newMode;
    localStorage.setItem(SETTING_KEY, newMode);

    // Update topbar tooltip/text if button exists
    if (topbarButton) {
      topbarButton.label = `Title Mode: ${newMode.toUpperCase()}`;
    }

    // Trigger full visual reset and re-apply setting
    resetUI();
  }

  let topbarButton = null;

  // Register settings controls on the Spotify topbar (extremely stable)
  if (Spicetify.Topbar && Spicetify.Topbar.Button) {
    try {
      topbarButton = new Spicetify.Topbar.Button(
        `Title Mode: ${currentMode.toUpperCase()}`,
        GLOBE_SVG,
        () => {
          let nextMode = 'romanize';
          if (currentMode === 'romanize') nextMode = 'translate';
          else if (currentMode === 'translate') nextMode = 'off';

          setMode(nextMode);
          Spicetify.showNotification(`Title Mode set to: ${nextMode.toUpperCase()}`);
        }
      );
    } catch (error) {
      console.error("Song Title Romanizer: Failed to register Topbar button:", error);
    }
  }

  // ----------------------------------------------------
  // INITIALIZATION AND EVENT LISTENERS
  // ----------------------------------------------------

  // Hook player changes
  Spicetify.Player.addEventListener("songchange", updateNowPlaying);
  updateNowPlaying();

  // Watch entire viewport for dynamically loaded content/scrolling
  const appContainer = document.querySelector('#main') || document.body;
  const uiObserver = new MutationObserver(() => {
    if (isUpdatingUI) return;

    // Debounce processing to preserve scrolling performance
    if (window.romanizeTimeout) clearTimeout(window.romanizeTimeout);
    window.romanizeTimeout = setTimeout(scanAndProcessUI, 150);
  });

  uiObserver.observe(appContainer, {
    childList: true,
    subtree: true
  });

  // Run on initial load
  scanAndProcessUI();
})();
