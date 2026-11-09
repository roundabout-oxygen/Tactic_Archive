// Tactical Archive PC: romaji search for kana names (PC only).
// Lets "kenu", or IME text in the middle of typing such as "けｎ", match "ケヌメドス".
// Both the name and the search term are converted to one canonical romaji so that
// typing variants (si/shi, tu/tsu, hu/fu, sya/sha, nn/n ...) match each other.
(function (root) {
    'use strict';

    const BASE = {
        'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
        'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
        'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
        'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
        'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
        'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
        'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
        'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
        'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
        'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
        'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
        'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
        'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
        'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
        'わ': 'wa', 'ゐ': 'i', 'ゑ': 'e', 'を': 'o', 'ん': 'n',
        'ゔ': 'vu', 'ゕ': 'ka', 'ゖ': 'ke', 'ゎ': 'wa'
    };
    const SMALL_Y = { 'ゃ': 'a', 'ゅ': 'u', 'ょ': 'o' };
    const SMALL_V = { 'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o' };
    // Characters that are dropped (brackets, dots, spaces) so "ミチル（ドレス）" reads as "michirudoresu"
    const DROP = /[\s()（）［］\[\]「」『』・･.,，、。_＿~～〜!！?？]/g;

    function toHira(str) {
        return str.normalize('NFKC').toLowerCase()
            .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
            .replace(/ヷ/g, 'ゔぁ').replace(/ヺ/g, 'ゔぉ');
    }

    // Kana (+ ASCII letters / digits / ー) to romaji.
    // Search terms (isName = false): returns null when anything else (kanji etc.) is present.
    // Names (isName = true): kanji and other characters become a '|' break, so ハスミ（水着） still matches "hasumi".
    function kanaToRomaji(str, isName) {
        if (!str) return null;
        const s = toHira(str).replace(DROP, '');
        if (!s) return null;
        let out = '';
        let sokuon = false;
        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            let r = null;
            if (BASE[c] != null) {
                r = BASE[c];
                const n = s[i + 1];
                if (n && SMALL_Y[n] && /i$/.test(r) && r.length > 1) {
                    const stem = r.slice(0, -1);
                    r = (/(sh|ch|j)$/.test(stem) ? stem : stem + 'y') + SMALL_Y[n];
                    i++;
                } else if (n && SMALL_V[n]) {
                    const stem = r.replace(/[aiueo]$/, '');
                    r = (stem === '' ? 'w' : stem) + SMALL_V[n];
                    i++;
                }
            } else if (SMALL_Y[c]) {
                r = 'y' + SMALL_Y[c];
            } else if (SMALL_V[c]) {
                r = SMALL_V[c];
            } else if (c === 'っ') {
                sokuon = true;
                continue;
            } else if (c === 'ー' || c === '-' || c === '－') {
                r = '-';
            } else if (/[a-z0-9']/.test(c)) {
                r = c;
            } else {
                if (!isName) return null; // kanji or other scripts in the search term: no romaji search
                r = '|';
            }
            if (sokuon) {
                if (/^ch/.test(r)) r = 'c' + r;
                else if (/^[bcdfghjkmpqrstvwxyz]/.test(r)) r = r[0] + r;
                sokuon = false;
            }
            out += r;
        }
        if (isName && !/[a-z]/.test(out)) return null;
        return canon(out);
    }

    // Fold typing variants into one spelling (applied to names and search terms alike)
    function canon(r) {
        return r
            .replace(/'/g, '')
            .replace(/nn/g, 'n')
            .replace(/tch/g, 'cch')
            .replace(/sy([aueo])/g, 'sh$1')
            .replace(/(?:ty|cy)([aueo])/g, 'ch$1')
            .replace(/(?:zy|jy)([aueo])/g, 'j$1')
            .replace(/([td])h([iu])/g, '$1$2')
            .replace(/si/g, 'shi')
            .replace(/ti/g, 'chi')
            .replace(/tu/g, 'tsu')
            .replace(/(^|[^sc])hu/g, '$1fu')
            .replace(/zi|di/g, 'ji')
            .replace(/du/g, 'zu');
    }

    // Name side: the kana parts of the name (null when the name has no kana)
    function nameRomaji(name) {
        return kanaToRomaji(name, true);
    }
    // Search side: needs at least one latin letter (pure kana is already handled by the normal search)
    function termRomaji(term) {
        if (!term) return null;
        const n = term.normalize('NFKC').toLowerCase();
        if (!/[a-z]/.test(n)) return null;
        return kanaToRomaji(n, false);
    }

    const api = { nameRomaji, termRomaji, kanaToRomaji, canon };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.taRomaji = api;
})(typeof window !== 'undefined' ? window : this);
