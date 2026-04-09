// parser.js — LaTeX math string → AST
//
// AST node shapes:
//   { type: 'number',   value: number }
//   { type: 'constant', name: 'pi'|'e' }
//   { type: 'variable', name: string }   ← causes compute to throw
//   { type: 'binop',    op: '+'|'-'|'*'|'/'|'^', left, right }
//   { type: 'unary',    op: '-', arg }
//   { type: 'factorial', arg }
//   { type: 'func',     name: string, arg }
//   { type: 'frac',     num, den }
//   { type: 'binom',    n, k }
//   { type: 'sqrt',     root, arg }   root is null → square root

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function tokenize(latex) {
  const tokens = [];
  let i = 0;

  while (i < latex.length) {
    // skip whitespace
    if (/\s/.test(latex[i])) { i++; continue; }

    // backslash command
    if (latex[i] === '\\') {
      i++;
      if (i >= latex.length) throw new Error('Unexpected end after backslash');
      let cmd = '';
      if (/[a-zA-Z]/.test(latex[i])) {
        while (i < latex.length && /[a-zA-Z]/.test(latex[i])) cmd += latex[i++];
      } else {
        // single special char like \{ \} \| \.
        cmd = latex[i++];
      }
      tokens.push({ type: 'CMD', val: cmd });
      continue;
    }

    // number (integer or decimal)
    if (/[0-9]/.test(latex[i])) {
      let num = '';
      while (i < latex.length && /[0-9]/.test(latex[i])) num += latex[i++];
      if (i < latex.length && latex[i] === '.') {
        num += latex[i++];
        while (i < latex.length && /[0-9]/.test(latex[i])) num += latex[i++];
      }
      tokens.push({ type: 'NUM', val: parseFloat(num) });
      continue;
    }

    // decimal starting with dot
    if (latex[i] === '.' && i + 1 < latex.length && /[0-9]/.test(latex[i + 1])) {
      let num = '.';
      i++;
      while (i < latex.length && /[0-9]/.test(latex[i])) num += latex[i++];
      tokens.push({ type: 'NUM', val: parseFloat(num) });
      continue;
    }

    // single-char tokens
    const single = {
      '{': 'LBRACE', '}': 'RBRACE',
      '[': 'LBRACK', ']': 'RBRACK',
      '(': 'LPAREN', ')': 'RPAREN',
      '+': 'PLUS',   '-': 'MINUS',
      '*': 'STAR',   '/': 'SLASH',
      '^': 'CARET',  '!': 'BANG',
      '_': 'UNDER',  ',': 'COMMA',
      '=': 'EQ',     '|': 'PIPE',
    };
    if (single[latex[i]]) {
      tokens.push({ type: single[latex[i]] });
      i++;
      continue;
    }

    // single letter identifier (potential variable or constant)
    if (/[a-zA-Z]/.test(latex[i])) {
      tokens.push({ type: 'IDENT', val: latex[i++] });
      continue;
    }

    // skip anything else (e.g. punctuation, unicode)
    i++;
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() { return this.tokens[this.pos]; }
  advance() { return this.tokens[this.pos++]; }

  at(type, val) {
    const t = this.peek();
    if (!t || t.type !== type) return false;
    if (val !== undefined && t.val !== val) return false;
    return true;
  }

  expect(type, val) {
    const t = this.advance();
    if (!t) throw new Error(`Expected ${type} but reached end of input`);
    if (t.type !== type) throw new Error(`Expected ${type}, got ${t.type} (${t.val ?? ''})`);
    if (val !== undefined && t.val !== val) throw new Error(`Expected ${val}, got ${t.val}`);
    return t;
  }

  // Parse a brace-delimited group: { expr }
  group() {
    this.expect('LBRACE');
    const e = this.expr();
    this.expect('RBRACE');
    return e;
  }

  // Top-level entry
  parseAll() {
    const e = this.expr();
    if (this.pos < this.tokens.length) {
      const t = this.peek();
      throw new Error(`Unexpected token: ${t.type} ${t.val ?? ''}`);
    }
    return e;
  }

  // expr → term (('+' | '-') term)*
  expr() {
    let node = this.term();
    while (this.at('PLUS') || this.at('MINUS')) {
      const op = this.advance().type === 'PLUS' ? '+' : '-';
      node = { type: 'binop', op, left: node, right: this.term() };
    }
    return node;
  }

  // term → power (op power)* with explicit and implicit multiplication
  term() {
    let node = this.power();

    while (true) {
      const t = this.peek();
      if (!t) break;

      // Explicit multiply operators
      if (t.type === 'STAR') {
        this.advance();
        node = { type: 'binop', op: '*', left: node, right: this.power() };
        continue;
      }
      if (t.type === 'SLASH') {
        this.advance();
        node = { type: 'binop', op: '/', left: node, right: this.power() };
        continue;
      }
      if (t.type === 'CMD' && (t.val === 'cdot' || t.val === 'times')) {
        this.advance();
        node = { type: 'binop', op: '*', left: node, right: this.power() };
        continue;
      }

      // Implicit multiplication: next token can start an atom
      if (this.canStartAtom(t)) {
        node = { type: 'binop', op: '*', left: node, right: this.power() };
        continue;
      }

      break;
    }

    return node;
  }

  // Can 't' start a new atom (for implicit multiply detection)?
  canStartAtom(t) {
    if (!t) return false;
    if (t.type === 'NUM' || t.type === 'LPAREN' || t.type === 'LBRACE') return true;
    // Single-letter that is a known constant ('e') or a variable
    if (t.type === 'IDENT') return true;
    if (t.type === 'CMD') {
      return [
        'pi', 'e',
        'frac', 'binom', 'sqrt',
        'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
        'arcsin', 'arccos', 'arctan',
        'log', 'ln', 'exp',
        'abs', 'left',
      ].includes(t.val);
    }
    return false;
  }

  // power → postfix ('^' exponent)?   right-associative
  power() {
    let base = this.postfix();
    if (this.at('CARET')) {
      this.advance();
      let exp;
      if (this.at('LBRACE')) {
        exp = this.group();
      } else {
        exp = this.atom(); // single atom, e.g. x^2
      }
      return { type: 'binop', op: '^', left: base, right: exp };
    }
    return base;
  }

  // postfix → atom ('!')*
  postfix() {
    let node = this.atom();
    while (this.at('BANG')) {
      this.advance();
      node = { type: 'factorial', arg: node };
    }
    return node;
  }

  // atom → number | constant | variable | grouped | command | unary-minus
  atom() {
    const t = this.peek();
    if (!t) throw new Error('Unexpected end of expression');

    // Number literal
    if (t.type === 'NUM') {
      this.advance();
      return { type: 'number', value: t.val };
    }

    // Unary minus
    if (t.type === 'MINUS') {
      this.advance();
      return { type: 'unary', op: '-', arg: this.atom() };
    }

    // Parenthesised group: (expr)
    if (t.type === 'LPAREN') {
      this.advance();
      const e = this.expr();
      if (this.at('RPAREN')) this.advance();
      return e;
    }

    // Brace group: {expr}
    if (t.type === 'LBRACE') {
      return this.group();
    }

    // Single-letter identifier
    if (t.type === 'IDENT') {
      this.advance();
      // 'e' is Euler's number
      if (t.val === 'e') return { type: 'constant', name: 'e' };
      return { type: 'variable', name: t.val };
    }

    // LaTeX command
    if (t.type === 'CMD') {
      return this.command();
    }

    throw new Error(`Unexpected token: ${t.type} (${t.val ?? ''})`);
  }

  command() {
    const t = this.advance();
    const cmd = t.val;

    switch (cmd) {
      // Constants
      case 'pi':  return { type: 'constant', name: 'pi' };
      case 'e':   return { type: 'constant', name: 'e' };  // \mathrm{e} → just \e handled here
      case 'inf':
      case 'infty': return { type: 'constant', name: 'inf' };

      // \frac{num}{den}
      case 'frac': {
        const num = this.group();
        const den = this.group();
        return { type: 'frac', num, den };
      }

      // \binom{n}{k}
      case 'binom':
      case 'dbinom':
      case 'tbinom': {
        const n = this.group();
        const k = this.group();
        return { type: 'binom', n, k };
      }

      // \sqrt[root]{arg}  or  \sqrt{arg}
      case 'sqrt': {
        let root = null;
        if (this.at('LBRACK')) {
          this.advance();
          root = this.expr();
          this.expect('RBRACK');
        }
        const arg = this.group();
        return { type: 'sqrt', root, arg };
      }

      // Trig / log functions
      case 'sin': case 'cos': case 'tan':
      case 'cot': case 'sec': case 'csc':
      case 'arcsin': case 'arccos': case 'arctan':
      case 'sinh': case 'cosh': case 'tanh':
      case 'log': case 'ln': case 'exp':
      case 'abs': {
        const arg = this.funcArg();
        return { type: 'func', name: cmd, arg };
      }

      // \log_{base}{arg}  — optional base subscript
      // (already handled above; subscript ignored for now, treated as log10)

      // \left( ... \right)  — auto-sized grouping, treat as plain group
      case 'left': {
        this.advance(); // skip the delimiter token (( [ | { .)
        const e = this.expr();
        // consume \right + its delimiter
        if (this.at('CMD', 'right')) {
          this.advance();
          if (this.pos < this.tokens.length) this.advance(); // delimiter
        }
        return e;
      }

      // Ignore display/formatting commands that wrap a group
      case 'mathrm': case 'mathbf': case 'mathit': case 'mathsf':
      case 'text': case 'textrm': case 'operatorname':
        return this.group();

      // Ignore \right in case it surfaces unexpectedly
      case 'right':
        // consume the delimiter and return a placeholder — outer parser will handle
        if (this.pos < this.tokens.length) this.advance();
        throw new Error('Unmatched \\right');

      default:
        throw new Error(`Unknown command: \\${cmd}`);
    }
  }

  // Function argument: {expr}, (expr), \left(...\right), or bare atom
  funcArg() {
    if (this.at('LBRACE')) return this.group();

    if (this.at('LPAREN')) {
      this.advance();
      const e = this.expr();
      if (this.at('RPAREN')) this.advance();
      return e;
    }

    if (this.at('CMD', 'left')) {
      this.advance(); // \left
      this.advance(); // delimiter
      const e = this.expr();
      if (this.at('CMD', 'right')) {
        this.advance();
        if (this.pos < this.tokens.length) this.advance();
      }
      return e;
    }

    // Bare atom (e.g. \sin x)
    return this.atom();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function parse(latex) {
  const tokens = tokenize(latex);
  const parser = new Parser(tokens);
  return parser.parseAll();
}

// Node.js / test environment export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { tokenize, parse };
}
