// compute.js — AST → numerical result
//
// Returns: { success: true, value: number, display: string }
//       or { success: false, error: string }

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function factorial(n) {
  n = Math.round(n);
  if (n < 0) throw new Error('Factorial of negative number');
  if (n > 170) throw new Error('Factorial argument too large (> 170)');
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

// Compute C(n, k) avoiding intermediate factorial explosion
function binomial(n, k) {
  n = Math.round(n);
  k = Math.round(k);
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k); // symmetry
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = result * (n - i) / (i + 1);
  }
  return Math.round(result);
}

// Round floating-point near-zero (e.g. sin(π))
function nearZero(x) {
  return Math.abs(x) < 1e-10 ? 0 : x;
}

// GCD (always positive)
function gcd(a, b) {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) { const t = b; b = a % b; a = t; }
  return a;
}

// Try to express x as a fraction p/q with |q| ≤ maxDen.
// Returns { num, den } (reduced) or null if no good fraction found.
function toFraction(x, maxDen = 1000) {
  if (!isFinite(x)) return null;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  let bestNum = Math.round(x);
  let bestDen = 1;
  let bestErr = Math.abs(x - bestNum);

  for (let d = 2; d <= maxDen; d++) {
    const n = Math.round(x * d);
    const err = Math.abs(x - n / d);
    if (err < bestErr) {
      bestErr = err;
      bestNum = n;
      bestDen = d;
    }
    if (bestErr < 1e-12) break;
  }

  // Reject if error is too large relative to the magnitude
  const tol = Math.max(1e-9, Math.abs(x) * 1e-9);
  if (bestErr > tol) return null;

  const g = gcd(bestNum, bestDen);
  return { num: sign * (bestNum / g), den: bestDen / g };
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

function evalNode(node) {
  switch (node.type) {
    case 'number':
      return node.value;

    case 'constant':
      if (node.name === 'pi')  return Math.PI;
      if (node.name === 'e')   return Math.E;
      if (node.name === 'inf') return Infinity;
      throw new Error(`Unknown constant: ${node.name}`);

    case 'variable':
      throw new Error(`Unbound variable: ${node.name}`);

    case 'unary':
      return -evalNode(node.arg);

    case 'binop': {
      const l = evalNode(node.left);
      const r = evalNode(node.right);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/':
          if (r === 0) throw new Error('Division by zero');
          return l / r;
        case '^': return Math.pow(l, r);
        default:  throw new Error(`Unknown op: ${node.op}`);
      }
    }

    case 'factorial':
      return factorial(evalNode(node.arg));

    case 'frac': {
      const num = evalNode(node.num);
      const den = evalNode(node.den);
      if (den === 0) throw new Error('Division by zero');
      return num / den;
    }

    case 'binom': {
      const n = evalNode(node.n);
      const k = evalNode(node.k);
      return binomial(n, k);
    }

    case 'sqrt': {
      const arg = evalNode(node.arg);
      if (node.root === null) {
        if (arg < 0) throw new Error('Square root of negative number');
        return Math.sqrt(arg);
      }
      const root = evalNode(node.root);
      return Math.pow(arg, 1 / root);
    }

    case 'func': {
      const arg = evalNode(node.arg);
      switch (node.name) {
        case 'sin':    return nearZero(Math.sin(arg));
        case 'cos':    return nearZero(Math.cos(arg));
        case 'tan':    return nearZero(Math.tan(arg));
        case 'cot':    return nearZero(1 / Math.tan(arg));
        case 'sec':    return 1 / Math.cos(arg);
        case 'csc':    return 1 / Math.sin(arg);
        case 'arcsin': return Math.asin(arg);
        case 'arccos': return Math.acos(arg);
        case 'arctan': return Math.atan(arg);
        case 'sinh':   return Math.sinh(arg);
        case 'cosh':   return Math.cosh(arg);
        case 'tanh':   return Math.tanh(arg);
        case 'log':    return Math.log10(arg);
        case 'ln':     return Math.log(arg);
        case 'exp':    return Math.exp(arg);
        case 'abs':    return Math.abs(arg);
        default:       throw new Error(`Unknown function: ${node.name}`);
      }
    }

    default:
      throw new Error(`Unknown AST node type: ${node.type}`);
  }
}

// ---------------------------------------------------------------------------
// Result formatting
// ---------------------------------------------------------------------------

