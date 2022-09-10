import { ViewUpdate, ViewPlugin, DecorationSet, EditorView, Decoration } from '@codemirror/view'
import { configField } from '../util/configuration'

const scoreDecorations = [
  Decoration.mark({ class: 'cm-readability-0' }),
  Decoration.mark({ class: 'cm-readability-1' }),
  Decoration.mark({ class: 'cm-readability-2' }),
  Decoration.mark({ class: 'cm-readability-3' }),
  Decoration.mark({ class: 'cm-readability-4' }),
  Decoration.mark({ class: 'cm-readability-5' }),
  Decoration.mark({ class: 'cm-readability-6' }),
  Decoration.mark({ class: 'cm-readability-7' }),
  Decoration.mark({ class: 'cm-readability-8' }),
  Decoration.mark({ class: 'cm-readability-9' }),
  Decoration.mark({ class: 'cm-readability-10' })
]

/**
 * A WORD ON COMPLEX AND DIFFICULT WORDS
 *
 * Some of the following algorithms need the amount of difficult or complex
 * words that appear inside a given sentence. These are mostly not computed but
 * given in form of a dictionary. So the "correct" application of these
 * algorithms would be to either look up all words in a sentence in a provided
 * dictionary, or to calculate the amount of syllables of each word. "Difficult"
 * words are mainly calculated with dictionaries, while "complex" words are
 * mostly defined by the amount of syllables. Another difficulty with many of
 * the algorithms is that they have been developed with the English language in
 * mind. Thereby, other languages face huge problems when it comes to
 * appropriate readability scores. To alleviate these problems and to make sure
 * the algorithm is both fast and language-agnostic, both complex and difficult
 * words are re-defined for the purposes of this CodeMirror mode as following:
 *
 * Complex or difficult words are words whose number of characters exceeds the
 * threshold of two times the standard deviation of the average word length
 * inside a given sentence. This means that the probability of difficult words
 * is defined to be 5 percent of the language (as two times the standard
 * deviation around the average value includes 95 % of all possible values).
 *
 * This is a statistically sound measure, because this way we set the bar of the
 * presumed skill of reading to be higher than average (as 5 percent difficult
 * words will mainly apply to academics, journalists, and generally people that
 * work a lot with text). Additionally, according to Coleman and Liau, who
 * devised the Coleman-Liau readability algorithm: "There is no need to estimate
 * syllables since word length in letters is a better predictor of readability
 * than word length in syllables." (1975, see
 * https://psycnet.apa.org/fulltext/1975-22007-001.pdf)
 */

/**
 * Performs a z-transformation of a given value from the source range to the
 * target range. NOTE: If source and target ranges are extraordinarily far away
 * in terms of range size, the result will suffer some precision. The effects
 * are visible at the magnitude of ten (so if the range sizes are about ten
 * times apart from each other).
 *
 * @param {number} val       The input value to be transformed.
 * @param {number} sourceMin The lower limit of the source scale.
 * @param {number} sourceMax The upper limit of the source scale.
 * @param {number} targetMin The lower limit of the target scale, default 0.
 * @param {number} targetMax The upper limit of the target scale, default 10.
 */
function zTransform (val: number, sourceMin: number, sourceMax: number, targetMin: number = 0, targetMax: number = 10): number {
  // This algorithm "shrinks" val to the scale 0:1 before extrapolating
  // to the target scale.

  // Calculate the ranges
  let sourceRange = sourceMax - sourceMin
  let targetRange = targetMax - targetMin

  // Calculate the percentage (i.e. value as expressed in range 0:1).
  // We round to strengthen the precision with natural numbers.
  let percentage = Math.round((val - sourceMin) / sourceRange * 100) / 100

  // All we need is now a simple cross-multiplication
  let targetVal = targetMin + percentage * targetRange
  return Math.round(targetVal) // Round again for natural numbers
}

/**
 * Readability algorithms, currently supported: dale-chall, gunning-frog,
 * coleman-liau and automated readability.
 * @type {Object}
 */
