/**
 * main.js — LLM-style autoregressive typing animation
 *
 * On first page load (per session), reveals .page-content token by token,
 * mimicking the cadence of an LLM generating text. Navigation, page headers,
 * and all non-.page-content DOM are unaffected.
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  var SESSION_KEY_PREFIX = 'llm-anim-seen:';
  var BASE_DELAY_MS      = 18;   // fast base token delay
  var PUNCT_PAUSE_MS     = 120;  // pause after sentence-ending punctuation
  var COMMA_PAUSE_MS     = 60;   // pause after comma / semicolon
  var HEADING_PAUSE_MS   = 160;  // pause before a heading's first token
  var PARA_PAUSE_MS      = 80;   // pause at paragraph boundary
  var TARGET_MAX_MS      = 3200; // target ceiling for total animation time
  var TARGET_MIN_MS      = 800;  // floor — short pages shouldn't be instant

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Return the session-storage key for this page. */
  function pageKey() {
    return SESSION_KEY_PREFIX + location.pathname;
  }

  /**
   * Split a text string into word-level tokens, preserving surrounding
   * whitespace so the original string can be reconstructed exactly.
   */
  function tokenize(text) {
    return text.split(/(\s+)/).filter(function (t) { return t.length > 0; });
  }

  /** True if this text node lives inside a heading element. */
  function isInHeading(node) {
    var el = node.parentElement;
    while (el) {
      if (/^H[1-6]$/.test(el.tagName || '')) return true;
      if (el.classList && el.classList.contains('page-content')) break;
      el = el.parentElement;
    }
    return false;
  }

  /**
   * Walk the DOM subtree of `root` and return every Text node whose
   * parent is not a pure-whitespace structural container.
   */
  function collectTextNodes(root) {
    var nodes = [];
    var walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          // Drop whitespace-only nodes inside block containers — they carry no
          // visible content and would generate empty/spurious tokens.
          if (/^\s+$/.test(node.nodeValue)) {
            var parent = node.parentElement;
            if (parent && /^(UL|OL|LI|SECTION|ARTICLE|DIV|PRE|BLOCKQUOTE|TABLE|THEAD|TBODY|TR|TD|TH)$/.test(parent.tagName || '')) {
              return NodeFilter.FILTER_REJECT;
            }
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    var n;
    while ((n = walker.nextNode())) {
      nodes.push(n);
    }
    return nodes;
  }

  // ---------------------------------------------------------------------------
  // Cursor management
  // ---------------------------------------------------------------------------

  var cursorEl = null;

  function createCursor() {
    cursorEl = document.createElement('span');
    cursorEl.className = 'gen-cursor';
    cursorEl.setAttribute('aria-hidden', 'true');
    cursorEl.textContent = '\u258c'; // ▌ LEFT HALF BLOCK
    return cursorEl;
  }

  /** Move the cursor to appear immediately after `textNode`. */
  function placeCursorAfter(textNode) {
    if (!cursorEl) return;
    var parent = textNode.parentNode;
    if (!parent) return;
    var next = textNode.nextSibling;
    if (next === cursorEl) return; // already positioned correctly
    if (next) {
      parent.insertBefore(cursorEl, next);
    } else {
      parent.appendChild(cursorEl);
    }
  }

  function removeCursor() {
    if (cursorEl && cursorEl.parentNode) {
      cursorEl.parentNode.removeChild(cursorEl);
    }
    cursorEl = null;
  }

  // ---------------------------------------------------------------------------
  // Core animation
  // ---------------------------------------------------------------------------

  function runAnimation(contentEl) {
    var textNodes = collectTextNodes(contentEl);
    if (!textNodes.length) return;

    // Build per-node groups: original text + token array + heading flag
    var groups = textNodes.map(function (node) {
      return {
        node:       node,
        original:   node.nodeValue,
        tokens:     tokenize(node.nodeValue),
        inHeading:  isInHeading(node)
      };
    });

    // Count total tokens to calibrate speed against target duration
    var totalTokens = groups.reduce(function (acc, g) {
      return acc + g.tokens.length;
    }, 0);

    var estimatedRawMs = totalTokens * BASE_DELAY_MS;
    var speedMult = 1;
    if (estimatedRawMs > TARGET_MAX_MS) {
      speedMult = estimatedRawMs / TARGET_MAX_MS; // scale up speed (smaller delays)
    } else if (estimatedRawMs < TARGET_MIN_MS && totalTokens > 3) {
      speedMult = estimatedRawMs / TARGET_MIN_MS; // scale down speed (longer delays)
    }

    function scaledDelay(ms) {
      return Math.max(8, Math.round(ms / speedMult));
    }

    // Blank all text nodes in one synchronous pass (single layout invalidation)
    groups.forEach(function (g) { g.node.nodeValue = ''; });

    createCursor();
    // Start cursor at very beginning of content
    placeCursorAfter(groups[0].node);

    // Flat index arrays — one entry per token, in document order
    var queueGi = [];
    var queueTi = [];
    groups.forEach(function (g, gi) {
      g.tokens.forEach(function (_, ti) {
        queueGi.push(gi);
        queueTi.push(ti);
      });
    });

    var revealed = groups.map(function () { return ''; });
    var queueLen = queueGi.length;
    var pos      = 0;
    var active   = true;

    function finish() {
      active = false;
      removeCursor();
    }

    function revealAll() {
      active = false;
      groups.forEach(function (g, i) { g.node.nodeValue = g.original; });
      removeCursor();
    }

    // Skip on click or scroll
    function onSkip() {
      if (!active) return;
      revealAll();
    }

    document.addEventListener('click',  onSkip, { passive: true });
    document.addEventListener('scroll', onSkip, { passive: true });

    function revealNext() {
      if (!active) return;

      if (pos >= queueLen) {
        finish();
        document.removeEventListener('click',  onSkip);
        document.removeEventListener('scroll', onSkip);
        return;
      }

      var gi    = queueGi[pos];
      var ti    = queueTi[pos];
      var group = groups[gi];
      var token = group.tokens[ti];

      // Append this token to the running revealed string for this node
      revealed[gi] += token;
      group.node.nodeValue = revealed[gi];

      // Keep cursor right after the currently active text node
      placeCursorAfter(group.node);

      pos++;

      // --- Determine delay before next token ---
      var trimmed = token.trim();
      var delay   = scaledDelay(BASE_DELAY_MS);

      if (trimmed.length === 0) {
        // Whitespace-only token: move fast
        delay = scaledDelay(6);
      } else if (pos < queueLen) {
        var nextGi    = queueGi[pos];
        var nextTi    = queueTi[pos];
        var nextGroup = groups[nextGi];

        if (nextGi !== gi && nextTi === 0) {
          // Crossing into a new text node
          if (nextGroup.inHeading) {
            delay = scaledDelay(HEADING_PAUSE_MS);
          } else {
            delay = scaledDelay(PARA_PAUSE_MS);
          }
        } else if (/[.!?]$/.test(trimmed)) {
          delay = scaledDelay(PUNCT_PAUSE_MS);
        } else if (/[,;:]$/.test(trimmed)) {
          delay = scaledDelay(COMMA_PAUSE_MS);
        }
      }

      setTimeout(function () {
        requestAnimationFrame(revealNext);
      }, delay);
    }

    // Kick off on next animation frame so the blanked state paints first
    requestAnimationFrame(revealNext);
  }

  // ---------------------------------------------------------------------------
  // Entry point
  // ---------------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', function () {
    // Honor reduced-motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var contentEl = document.querySelector('.page-content');
    if (!contentEl) return;

    runAnimation(contentEl);
  });

}());
