# LaTeX Auto-Compute

A Chrome extension that computes LaTeX math expressions inline as you type. Press `=` inside a math environment and a result appears as ghost text — **Tab** to accept, **Esc** to dismiss.

Works in Overleaf, HackMD, and any editor that uses `textarea` or `contenteditable`.

---

## How it works

1. Type a math expression inside `$...$`, `\[...\]`, or `\(...\)`
2. End it with `=`
3. A suggestion appears at the cursor
4. **Tab** inserts it · **↑↓** cycles between formats · **Esc** dismisses

```
$\binom{10}{5} \cdot 5! - 82 \cdot \frac{1}{2} =|30199
                                                  ^^^^^ ghost text, Tab to accept
```

---

## Installation

### From source (developer mode)

1. Clone this repo
   ```bash
   git clone https://github.com/YOUR_USERNAME/latex-auto-compute.git
   ```
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the cloned folder
5. *(For local `file://` pages)* Click **Details → Allow access to file URLs**

---

## Supported syntax

| LaTeX | Meaning |
|---|---|
| `\frac{a}{b}` | Division |
| `\binom{n}{k}` | Binomial coefficient |
| `n!` | Factorial |
| `\sqrt{x}`, `\sqrt[n]{x}` | Square / nth root |
| `\cdot`, `\times`, `*` | Multiplication |
| `+`, `-`, `/` | Basic arithmetic |
| `^{n}` | Exponentiation |
| `\sin`, `\cos`, `\tan`, `\ln`, `\log`, `\exp` | Functions (radians) |
| `\pi`, `e` | Constants |
| `\left(`, `\right)` | Grouping |

Expressions with unbound variables (e.g. `f(x) + 3`) produce no suggestion — they fail silently.

---

## Output formats

Results cycle with **↑/↓** when ghost text is visible:

| Value | Auto | Exact | Decimal |
|---|---|---|---|
| `\sqrt{144}` | `12` | — | — |
| `\frac{3}{4} + \frac{1}{8}` | `\frac{7}{8}` | — | `0.875` |
| `\arctan(1)` | `\frac{\pi}{4}` | `\frac{\pi}{4}` | `0.785398` |
| `\sin(\pi/4)` | `\frac{\sqrt{2}}{2}` | `\frac{\sqrt{2}}{2}` | `0.707107` |
| `\sqrt{2}` | `\sqrt{2}` | `\sqrt{2}` | `1.41421` |

Exact irrational forms are recognized for rational multiples of π, √2, √3, √5, √6, and e.

---

## Settings

Click the extension icon to open the popup:

- **Enable / disable** the extension
- **Output format**: Auto · Always decimal · Always fraction

---

## Local demo

Open `test/demo.html` directly in Chrome (no server needed). It runs the full parser and compute engine in the browser and lets you try expressions interactively.

---

## Project structure

```
├── manifest.json          Chrome MV3 manifest
├── src/
│   ├── parser.js          LaTeX tokenizer + recursive-descent parser → AST
│   ├── compute.js         AST evaluator, exact-form detection, format cycling
│   ├── ghost.js           Ghost text overlay (positioning + key handling)
│   ├── content.js         Editor detection, = trigger, CM6 support
│   └── settings.js        chrome.storage.sync wrapper
├── popup/                 Settings UI
├── styles/
│   └── ghost.css          Ghost text overlay styles
└── test/
    ├── parser.test.js     31 parser unit tests
    ├── compute.test.js    51 evaluator + formatter tests
    ├── formats.test.js    12 exact-form / format-cycling tests
    └── demo.html          Interactive browser demo
```

No bundler, no dependencies, no build step.

---

## Running tests

Requires Node.js (any recent version).

```bash
node test/parser.test.js
node test/compute.test.js
node test/formats.test.js
```

---

## Contributing

Pull requests are welcome. A few things to know:

- **No external dependencies** — the extension loads as plain JS files; keep it that way
- **Add tests** for new parser syntax or compute behavior (`test/compute.test.js`)
- **Check the demo** — `test/demo.html` is the fastest way to verify end-to-end behavior before loading the extension

---

## License

MIT
