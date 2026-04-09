// test/formats.test.js — verify getAllFormats + exactForm
// Run with: node test/formats.test.js

const { parse }                    = require('../src/parser');
const { compute, getAllFormats }    = require('../src/compute');

function run(latex) {
  try {
    const r = compute(parse(latex), 'auto');
    if (!r.success) return `ERR: ${r.error}`;
    const f = getAllFormats(r.value);
    return f.join('  |  ');
  } catch (e) { return `THROW: ${e.message}`; }
}

const cases = [
  // irrational → should have exact form as first option
  ['\\arctan(1)',           '\\frac{\\pi}{4}  |  0.785398'],
  ['\\sin(\\pi / 4)',       '\\frac{\\sqrt{2}}{2}  |  0.707107'],
  ['\\cos(\\pi / 6)',       '\\frac{\\sqrt{3}}{2}  |  0.866025'],
  ['\\sqrt{2}',             '\\sqrt{2}  |  1.41421'],
  ['\\sqrt{3}',             '\\sqrt{3}  |  1.73205'],
  ['2 \\cdot \\pi',         '2\\pi  |  6.28319'],
  ['\\pi / 4',              '\\frac{\\pi}{4}  |  0.785398'],

  // rational → fraction then decimal
  ['\\frac{3}{4} + \\frac{1}{8}', '\\frac{7}{8}  |  0.875'],
  ['\\sin(\\pi / 6)',              '\\frac{1}{2}  |  0.5'],  // 0.5 is rational

  // integers → just the integer, no alternatives
  ['\\sqrt{144}',    '12'],
  ['5! + 3!',        '126'],
  ['2^{10} - 1',     '1023'],
];

let passed = 0, failed = 0;
cases.forEach(([expr, expected]) => {
  const got = run(expr);
  if (got === expected) {
    console.log(`PASS  ${expr}`);
    passed++;
  } else {
    console.log(`FAIL  ${expr}`);
    console.log(`      expected: ${expected}`);
    console.log(`           got: ${got}`);
    failed++;
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
