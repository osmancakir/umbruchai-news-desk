function contentBlock(text: string, style = 'normal', listItem?: 'bullet') {
  return {
    _type: 'block',
    style,
    ...(listItem ? { listItem, level: 1 } : {}),
    children: [{ _type: 'span', text, marks: [] }],
    markDefs: [],
  }
}

function questions() {
  return Array.from({ length: 4 }, (_, index) => ({
    prompt: `Frage ${index + 1}?`,
    multi: false,
    options: [
      { label: 'Falsch', isCorrect: false },
      { label: 'Richtig', isCorrect: true },
      { label: 'Auch falsch', isCorrect: false },
    ],
  }))
}

function vocabulary() {
  return Array.from({ length: 6 }, (_, index) => ({
    term: `der Begriff ${index + 1}`,
    type: 'Nomen',
    question: `Hier fehlt _____ ${index + 1}.`,
    hint: 'Ein Hinweis auf Deutsch.',
    options: [
      { label: 'Falsch A', isCorrect: false, rationale: 'Falsch: Das passt nicht.' },
      { label: 'Richtig', isCorrect: true, rationale: 'Richtig: Das passt zum Satz.' },
      { label: 'Falsch B', isCorrect: false, rationale: 'Falsch: Das ist unpassend.' },
      { label: 'Falsch C', isCorrect: false, rationale: 'Falsch: Das ist nicht gemeint.' },
    ],
    definition: 'Eine Definition auf Deutsch.',
    example: 'Ein Beispiel auf Deutsch.',
  }))
}

function level() {
  return {
    content: [
      contentBlock('Eine Überschrift', 'h2'),
      contentBlock('Absatz eins.'),
      contentBlock('Absatz zwei.'),
      contentBlock('Absatz drei.'),
      contentBlock('Absatz vier.'),
      contentBlock('Absatz fünf.'),
      contentBlock('Punkt eins.', 'normal', 'bullet'),
      contentBlock('Punkt zwei.', 'normal', 'bullet'),
    ],
    questions: questions(),
    vocabulary: vocabulary(),
  }
}

export function validArticlePayload() {
  return {
    mutations: [
      {
        create: {
          _type: 'article',
          slug: { _type: 'slug', current: 'ein-gueltiger-artikel' },
          date: '2026-08-13T12:00:00.000Z',
          featured: false,
          category: 'politics-economics',
          region: 'europe',
          language: 'german',
          leaning: 'center-left',
          agencyLevel: 'hopeful',
          title: { easy: 'Titel', medium: 'Titel', advanced: 'Titel' },
          subtitle: 'Ein Untertitel',
          summary: { easy: 'Kurz.', medium: 'Etwas länger.', advanced: 'Ausführlich.' },
          commentary: {
            easy: { humanConcern: 'Sorge', opposingView: 'Gegenposition', prompt: 'Impuls' },
            medium: { humanConcern: 'Sorge', opposingView: 'Gegenposition', prompt: 'Impuls' },
            advanced: { humanConcern: 'Sorge', opposingView: 'Gegenposition', prompt: 'Impuls' },
          },
          aiAuthor: [{ name: 'test-model', role: 'author', version: '1' }],
          agents: [{ _type: 'reference', _ref: 'author-id' }],
          sources: [{ name: 'Quelle', href: 'https://example.com', initials: 'QU' }],
          levels: { easy: level(), medium: level(), advanced: level() },
        },
      },
    ],
  }
}
