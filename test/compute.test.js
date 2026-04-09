// test/compute.test.js — unit tests for parser + evaluator
// Run with: node test/compute.test.js

const { parse }        = require('../src/parser.js');
const { compute, computeLatex, formatResult, toFraction } = require('../src/compute.js');

// Patch computeLatex to use the required parse (not the global)
function run(latex, format = 'auto') {
  try {
    const ast = parse(latex);
    return compute(ast, format);
  } catch (e) {
    return { success: false, error: e.message };
  }
}

let passed = 0;
let failed = 0;

function test(name, latex, expected, format = 'auto') {
  const result = run(latex, format);
  let ok = false;

  if (typeof expected === 'number') {
    ok = result.success && Math.abs(result.value - expected) < 1e-6;
  } else if (typeof expected === 'string') {
    ok = result.success && result.display === expected;
  } else if (expected === null) {
    // expect failure
    ok = !result.success;
  }

  if (ok) {
    console.log(`PASS [${name}]`);
    passed++;
  } else {
    const got = result.success ? `${result.display} (${result.value})` : `ERROR: ${result.error}`;
    console.log(`FAIL [${name}]: expected ${JSON.stringify(expected)}, got ${got}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Basic arithmetic
// ---------------------------------------------------------------------------
test('integer',         '42',             42);
test('addition',        '1 + 2',          3);
test('subtraction',     '10 - 3',         7);
test('multiply',        '6 * 7',          42);
test('divide',          '10 / 4',         2.5);
test('negative',        '-5',             -5);
test('unary-chain',     '- -3',           3);
test('parens',          '(2 + 3) * 4',    20);

// ---------------------------------------------------------------------------
// LaTeX-specific expressions
// ---------------------------------------------------------------------------
test('frac-half',       '\\frac{1}{2}',           0.5);
test('frac-add',        '\\frac{3}{4} + \\frac{1}{8}', '\\frac{7}{8}');
test('binom-5-2',       '\\binom{5}{2}',           10);
test('binom-10-5',      '\\binom{10}{5}',          252);
test('factorial-5',     '5!',                      120);
test('factorial-0',     '0!',                      1);
test('factorial-sum',   '5! + 3!',                 126);
test('sqrt-4',          '\\sqrt{4}',               2);
test('sqrt-144',        '\\sqrt{144}',             12);
test('sqrt-2',          '\\sqrt[3]{8}',            2);
test('power',           '2^{10}',                  1024);
test('power-minus',     '2^{10} - 1',              1023);
test('cdot',            '3 \\cdot 4',              12);
test('times',           '3 \\times 4',             12);
test('implicit-mul',    '2\\pi',                   2 * Math.PI);

// ---------------------------------------------------------------------------
// Compound (design-doc sample cases)
// ---------------------------------------------------------------------------
// C(10,5)*5! - 82*(1/2) = 252*120 - 41 = 30240 - 41 = 30199
test('design-doc-expr', '\\binom{10}{5} \\cdot 5! - 82 \\cdot \\frac{1}{2}', 30199);

// ---------------------------------------------------------------------------
// Trig / constants
// ---------------------------------------------------------------------------
test('sin-pi',          '\\sin(\\pi)',      0);
test('cos-0',           '\\cos(0)',         1);
test('sin-pi-over-2',   '\\sin(\\pi / 2)', 1);
test('tan-pi-4',        '\\tan(\\pi / 4)', 1);
test('ln-e',            '\\ln(e)',          1);
test('log-100',         '\\log(100)',       2);
test('e-constant',      'e',               Math.E);
test('pi-constant',     '\\pi',            Math.PI);
test('exp-1',           '\\exp(1)',         Math.E);

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
test('format-int',          '2^{10}',           '1024');
test('format-frac-auto',    '\\frac{3}{4}',     '\\frac{3}{4}');
test('format-decimal-mode', '\\frac{3}{4}',     '0.75',            'decimal');
test('format-fraction-mode','3 / 4',            '\\frac{3}{4}',    'fraction');
test('format-large-int',    '10!',              '3628800');
test('format-irrational',   '\\sqrt{2}',        '1.41421');  // toPrecision(6)

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
test('nested-frac',     '\\frac{\\frac{1}{2}}{\\frac{1}{4}}',  2);
test('frac-power',      '\\frac{2^3}{4}',   2);
test('left-right',      '\\left(1+2\\right)', 3);
test('binom-sym',       '\\binom{6}{3}',   20);

// ---------------------------------------------------------------------------
// Failure cases (unbound variable → no suggestion)
// ---------------------------------------------------------------------------
test('variable-x',      'x + 3',           null);
test('function-f',      'f(x) + 3',        null);  // unknown function f
test('div-by-zero',     '1 / 0',           null);

// ---------------------------------------------------------------------------
// toFraction utility
// ---------------------------------------------------------------------------
function testFrac(name, x, expectedNum, expectedDen) {
  const f = toFraction(x);
  if (!f) {
    console.log(`FAIL [frac-${name}]: got null`);
    failed++;
    return;
  }
  if (f.num === expectedNum && f.den === expectedDen) {
    console.log(`PASS [frac-${name}]`);
    passed++;
  } else {
    console.log(`FAIL [frac-${name}]: expected ${expectedNum}/${expectedDen}, got ${f.num}/${f.den}`);
    failed++;
  }
}

testFrac('half',       0.5,     1,  2);
testFrac('third',      1/3,     1,  3);
testFrac('two-thirds', 2/3,     2,  3);
testFrac('seven-eighths', 7/8,  7,  8);
testFrac('integer',    3,       3,  1);

// Summary
console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
