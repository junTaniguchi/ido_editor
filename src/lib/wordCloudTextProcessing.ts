const japaneseParticleSet = new Set([
  'は',
  'が',
  'を',
  'に',
  'で',
  'と',
  'も',
  'へ',
  'や',
  'か',
  'の',
  'ね',
  'よ',
  'な',
  'さ',
  'ので',
  'から',
  'まで',
  'より',
  'だけ',
  'ほど',
  'くらい',
  'など',
  'って',
  'だ',
  'です',
  'ます',
  'たい',
  'なら',
  'けど',
  'でも',
  'しか',
  'ながら',
  'つつ',
  'そして',
  'しかし',
  'また',
  'または',
  'さらに',
  'もし',
  'けれども',
  'けども',
  'しかしながら',
]);

const englishStopWords = new Set([
  'a',
  'an',
  'the',
  'and',
  'but',
  'or',
  'nor',
  'for',
  'yet',
  'so',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'with',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'do',
  'does',
  'did',
  'doing',
  'have',
  'has',
  'had',
  'having',
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  'me',
  'him',
  'her',
  'them',
  'my',
  'your',
  'his',
  'their',
  'our',
  'this',
  'that',
  'these',
  'those',
  'there',
  'here',
  'who',
  'whom',
  'which',
  'because',
  'about',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'from',
  'up',
  'down',
  'out',
  'off',
  'over',
  'under',
  'again',
  'further',
  'then',
  'once',
  'just',
  'than',
  'too',
  'very',
  'can',
  'will',
  'should',
  'could',
  'would',
  'might',
  'must',
  'also',
  'ever',
  'never',
]);

const englishVerbDictionary = new Set([
  'make',
  'do',
  'create',
  'build',
  'see',
  'use',
  'show',
  'go',
  'come',
  'take',
  'get',
  'feel',
  'think',
  'say',
  'talk',
  'discuss',
  'share',
  'update',
  'review',
  'check',
  'learn',
  'improve',
  'understand',
  'plan',
  'help',
  'support',
  'try',
  'ask',
  'need',
  'want',
  'analyze',
  'report',
  'design',
  'measure',
  'collect',
  'provide',
  'start',
  'finish',
  'deliver',
  'deploy',
  'release',
  'fix',
  'resolve',
  'explain',
  'summarize',
  'prepare',
  'organize',
  'present',
  'evaluate',
  'research',
]);

const japaneseVerbEndings = [
  'する',
  'した',
  'して',
  'します',
  'しない',
  'しよう',
  'しなかった',
  'できる',
  'できた',
  'できない',
  'なる',
  'なった',
  'なって',
  'なります',
  'いた',
  'いて',
  'いている',
  'ている',
  'ていた',
  'ておく',
  'よう',
  'れる',
  'られる',
  'られた',
  'れば',
  'った',
  'って',
  'いた',
  'いて',
  'った',
  'みる',
  'みた',
  'みて',
  'える',
  'った',
  'う',
  'く',
  'ぐ',
  'す',
  'つ',
  'ぬ',
  'む',
  'ぶ',
  'る',
  'きた',
  'くる',
  'こない',
  'こよう',
  'います',
];

const japaneseStopwordPattern = /^(?:[ぁ-ゖゝゞー]{1,2})$/u;

const urlPattern = /https?:\/\/\S+/gi;

const trimPunctuation = (value: string): string => value.replace(/[\p{P}\p{S}]+/gu, ' ').trim();

const normalizeToken = (token: string): string => token.replace(/[\p{C}]+/gu, '').replace(/[\s]+/gu, '');

const hasJapaneseCharacters = (value: string): boolean => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
const hasLatinCharacters = (value: string): boolean => /[A-Za-z]/.test(value);

const isJapaneseVerb = (token: string): boolean => japaneseVerbEndings.some(ending => token.endsWith(ending));

const isJapaneseNoun = (token: string): boolean => {
  if (japaneseParticleSet.has(token)) {
    return false;
  }

  if (/^[\p{Script=Hiragana}ー]+$/u.test(token)) {
    if (japaneseStopwordPattern.test(token)) {
      return false;
    }
    return !isJapaneseVerb(token);
  }

  if (/[\p{Script=Han}\p{Script=Katakana}]/u.test(token)) {
    return true;
  }

  return token.length >= 2 && !isJapaneseVerb(token);
};

const isEnglishVerb = (token: string): boolean => {
  if (englishVerbDictionary.has(token)) {
    return true;
  }

  if (/^(?:re|pre|over|under|in|out|up|down)[a-z]{3,}$/.test(token)) {
    return true;
  }

  return /(ed|ing|ize|ise|fy|ate|en|ify|ves|s)$/i.test(token) && token.length > 3;
};

const isEnglishNoun = (token: string): boolean => {
  if (englishStopWords.has(token)) {
    return false;
  }

  if (isEnglishVerb(token)) {
    return true;
  }

  if (/(tion|sion|ment|ness|ity|ship|ence|ance|ism|ist|logy|er|or|al|ure|age)$/i.test(token)) {
    return true;
  }

  if (token.length <= 2) {
    return false;
  }

  return /[a-z]/i.test(token);
};

const segmentText = (text: string, locales: string[]): string[] => {
  const segments: string[] = [];
  const hasSegmenter = typeof Intl !== 'undefined' && typeof (Intl as any).Segmenter === 'function';

  if (hasSegmenter) {
    locales.forEach(locale => {
      try {
        const segmenter = new (Intl as any).Segmenter(locale, { granularity: 'word' });
        for (const item of segmenter.segment(text)) {
          if ((item as { isWordLike?: boolean }).isWordLike) {
            segments.push((item as { segment: string }).segment);
          }
        }
      } catch {
        // Ignore segmentation errors and fallback later.
      }
    });
  }

  if (segments.length === 0) {
    const fallback = text
      .split(/[\s、。．。,，;；:：!！?？"'「」『』（）()\[\]{}<>]+/u)
      .filter(Boolean);
    segments.push(...fallback);
  }

  return segments;
};

export const extractWordsFromText = (text: string): string[] => {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const sanitized = trimPunctuation(text.replace(urlPattern, ' '));
  const segments = segmentText(sanitized, hasJapaneseCharacters(text) ? ['ja', 'en'] : ['en']);

  const results: string[] = [];

  segments.forEach(rawSegment => {
    const token = normalizeToken(rawSegment);
    if (!token) {
      return;
    }

    if (/^[0-9]+$/.test(token)) {
      return;
    }

    if (hasJapaneseCharacters(token)) {
      if (japaneseParticleSet.has(token)) {
        return;
      }
      if (isJapaneseVerb(token)) {
        results.push(token);
        return;
      }
      if (isJapaneseNoun(token)) {
        results.push(token);
      }
      return;
    }

    const lower = token.toLowerCase();
    if (hasLatinCharacters(lower)) {
      if (englishStopWords.has(lower)) {
        return;
      }

      if (isEnglishVerb(lower) || isEnglishNoun(lower)) {
        results.push(lower);
      }
    }
  });

  return results;
};
