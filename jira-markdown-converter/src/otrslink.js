/**
 * JiraOtrsLink - zerlegt einen OTRS-Verweis (Markdown-Link, HTML-Anker oder
 * Rohtext mit eingebetteter URL) in Ticketnummer, Titel und URL.
 *
 * DOM-frei, damit der Node-Runner das Modul direkt laden kann - dieselbe
 * Regel wie bei converter.js.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.JiraOtrsLink = api;
  }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';

  var MARKDOWN_LINK_RE = /\[([^\]]+)\]\(\s*(https?:\/\/[^\s)]+)\s*\)/;
  var HTML_ANCHOR_RE = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i;
  var RAW_URL_RE = /https?:\/\/\S+/;

  var TICKET_IN_TITLE_RE = /Ticket#\s*(\d{6,})/i;
  var TICKET_IN_URL_RE = /\bTicketNumber=(\d{6,})/i;
  var LONG_DIGIT_RUN_RE = /\d{12,}/g;

  var TRAILING_PUNCTUATION_RE = /[>).,]+$/;
  var VALID_SCHEME_RE = /^https?:\/\//i;

  var MAX_TITLE_LENGTH = 255;

  var ENTITIES = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': '\'',
    '&nbsp;': ' '
  };
  var ENTITY_RE = /&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g;

  /** Entfernt Tags aus einem HTML-Fragment - keine innerHTML-Auswertung. */
  function stripTags(html) {
    return String(html).replace(/<[^>]*>/g, '');
  }

  function decodeEntities(text) {
    return String(text).replace(ENTITY_RE, function (match) {
      return ENTITIES[match];
    });
  }

  /**
   * Liefert { title, url } aus der ersten passenden Eingabeform, sonst null.
   * Reihenfolge: Markdown-Link, HTML-Anker, Rohtext mit eingebetteter URL.
   */
  function extractCandidate(input) {
    var markdownMatch = MARKDOWN_LINK_RE.exec(input);
    if (markdownMatch) {
      return { title: markdownMatch[1], url: markdownMatch[2] };
    }

    var anchorMatch = HTML_ANCHOR_RE.exec(input);
    if (anchorMatch) {
      return { title: decodeEntities(stripTags(anchorMatch[2])), url: anchorMatch[1] };
    }

    var urlMatch = RAW_URL_RE.exec(input);
    if (urlMatch) {
      var rest = input.slice(0, urlMatch.index) + input.slice(urlMatch.index + urlMatch[0].length);
      return { title: rest, url: urlMatch[0] };
    }

    return null;
  }

  /**
   * Erste Ticketnummer, die gefunden wird: Ticket# im Titel, sonst
   * TicketNumber= in der URL, sonst die laengste Ziffernfolge mit
   * mindestens 12 Stellen im Titel. Ohne Treffer: null.
   */
  function findTicketNumber(title, url) {
    var titleMatch = TICKET_IN_TITLE_RE.exec(title);
    if (titleMatch) return titleMatch[1];

    var urlMatch = TICKET_IN_URL_RE.exec(url);
    if (urlMatch) return urlMatch[1];

    var digitRuns = title.match(LONG_DIGIT_RUN_RE);
    if (digitRuns) {
      var longest = digitRuns[0];
      for (var i = 1; i < digitRuns.length; i++) {
        if (digitRuns[i].length > longest.length) longest = digitRuns[i];
      }
      return longest;
    }

    return null;
  }

  /** Schneidet haengende Satzzeichen ab; nur http/https gelten als gueltig. */
  function cleanUrl(url) {
    return String(url || '').trim().replace(TRAILING_PUNCTUATION_RE, '');
  }

  function isValidUrl(url) {
    return VALID_SCHEME_RE.test(url);
  }

  /** trimmen, Mehrfach-Leerzeichen zusammenziehen, auf 255 Zeichen kappen. */
  function normalizeTitle(title) {
    return String(title || '').trim().replace(/\s+/g, ' ').slice(0, MAX_TITLE_LENGTH);
  }

  /**
   * Zerlegt einen OTRS-Verweis. Wirft nie - der Aufrufer zeigt error im
   * Dialog an.
   */
  function parse(input) {
    var text = '';
    if (input !== undefined && input !== null) {
      // String(input) kann werfen (kaputtes toString/Symbol.toPrimitive) -
      // eine solche Eingabe gilt dann wie eine leere.
      try {
        text = String(input);
      } catch (error) {
        text = '';
      }
    }
    if (!text.trim()) {
      return { ok: false, error: 'Eingabe ist leer.' };
    }

    var candidate = extractCandidate(text);
    if (!candidate) {
      return { ok: false, error: 'Keine gueltige URL gefunden.' };
    }

    var ticketNumber = findTicketNumber(candidate.title, candidate.url);
    if (!ticketNumber) {
      return { ok: false, error: 'Keine Ticketnummer gefunden.' };
    }

    var url = cleanUrl(candidate.url);
    if (!isValidUrl(url)) {
      return { ok: false, error: 'Keine gueltige URL gefunden.' };
    }

    var title = normalizeTitle(candidate.title);

    return {
      ok: true,
      ticketNumber: ticketNumber,
      title: title,
      url: url,
      label: ticketNumber,
      reference: title,
      linkText: title
    };
  }

  return {
    parse: parse
  };
});
