import { describe, it, expect } from 'vitest';

import { formatQuestionsAnswer, parseAskQuestionsData, parseQuestionsAnswerText } from './pendingInput';

describe('parseAskQuestionsData', () => {
  it('parses questions with suggestions', () => {
    const data = {
      questions: [
        { text: 'What should the tile show?', suggestions: ['Clock', 'Weather', 'Feed'] },
      ],
    };

    expect(parseAskQuestionsData(data)).toEqual([
      { text: 'What should the tile show?', suggestions: ['Clock', 'Weather', 'Feed'] },
    ]);
  });

  it('parses questions without suggestions', () => {
    const data = { questions: [{ text: 'What color should it be?' }] };

    expect(parseAskQuestionsData(data)).toEqual([{ text: 'What color should it be?' }]);
  });

  it('parses multiple questions in order', () => {
    const data = {
      questions: [
        { text: 'First?' },
        { text: 'Second?', suggestions: ['a', 'b'] },
      ],
    };

    expect(parseAskQuestionsData(data)).toEqual([
      { text: 'First?' },
      { text: 'Second?', suggestions: ['a', 'b'] },
    ]);
  });

  it('returns null for missing or empty questions', () => {
    expect(parseAskQuestionsData(null)).toBeNull();
    expect(parseAskQuestionsData(undefined)).toBeNull();
    expect(parseAskQuestionsData('not an object')).toBeNull();
    expect(parseAskQuestionsData([{ text: 'array?' }])).toBeNull();
    expect(parseAskQuestionsData({})).toBeNull();
    expect(parseAskQuestionsData({ questions: [] })).toBeNull();
  });

  it('returns null when a question is missing its text', () => {
    expect(parseAskQuestionsData({ questions: [{ suggestions: ['a'] }] })).toBeNull();
    expect(parseAskQuestionsData({ questions: [{ text: '' }] })).toBeNull();
    expect(parseAskQuestionsData({ questions: [{ text: '   ' }] })).toBeNull();
    expect(parseAskQuestionsData({ questions: [{ text: 42 }] })).toBeNull();
  });

  it('returns null when a question has malformed suggestions', () => {
    expect(parseAskQuestionsData({ questions: [{ text: 'Q', suggestions: 'not an array' }] })).toBeNull();
    expect(parseAskQuestionsData({ questions: [{ text: 'Q', suggestions: [1] }] })).toBeNull();
  });
});

describe('formatQuestionsAnswer', () => {
  it('formats one Q/A line pair per question', () => {
    const questions = [
      { text: 'What should the tile show?' },
      { text: 'What color?', suggestions: ['Blue', 'Green'] },
    ];
    const answers = ['A clock', 'Blue'];

    expect(formatQuestionsAnswer(questions, answers)).toBe(
      'Q1: What should the tile show?\nA1: A clock\n\nQ2: What color?\nA2: Blue',
    );
  });

  it('trims each answer', () => {
    const questions = [{ text: 'Q' }];
    expect(formatQuestionsAnswer(questions, ['  padded  '])).toBe('Q1: Q\nA1: padded');
  });

  it('treats a missing answer as empty', () => {
    const questions = [{ text: 'Q1' }, { text: 'Q2' }];
    expect(formatQuestionsAnswer(questions, ['a'])).toBe('Q1: Q1\nA1: a\n\nQ2: Q2\nA2: ');
  });
});

describe('parseQuestionsAnswerText', () => {
  it('parses one answer per question', () => {
    const text = 'Q1: What should the tile show?\nA1: A clock\n\nQ2: What color?\nA2: Blue';
    expect(parseQuestionsAnswerText(text, 2)).toEqual(['A clock', 'Blue']);
  });

  it('round-trips through formatQuestionsAnswer', () => {
    const questions = [{ text: 'Q1' }, { text: 'Q2' }, { text: 'Q3' }];
    const answers = ['first', 'second', 'third'];
    const formatted = formatQuestionsAnswer(questions, answers);
    expect(parseQuestionsAnswerText(formatted, questions.length)).toEqual(answers);
  });

  it('keeps blank lines and multiple paragraphs inside a pasted answer', () => {
    const text = [
      'Q1: Paste the text.',
      'A1: First paragraph.',
      '',
      'Second paragraph, after a blank line.',
      '',
      'Q2: Anything else?',
      'A2: Nope.',
    ].join('\n');

    expect(parseQuestionsAnswerText(text, 2)).toEqual([
      'First paragraph.\n\nSecond paragraph, after a blank line.',
      'Nope.',
    ]);
  });

  it('returns null when the block count does not match', () => {
    const text = 'Q1: One\nA1: a\n\nQ2: Two\nA2: b';
    expect(parseQuestionsAnswerText(text, 1)).toBeNull();
    expect(parseQuestionsAnswerText(text, 3)).toBeNull();
  });

  it('returns null for an empty or non-string result', () => {
    expect(parseQuestionsAnswerText('', 1)).toBeNull();
    expect(parseQuestionsAnswerText('   ', 1)).toBeNull();
  });

  it('returns null when an answer marker is missing', () => {
    expect(parseQuestionsAnswerText('Q1: One\nNo answer marker here', 1)).toBeNull();
  });
});