const readabilityAlgorithms: { [key: string]: (words: string[]) => number } = {
  'dale-chall': (words: string[]) => {
    // Gunning-Fog produces grades between 0 and 11 (tested with Bartleby full text).
    let score = 0
    let difficultWords = 0
    let mean = 0
    let std = 0 // Standard deviation of word length
    let wordThreshold = 0 // Will be mean + 1 * std

    // To do so first calculate the mean of the word lengths.
    mean = words.join('').length / words.length // See what I did here? 8)

    // Now the sum of squares (SoS)
    let sos = 0
    for (let word of words) sos += Math.pow(word.length - mean, 2)

    // Then standard deviation
    std = Math.sqrt(sos / (words.length - 1))
    wordThreshold = mean + 2 * std // Tadaaa

    for (let word of words) if (word.length > wordThreshold) difficultWords++

    const totalSize = words.length
    let percentageOfDifficultWords = difficultWords / totalSize

    score = 0.1579 * percentageOfDifficultWords * 100 + (0.0496 * totalSize)

    if (percentageOfDifficultWords > 0.05) score += 3.6365

    score = Math.floor(score)
    if (score < 0) score = 0
    if (score > 9) score = 10

    // Dale-Chall returns values between 0 and 10
    return zTransform(score, 0, 10)
  },
  'gunning-fog': (words: string[]) => {
    // Gunning-Fog produces grades between 0 and 20 (tested with Bartleby full text).
    let score = 0
    let difficultWords = 0

    // Again we need the amount of "difficult words",
    // so we'll re-apply our definition from Dale-Chall.
    let mean = words.join('').length / words.length

    // Now the sum of squares (SoS)
    let sos = 0
    for (let word of words) sos += Math.pow(word.length - mean, 2)

    // Then standard deviation
    let std = Math.sqrt(sos / (words.length - 1))
    let wordThreshold = mean + 2 * std // Tadaaa
    for (let word of words) if (word.length > wordThreshold) difficultWords++

    score = 0.4 * (words.length + 100 * difficultWords / words.length)
    if (score < 0) score = 0
    if (score > 20) score = 20

    // Gunning-Fog returns values between 6 and 17
    return zTransform(score, 0, 20)
  },
  'coleman-liau': (words: string[]) => {
    // Coleman-Liau produces grades between 0 and 43 (tested with Bartleby full text).
    let score = 0
    let mean = words.join('').length / words.length
    // Formula taken from https://en.wikipedia.org/wiki/Coleman%E2%80%93Liau_index
    score = 5.89 * mean - 0.3 / (100 * words.length) - 15.8
    if (score < 0) score = 0
    if (score > 30) score = 30

    return zTransform(score, 0, 30)
  },
  'automated-readability': (words: string[]) => {
    // The ARI produces grades between -7 and 71 (tested with Bartleby full text).
    let score = 0
    let mean = words.join('').length / words.length

    // Formula see Wikipedia: https://en.wikipedia.org/wiki/Automated_readability_index
    score = 4.71 * mean + 0.5 * words.length - 21.43
    score = Math.ceil(score) // Scores must always be rounded up

    if (score < 0) score = 0
    if (score > 50) score = 50

    return zTransform(score, 0, 50)
  }
}

function extractScores (text: string, offset: number, algorithm: string): any[] {
  // Split at potential sentence-endings
  let lastSeenIndex = 0
  return text
    // Remove block-level markup that shouldn't get readability'd
    .replace(/^`{1,3}.+?^`{1,3}$/gsm, '')
    .replace(/^-{3}.+?^(?:-{3}|\.{3})$/gsm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-+*]\s\[[x\s]\]\s/gmi, '')
    // Now split into sentences at LF and delimiters
    .split(/[.:!?]\s+|\n/ig)
    // Immediately retrieve the ranges in `text` for them
    .map(sentence => {
      // lastSeenIndex is important because sentences can appear multiple times
      // in text. Without it, we would have multiple sentences with the same
      // range, making the plugin crash.
      const idx = text.indexOf(sentence, lastSeenIndex)
      lastSeenIndex = idx + sentence.length

      let rangeEnd = lastSeenIndex
      if ('.:!?'.includes(text.charAt(rangeEnd))) {
        rangeEnd++
      }

      return {
        from: offset + idx,
        to: offset + rangeEnd,
        sentence: sentence
          // Remove inline Markdown
          .replace(/[*_]{1,3}[^_*]+[_*]{1,3}/g, '')
          .replace(/\[\[[^\]]+\[\[/g, '')
          .replace(/!\[[^\]]+\]\([^)]+\)/g, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/\[[^[\]]*@[^[\]]+\]/, '')
      }
    })
    // Remove too short sentences
    .filter(v => v.sentence.length >= 2)
    // Tokenize & score
    .map(v => {
      const words = v.sentence.trim().split(' ').filter(word => word !== '')
      const score = readabilityAlgorithms[algorithm](words)
      return { from: v.from, to: v.to, score }
    })
    // Finally, map to decorations
    .map(v => scoreDecorations[v.score].range(v.from, v.to))
}

function readabilityScores (view: EditorView): DecorationSet {
  const { readabilityAlgorithm, readabilityMode } = view.state.field(configField)
  if (!readabilityMode) {
    return Decoration.none
  }

  let decos: any[] = []
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to)
    decos = decos.concat(extractScores(text, from, readabilityAlgorithm))
  }

  return Decoration.set(decos)
}

export const readabilityMode = ViewPlugin.fromClass(class {
  decorations: DecorationSet

  constructor (view: EditorView) {
    this.decorations = Decoration.none
  }

  update (update: ViewUpdate): void {
    this.decorations = readabilityScores(update.view)
  }
}, {
  decorations: v => v.decorations
})
