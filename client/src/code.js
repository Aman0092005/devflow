import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import c from 'highlight.js/lib/languages/c';
import csharp from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';

Object.entries({ javascript, typescript, python, java, cpp, c, csharp, go, rust, sql, bash, xml, css, json, markdown })
  .forEach(([name, lang]) => hljs.registerLanguage(name, lang));

export const LANGUAGES = [
  ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['python', 'Python'], ['java', 'Java'], ['cpp', 'C++'], ['c', 'C'],
  ['csharp', 'C#'], ['go', 'Go'], ['rust', 'Rust'], ['sql', 'SQL'], ['bash', 'Bash'], ['html', 'HTML'], ['css', 'CSS'],
  ['json', 'JSON'], ['markdown', 'Markdown'], ['text', 'Plain text'],
];

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Returns HTML that is safe to inject: highlight.js escapes the code, and plain text is escaped here.
export function renderCode(code, language) {
  const lang = language === 'html' ? 'xml' : language;
  if (lang && hljs.getLanguage(lang)) {
    try { return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value; } catch { /* fall through */ }
  }
  return escapeHtml(code);
}
