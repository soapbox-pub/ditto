import { describe, it, expect } from 'vitest';

import { formatQuestionsAnswer, parseAskQuestionsData } from './pendingInput';

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
