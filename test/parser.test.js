// test/parser.test.js — unit tests for the LaTeX parser
// Run with: node test/parser.test.js

const { parse } = require('../src/parser.js');

let passed = 0;
let failed = 0;

function testParse(name, input, expectType) {
  try {
    const ast = parse(input);
    if (expectType && ast.type !== expectType) {
      console.log(`FAIL [${name}]: expected root type '${expectType}', got '${ast.type}'`);
      console.log('  AST:', JSON.stringify(ast, null, 2));
      failed++;
    } else {
      console.log(`PASS [${name}]`);
      passed++;
    }
  } catch (e) {
    console.log(`FAIL [${name}]: threw "${e.message}"`);
    failed++;
  }
}

function testParseThrows(name, input) {
  try {
    parse(input);
    console.log(`FAIL [${name}]: expected throw, but parsed successfully`);
    failed++;
  } catch (e) {
    console.log(`PASS [${name}]: threw as expected — ${e.message}`);
    passed++;
  }
}

// Basic numbers
testParse('integer',          '42',           'number');
testParse('decimal',          '3.14',         'number');
testParse('negative',         '-5',           'unary');

// Arithmetic
testParse('addition',         '1 + 2',        'binop');
testParse('subtraction',      '5 - 3',        'binop');
testParse('multiplication',   '4 * 3',        'binop');
testParse('division',         '7 / 2',        'binop');
testParse('exponent',         '2^{10}',       'binop');
testParse('exponent-bare',    '2^3',          'binop');

// Grouping
testParse('parens',           '(1 + 2)',       'binop');
testParse('brace-group',      '{1 + 2}',      'binop');

// LaTeX commands
testParse('frac',             '\\frac{3}{4}', 'frac');
testParse('binom',            '\\binom{5}{2}','binom');
testParse('sqrt',             '\\sqrt{9}',    'sqrt');
testParse('sqrt-nth',         '\\sqrt[3]{8}', 'sqrt');
testParse('pi constant',      '\\pi',         'constant');
testParse('e constant ident', 'e',            'constant');

// Functions
testParse('sin',              '\\sin(\\pi)',  'func');
testParse('cos',              '\\cos{0}',    'func');
testParse('log',              '\\log{100}',  'func');
testParse('ln',               '\\ln{e}',     'func');

// Factorial
testParse('factorial',        '5!',           'factorial');
testParse('factorial-expr',   '(3+2)!',       'factorial');

// Complex expressions
testParse('cdot',             '3 \\cdot 4',                    'binop');
testParse('times',            '3 \\times 4',                   'binop');
testParse('mixed',            '\\frac{1}{2} + \\binom{4}{2}',  'binop');
testParse('implicit-mul',     '2\\pi',                         'binop');
testParse('left-right',       '\\left(1+2\\right)',            'binop');

// Variables (should parse, not throw — throwing is compute's job)
testParse('variable',         'x + 1',        'binop');

// Invalid / malformed
testParseThrows('unknown-cmd',  '\\undefined{x}');
testParseThrows('unclosed-frac','\\frac{1}');  // missing second group

// Summary
console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