function formatResult(value, format = 'auto') {
  if (!isFinite(value)) {
    if (value === Infinity)  return '\\infty';
    if (value === -Infinity) return '-\\infty';
    return null; // NaN
  }

  // Integer check
  const isInt = Number.isInteger(value) || Math.abs(value - Math.round(value)) < 1e-9;

  if (format === 'decimal') {
    return formatDecimal(value);
  }

  if (format === 'fraction') {
    const frac = toFraction(value);
    if (frac && frac.den !== 1) {
      return `\\frac{${frac.num}}{${frac.den}}`;
    }
    return String(Math.round(value));
  }

  // Auto mode
  if (isInt) {
    const rounded = Math.round(value);
    if (Math.abs(rounded) >= 1e15) {
      return value.toExponential(4);
    }
    return String(rounded);
  }

  // Try "nice" fraction (denominator ≤ 1000)
  const frac = toFraction(value, 1000);
  if (frac && frac.den > 1 && frac.den <= 1000) {
    return `\\frac{${frac.num}}{${frac.den}}`;
  }

  return formatDecimal(value);
}

function formatDecimal(value) {
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  // Use scientific notation for very large or very small
  if (abs >= 1e10 || (abs < 1e-4 && abs > 0)) {
    return value.toExponential(4).replace(/\.?0+(e)/, '$1');
  }
  // toPrecision gives 6 significant figures, then strip trailing zeros
  return parseFloat(value.toPrecision(6)).toString();
}

// ---------------------------------------------------------------------------
// Exact / irrational forms
// ---------------------------------------------------------------------------

// Known irrational bases to try expressing results as rational multiples of
const IRRATIONALS = [
  { sym: '\\pi',         val: Math.PI },
  { sym: '\\sqrt{2}',   val: Math.SQRT2 },
  { sym: '\\sqrt{3}',   val: Math.sqrt(3) },
  { sym: '\\sqrt{5}',   val: Math.sqrt(5) },
  { sym: '\\sqrt{6}',   val: Math.sqrt(6) },
  { sym: 'e',            val: Math.E },
];

// Format  (num/den) * sym  as LaTeX
function fmtIrrational(num, den, sym) {
  const sign   = num < 0 ? '-' : '';
  const absNum = Math.abs(num);
  if (absNum === 1 && den === 1) return `${sign}${sym}`;
  if (absNum !== 1 && den === 1) return `${sign}${absNum}${sym}`;
  if (absNum === 1 && den !== 1) return `${sign}\\frac{${sym}}{${den}}`;
  return `${sign}\\frac{${absNum}${sym}}{${den}}`;
}

// Try to express value as (p/q) * irrational, returns LaTeX string or null.
// maxDen: max denominator to try; keep small (≤ 24) to avoid false matches.
function exactForm(value, maxDen = 24) {
  if (!isFinite(value) || value === 0) return null;

  for (const { sym, val } of IRRATIONALS) {
    const ratio = value / val;
    const f = toFraction(ratio, maxDen);
    if (!f) continue;
    // Sanity: verify the round-trip is accurate
    if (Math.abs(f.num / f.den * val - value) > Math.abs(value) * 1e-8) continue;
    return fmtIrrational(f.num, f.den, sym);
  }
  return null;
}

// Return every distinct representation of value as an ordered array.
// Order: most-exact first → decimal last.
function getAllFormats(value) {
  if (!isFinite(value)) {
    const s = value === Infinity ? '\\infty' : value === -Infinity ? '-\\infty' : null;
    return s ? [s] : [];
  }

  const forms = [];
  const seen  = new Set();
  function add(s) { if (s && !seen.has(s)) { seen.add(s); forms.push(s); } }

  const isInt = Number.isInteger(value) || Math.abs(value - Math.round(value)) < 1e-9;

  if (isInt) {
    const n = Math.round(value);
    add(Math.abs(n) >= 1e15 ? value.toExponential(4) : String(n));
    // Integers have no other representation worth showing
    return forms;
  }

  // 1. Exact irrational form  (e.g. \frac{\pi}{4}, \frac{\sqrt{2}}{2})
  add(exactForm(value));

  // 2. Rational fraction
  const frac = toFraction(value, 1000);
  if (frac && frac.den > 1) add(`\\frac{${frac.num}}{${frac.den}}`);

  // 3. Decimal
  add(formatDecimal(value));

  return forms;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// format: 'auto' | 'decimal' | 'fraction'
function compute(ast, format = 'auto') {
  try {
    const value = evalNode(ast);
    const display = formatResult(value, format);
    if (display === null) return { success: false, error: 'Result is NaN' };
    return { success: true, value, display };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Convenience: parse + compute in one call (used from content.js)
function computeLatex(latex, format = 'auto') {
  try {
    // parse is defined in parser.js (loaded before this file in extension)
    const ast = (typeof parse === 'function') ? parse(latex)
              : (typeof module !== 'undefined' ? require('./parser').parse(latex) : null);
    if (!ast) throw new Error('Parser not available');
    return compute(ast, format);
  } catch (e) {
    return { success: false, error: e.message };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { compute, computeLatex, formatResult, toFraction, exactForm, getAllFormats };
}
