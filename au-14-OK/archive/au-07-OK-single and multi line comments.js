const canvas = document.getElementById('displayCanvas');
const ctx = canvas.getContext('2d', { alpha: false });

if (ctx.imageSmoothingEnabled) {
  ctx.imageSmoothingEnabled = false;
}

function clearScreen(color = '#000000') {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 128, 128);
}

function pset(x, y, color = '#ffffff') {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
}

function pget(x, y) {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || px >= 128 || py < 0 || py >= 128) return ['QUOTE', ['COLOR', 0, 0, 0, 255]];
  const pixel = ctx.getImageData(px, py, 1, 1).data;
  return ['QUOTE', ['COLOR', pixel[0], pixel[1], pixel[2], pixel[3]]];
}

function parseColor(color, defaultStr = '#ffffff') {
  let colStr = defaultStr;
  if (Array.isArray(color) && color[0] === 'COLOR') {
    const [, r, g, b, a = 255] = color;
    colStr = `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a / 255))})`;
  } else if (color) {
    colStr = lispToString(color);
    if (colStr.startsWith('"') && colStr.endsWith('"')) colStr = colStr.slice(1, -1);
  }
  return colStr;
}

function drawText(str, x, y, colorStr) {
  let textStr = String(str);
  if (textStr.startsWith('"') && textStr.endsWith('"')) {
    textStr = unescapeString(textStr.slice(1, -1));
  }
  
  let cursorX = Math.floor(x);
  let startY = Math.floor(y);
  ctx.fillStyle = colorStr;

  for (let i = 0; i < textStr.length; i++) {
    const code = textStr.charCodeAt(i);
    if (code === 10) { // newline character
      cursorX = Math.floor(x);
      startY += 8;
      continue;
    }
    
    const charBitmap = DOS_FONT_8X8[code] || DOS_FONT_8X8[32]; // default to space if out of range
    for (let row = 0; row < 8; row++) {
      const rowByte = charBitmap[row];
      for (let col = 0; col < 8; col++) {
        if ((rowByte & (1 << (7 - col))) !== 0) {
          ctx.fillRect(cursorX + col, startY + row, 1, 1);
        }
      }
    }
    cursorX += 8;
  }
}

function drawBresenhamLine(x0, y0, x1, y1, colorStr) {
  x0 = Math.floor(x0);
  y0 = Math.floor(y0);
  x1 = Math.floor(x1);
  y1 = Math.floor(y1);

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = (x0 < x1) ? 1 : -1;
  const sy = (y0 < y1) ? 1 : -1;
  let err = dx - dy;

  ctx.fillStyle = colorStr;
  while (true) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function drawBresenhamCircle(xc, yc, r, colorStr, filled) {
  xc = Math.floor(xc);
  yc = Math.floor(yc);
  r = Math.floor(r);
  ctx.fillStyle = colorStr;

  let x = 0;
  let y = r;
  let d = 3 - 2 * r;

  function plotCirclePoints(cx, cy, px, py) {
    if (filled) {
      ctx.fillRect(cx - px, cy + py, px * 2 + 1, 1);
      ctx.fillRect(cx - px, cy - py, px * 2 + 1, 1);
      ctx.fillRect(cx - py, cy + px, py * 2 + 1, 1);
      ctx.fillRect(cx - py, cy - px, py * 2 + 1, 1);
    } else {
      ctx.fillRect(cx + px, cy + py, 1, 1);
      ctx.fillRect(cx - px, cy + py, 1, 1);
      ctx.fillRect(cx + px, cy - py, 1, 1);
      ctx.fillRect(cx - px, cy - py, 1, 1);
      ctx.fillRect(cx + py, cy + px, 1, 1);
      ctx.fillRect(cx - py, cy + px, 1, 1);
      ctx.fillRect(cx + py, cy - px, 1, 1);
      ctx.fillRect(cx - py, cy - px, 1, 1);
    }
  }

  plotCirclePoints(xc, yc, x, y);
  while (y >= x) {
    x++;
    if (d > 0) {
      y--;
      d = d + 4 * (x - y) + 10;
    } else {
      d = d + 4 * x + 6;
    }
    plotCirclePoints(xc, yc, x, y);
  }
}

clearScreen('#000000');

class LispRuntimeError extends Error {
  constructor(message, line = 0, col = 0) {
    super(message);
    this.name = "LispRuntimeError";
    this.line = line;
    this.col = col;
  }
}

class ProgramEndSignal extends Error {
  constructor() {
    super("Program ended");
    this.name = "ProgramEndSignal";
  }
}

function unescapeString(str) {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function lispToString(val) {
  if (typeof val === 'string' && val.startsWith('"')) {
    return unescapeString(val.slice(1, -1));
  }
  if (Array.isArray(val)) {
    if (val.length === 0 || val === 'NIL') return 'NIL';
    return '(' + val.map(lispToString).join(' ') + ')';
  }
  return String(val);
}

let activeAppendOutput = null;
let animationFrameId = null;

function stopProgram() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  runBtn.textContent = 'RUN';
  runBtn.classList.remove('running');
}

function makeEnv(bindings = {}, parent = null) {
  return { bindings, parent };
}

function lookupEnv(env, id, line, col) {
  let current = env;
  while (current !== null) {
    if (Object.prototype.hasOwnProperty.call(current.bindings, id)) {
      return current;
    }
    current = current.parent;
  }
  throw new LispRuntimeError(`Unbound symbol: ${id}`, line, col);
}

function assoc(env, id, line, col) {
  const frame = lookupEnv(env, id, line, col);
  return frame.bindings[id];
}

function defineVar(env, id, val) {
  env.bindings[id] = val;
  return val;
}

function setVar(env, id, val, line, col) {
  const frame = lookupEnv(env, id, line, col);
  frame.bindings[id] = val;
  return val;
}

const baseEnv = makeEnv({
  '+': (...args) => args.reduce((acc, curr) => acc + curr, 0),
  '-': (...args) => {
    if (args.length === 0) throw new LispRuntimeError("- requires at least 1 argument");
    if (args.length === 1) return -args[0];
    return args.reduce((acc, curr, idx) => (idx === 0 ? curr : acc - curr), 0);
  },
  '*': (...args) => args.reduce((acc, curr) => acc * curr, 1),
  '/': (...args) => {
    if (args.length === 0) throw new LispRuntimeError("/ requires at least 1 argument");
    if (args.some(x => x === 0)) throw new LispRuntimeError("Division by zero");
    if (args.length === 1) return 1 / args[0];
    return args.reduce((acc, curr, idx) => (idx === 0 ? curr : acc / curr), 0);
  },
  'MOD': (a, b) => a % b,
  'ABS': (a) => Math.abs(a),
  'SGN': (a) => a < 0 ? -1 : (a > 0 ? 1 : 0),
  'MAX': (...args) => Math.max(...args),
  'MIN': (...args) => Math.min(...args),
  'RANDOM': () => Math.random(),
  'TRUNC': (a) => Math.trunc(a),
  'FLOOR': (a) => Math.floor(a),
  'CEIL': (a) => Math.ceil(a),
  'ROUND': (a) => Math.round(a),
  'BITAND': (a, b) => a & b,
  'BITOR': (a, b) => a | b,
  'BITXOR': (a, b) => a ^ b,
  'BITNOT': (a) => ~a,
  'SHL': (a, b) => a << b,
  'SHR': (a, b) => a >> b,

  'COLOR': (r, g, b, a = 255) => {
    const rc = Math.max(0, Math.min(255, Math.floor(r)));
    const gc = Math.max(0, Math.min(255, Math.floor(g)));
    const bc = Math.max(0, Math.min(255, Math.floor(b)));
    const ac = Math.max(0, Math.min(1, a / 255));
    return ['COLOR', rc, gc, bc, a];
  },

  'CLS': (color) => {
    clearScreen(parseColor(color, '#000000'));
    return 'T';
  },

  'PSET': (x, y, color) => {
    pset(x, y, parseColor(color, '#ffffff'));
    return 'T';
  },
  'PGET': (x, y) => pget(x, y),

  'TEXT': (str, x, y, color) => {
    drawText(str, x, y, parseColor(color, '#ffffff'));
    return 'T';
  },

  'LINE': (x1, y1, x2, y2, color) => {
    drawBresenhamLine(x1, y1, x2, y2, parseColor(color, '#ffffff'));
    return 'T';
  },
  'RECT': (x, y, w, h, color) => {
    const rx = Math.floor(x);
    const ry = Math.floor(y);
    const rw = Math.floor(w);
    const rh = Math.floor(h);
    const colStr = parseColor(color, '#ffffff');
    drawBresenhamLine(rx, ry, rx + rw, ry, colStr);
    drawBresenhamLine(rx + rw, ry, rx + rw, ry + rh, colStr);
    drawBresenhamLine(rx + rw, ry + rh, rx, ry + rh, colStr);
    drawBresenhamLine(rx, ry + rh, rx, ry, colStr);
    return 'T';
  },
  'FRECT': (x, y, w, h, color) => {
    ctx.fillStyle = parseColor(color, '#ffffff');
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
    return 'T';
  },
  'CIRC': (x, y, r, color) => {
    drawBresenhamCircle(x, y, r, parseColor(color, '#ffffff'), false);
    return 'T';
  },
  'FCIRC': (x, y, r, color) => {
    drawBresenhamCircle(x, y, r, parseColor(color, '#ffffff'), true);
    return 'T';
  },

  'END': () => {
    stopProgram();
    throw new ProgramEndSignal();
  },

  '<': (a, b) => a < b ? 'T' : 'NIL',
  '>': (a, b) => a > b ? 'T' : 'NIL',
  '<=': (a, b) => a <= b ? 'T' : 'NIL',
  '>=': (a, b) => a >= b ? 'T' : 'NIL',
  '=': (a, b) => a === b ? 'T' : 'NIL',
  'EQ': (a, b) => (a === b || (String(a) === 'NIL' && String(b) === 'NIL')) ? 'T' : 'NIL',
  'NOT': (x) => (x === 'NIL') ? 'T' : 'NIL',
  'ATOM': (x) => (!Array.isArray(x) || x === 'NIL' || x.length === 0) ? 'T' : 'NIL',
  'NULL': (x) => (x === 'NIL' || (Array.isArray(x) && x.length === 0)) ? 'T' : 'NIL',
  'NUMBERP': (x) => typeof x === 'number' ? 'T' : 'NIL',
  'SYMBOLP': (x) => (typeof x === 'string' && !x.startsWith('"')) ? 'T' : 'NIL',
  'LISTP': (x) => Array.isArray(x) ? 'T' : 'NIL',
  'CAR': (x) => x[0],
  'CDR': (x) => x.slice(1),
  'CONS': (x, y) => [x, ...(Array.isArray(y) && y !== 'NIL' ? y : [y])],
  'LIST': (...args) => args.length === 0 ? 'NIL' : args,
  
  'LIST-PUSH-BACK': (lst, item) => {
    const arr = (lst === 'NIL' || !Array.isArray(lst)) ? [] : [...lst];
    arr.push(item);
    return arr;
  },
  'LIST-PUSH-FRONT': (lst, item) => {
    const arr = (lst === 'NIL' || !Array.isArray(lst)) ? [] : [...lst];
    arr.unshift(item);
    return arr;
  },
  'LIST-POP-BACK': (lst) => {
    if (!Array.isArray(lst) || lst.length === 0 || lst === 'NIL') return 'NIL';
    const arr = [...lst];
    arr.pop();
    return arr.length === 0 ? 'NIL' : arr;
  },
  'LIST-POP-FRONT': (lst) => {
    if (!Array.isArray(lst) || lst.length === 0 || lst === 'NIL') return 'NIL';
    const arr = [...lst];
    arr.shift();
    return arr.length === 0 ? 'NIL' : arr;
  },
  'LIST-PUSH-AT': (lst, index, item) => {
    const arr = (lst === 'NIL' || !Array.isArray(lst)) ? [] : [...lst];
    arr.splice(index, 0, item);
    return arr;
  },
  'LIST-POP-AT': (lst, index) => {
    if (!Array.isArray(lst) || lst === 'NIL') return 'NIL';
    const arr = [...lst];
    arr.splice(index, 1);
    return arr.length === 0 ? 'NIL' : arr;
  },
  'LIST-GET': (lst, index) => {
    if (!Array.isArray(lst) || lst === 'NIL' || index < 0 || index >= lst.length) return 'NIL';
    return lst[index];
  },
  'LIST-SET': (lst, index, item) => {
    if (!Array.isArray(lst) || lst === 'NIL' || index < 0 || index >= lst.length) return lst;
    const arr = [...lst];
    arr[index] = item;
    return arr;
  },
  'LIST-CONTAINS': function deepContains(lst, item) {
    if (!Array.isArray(lst) || lst === 'NIL') return 'NIL';
    for (const elem of lst) {
      if (elem === item) return 'T';
      if (Array.isArray(elem) && Array.isArray(item)) {
        if (deepContains(elem, item) === 'T') return 'T';
      }
    }
    return 'NIL';
  },
  'LIST-INDEX-OF': (lst, item) => {
    if (!Array.isArray(lst) || lst === 'NIL') return -1;
    const idx = lst.findIndex(elem => elem === item);
    return idx !== -1 ? idx : -1;
  },
  'LIST-FLATTEN': function deepFlatten(lst) {
    if (!Array.isArray(lst) || lst === 'NIL') return 'NIL';
    let result = [];
    for (const item of lst) {
      if (Array.isArray(item)) {
        const flattenedSub = deepFlatten(item);
        if (flattenedSub !== 'NIL') {
          result = result.concat(flattenedSub);
        }
      } else {
        result.push(item);
      }
    }
    return result.length === 0 ? 'NIL' : result;
  },

  'APPEND': (...lists) => {
    let result = [];
    for (const lst of lists) {
      if (lst !== 'NIL' && Array.isArray(lst)) {
        result = result.concat(lst);
      }
    }
    return result.length === 0 ? 'NIL' : result;
  },
  'EQUAL': function deepEqual(a, b) {
    if (a === b) return 'T';
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return 'NIL';
      for (let i = 0; i < a.length; i++) {
        if (deepEqual(a[i], b[i]) === 'NIL') return 'NIL';
      }
      return 'T';
    }
    return 'NIL';
  },
  'ERROR': (msg) => { throw new LispRuntimeError(msg); },
  'PRINT': (...args) => {
    const formatted = args.map(arg => {
      let str = lispToString(arg);
      if (str.startsWith('"') && str.endsWith('"')) {
        str = unescapeString(str.slice(1, -1));
      }
      return str;
    }).join(' ');

    if (activeAppendOutput) {
      activeAppendOutput(`[PRINT]: ${formatted}`, "output-print");
    }
    return args.length === 1 ? args[0] : args[args.length - 1];
  },
  'T': 'T',
  'NIL': 'NIL'
});

class TailCall {
  constructor(thunk) { this.thunk = thunk; }
}

function trampoline(result) {
  while (result instanceof TailCall) {
    result = result.thunk();
  }
  return result;
}

function callClosure(fnVal, evaluatedArgs, line, col) {
  if (typeof fnVal === 'function') {
    return fnVal(...evaluatedArgs);
  }
  if (Array.isArray(fnVal)) {
    if (fnVal[0] === 'CLOSURE') {
      const [, closureEnv, params, body] = fnVal;
      const callBindings = {};
      for (let i = 0; i < params.length; i++) {
        callBindings[params[i]] = evaluatedArgs[i];
      }
      const callEnv = makeEnv(callBindings, closureEnv);
      return new TailCall(() => evaluate(body, callEnv));
    }
    if (fnVal[0] === 'LABEL') {
      const [, name, lambdaExpr] = fnVal;
      const recursiveBindings = {};
      recursiveBindings[name] = fnVal;
      const recursiveEnv = makeEnv(recursiveBindings, fnVal[1] || baseEnv);
      if (lambdaExpr[0] === 'LAMBDA') {
        const [, params, body] = lambdaExpr;
        const callBindings = {};
        for (let i = 0; i < params.length; i++) {
          callBindings[params[i]] = evaluatedArgs[i];
        }
        const callEnv = makeEnv(callBindings, recursiveEnv);
        return new TailCall(() => evaluate(body, callEnv));
      }
    }
  }
  throw new LispRuntimeError(`Not a function: ${lispToString(fnVal)}`, line, col);
}

function evaluate(expr, env) {
  const line = (expr && (Array.isArray(expr) || typeof expr === 'string')) ? (expr._line || 0) : 0;
  const col = (expr && (Array.isArray(expr) || typeof expr === 'string')) ? (expr._col || 0) : 0;

  if (typeof expr === 'number') return expr;
  if (expr === 'T' || expr === 'NIL') return expr;
  if (typeof expr === 'string' && expr.startsWith('"')) return expr;
  if (typeof expr === 'string') return assoc(env, expr, line, col);

  if (Array.isArray(expr)) {
    const [op, ...args] = expr;

    if (op === 'QUOTE') return args[0];
    if (op === 'NOT') return evaluate(args[0], env) === 'NIL' ? 'T' : 'NIL';
    if (op === 'AND') {
      let res = 'T';
      for (const arg of args) {
        res = evaluate(arg, env);
        if (res === 'NIL') return 'NIL';
      }
      return res;
    }
    if (op === 'OR') {
      for (const arg of args) {
        const res = evaluate(arg, env);
        if (res !== 'NIL') return res;
      }
      return 'NIL';
    }
    if (op === 'COND') {
      for (const clause of args) {
        const [condition, result] = clause;
        if (evaluate(condition, env) !== 'NIL') return evaluate(result, env);
      }
      return 'NIL';
    }
    
    if (op === 'WHILE') {
      const [condition, ...body] = args;
      let lastRes = 'NIL';
      while (evaluate(condition, env) !== 'NIL') {
        for (const stmt of body) {
          lastRes = evaluate(stmt, env);
        }
      }
      return lastRes;
    }

    if (op === 'LABEL') return expr;
    if (op === 'LAMBDA') return ['CLOSURE', env, args[0], args[1]];
    if (op === 'BEGIN') {
      let lastResult = 'NIL';
      for (let i = 0; i < args.length; i++) {
        if (i === args.length - 1) return evaluate(args[i], env);
        lastResult = evaluate(args[i], env);
      }
      return lastResult;
    }
    if (op === 'DEFINE') return defineVar(env, args[0], evaluate(args[1], env));
    if (op === 'SET!') return setVar(env, args[0], evaluate(args[1], env), line, col);

    const evaluatedOp = evaluate(op, env);
    const evaluatedArgs = args.map(arg => evaluate(arg, env));

    try {
      const res = callClosure(evaluatedOp, evaluatedArgs, line, col);
      return res instanceof TailCall ? trampoline(res) : res;
    } catch (jsErr) {
      if (jsErr instanceof ProgramEndSignal) throw jsErr;
      if (jsErr instanceof LispRuntimeError) {
        if (!jsErr.line) { jsErr.line = line; jsErr.col = col; }
        throw jsErr;
      }
      throw new LispRuntimeError(jsErr.message, line, col);
    }
  }
  throw new LispRuntimeError(`Unknown expression syntax: ${JSON.stringify(expr)}`, line, col);
}

function annotate(node, line, col) {
  if (Array.isArray(node) || typeof node === 'string') {
    node._line = line;
    node._col = col;
  }
  return node;
}

function expandMacros(expr) {
  if (!Array.isArray(expr)) return expr;
  const [op, ...args] = expr;
  const macroOp = typeof op === 'string' ? op.toUpperCase() : '';
  const line = expr._line || 0;
  const col = expr._col || 0;

  if (macroOp === 'LET') {
    const bindings = args[0];
    const body = args[1];
    const vars = bindings.map(b => b[0]);
    const vals = bindings.map(b => expandMacros(b[1]));
    return annotate([['LAMBDA', vars, expandMacros(body)], ...vals], line, col);
  }
  
  if (macroOp === 'IF') {
    const [condition, thenBranch, elseBranch = 'NIL'] = args;
    const condExpr = ['COND', [condition, thenBranch], ['T', elseBranch]];
    return expandMacros(annotate(condExpr, line, col));
  }

  return annotate(expr.map(expandMacros), line, col);
}

function parseAllLispExpressions(text) {
  // 1. Remove multi-line comments: #| ... |#
  let cleanText = text.replace(/#\|[\s\S]*?\|#/g, '');
  
  // 2. Remove single-line comments starting with # or ;
  const lines = cleanText.split('\n');
  const processedLines = lines.map(line => {
    let commentIdx = -1;
    let inString = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
        inString = !inString;
      }
      if (!inString && (char === ';' || char === '#')) {
        commentIdx = i;
        break;
      }
    }
    return commentIdx !== -1 ? line.substring(0, commentIdx) : line;
  });

  const finalCleanText = processedLines.join('\n');
  const tokenLines = finalCleanText.split('\n');
  const regex = /("[^"\\]*(?:\\.[^"\\]*)*"|,\@|`|,|'|\(|\)|[^\s()]+)/g;
  const tokens = [];

  tokenLines.forEach((line, idx) => {
    let match;
    while ((match = regex.exec(line)) !== null) {
      tokens.push({ value: match[0], line: idx + 1, col: match.index + 1 });
    }
  });

  if (tokens.length === 0) return [];

  let openParens = 0;
  let lastOpenTok = null;
  
  for (const tok of tokens) {
    if (tok.value === '(') {
      openParens++;
      lastOpenTok = tok;
    } else if (tok.value === ')') {
      openParens--;
      if (openParens < 0) {
        throw new Error(`Unmatched closing parenthesis ')' at line ${tok.line}, col ${tok.col}`);
      }
    }
  }
  
  if (openParens > 0 && lastOpenTok) {
    throw new Error(`Unclosed parenthesis '(' at line ${lastOpenTok.line}, col ${lastOpenTok.col}`);
  }

  let tokenIndex = 0;

  function parseTokens() {
    if (tokenIndex >= tokens.length) return null;
    const tokObj = tokens[tokenIndex++];
    const token = tokObj.value;
    const line = tokObj.line;
    const col = tokObj.col;

    let parsed;
    if (token === "'") {
      parsed = ['QUOTE', parseTokens()];
    } else if (token === '(') {
      const list = [];
      while (tokenIndex < tokens.length && tokens[tokenIndex].value !== ')') {
        list.push(parseTokens());
      }
      tokenIndex++;
      parsed = list;
    } else if (token === ')') {
      return null;
    } else {
      if (token.toUpperCase() === 'T') parsed = 'T';
      else if (token.toUpperCase() === 'NIL') parsed = 'NIL';
      else if (token.startsWith('"') && token.endsWith('"')) parsed = token;
      else parsed = isNaN(token) ? token : Number(token);
    }
    return annotate(parsed, line, col);
  }

  const expressions = [];
  while (tokenIndex < tokens.length) {
    const expr = parseTokens();
    if (expr !== null) expressions.push(expr);
  }
  return expressions;
}

const codeInput = document.getElementById('codeInput');

codeInput.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
    e.preventDefault();
    const val = codeInput.value;
    const lines = val.split('\n');
    const maxLines = lines.length;
    const cursorLoc = codeInput.selectionStart;
    let currentLine = 1;
    let lastNewlineIdx = -1;
    for (let i = 0; i < cursorLoc; i++) {
      if (val.charAt(i) === '\n') {
        currentLine++;
        lastNewlineIdx = i;
      }
    }
    const currentCol = cursorLoc - lastNewlineIdx;
    const promptMsg = `Current Line:Col -> ${currentLine}:${currentCol} | Max Lines -> ${maxLines}\nGo to line:column (e.g. 5:12):`;
    const input = prompt(promptMsg);
    if (!input) return;
    const parts = input.split(':');
    const targetLine = parseInt(parts[0], 10);
    const targetCol = parts.length > 1 ? parseInt(parts[1], 10) : 1;
    if (isNaN(targetLine) || targetLine < 1) return;
    let charIndex = 0;
    for (let i = 0; i < Math.min(targetLine - 1, lines.length); i++) {
      charIndex += lines[i].length + 1;
    }
    charIndex += Math.max(0, targetCol - 1);
    codeInput.focus();
    codeInput.setSelectionRange(charIndex, charIndex);
    return;
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    const start = codeInput.selectionStart;
    const end = codeInput.selectionEnd;
    const val = codeInput.value;
    const firstLineStart = val.lastIndexOf('\n', start - 1) + 1;
    let effectiveEnd = end;
    if (end > start && val.charAt(end - 1) === '\n') {
      effectiveEnd = end - 1;
    }
    let lastLineEnd = val.indexOf('\n', effectiveEnd);
    if (lastLineEnd === -1) lastLineEnd = val.length;
    const selectedBlock = val.substring(firstLineStart, lastLineEnd);
    const lines = selectedBlock.split('\n');
    const processedLines = lines.map(line => {
      if (e.shiftKey) {
        if (line.startsWith('  ')) return line.substring(2);
        if (line.startsWith(' ')) return line.substring(1);
        return line;
      } else {
        return '  ' + line;
      }
    });
    const replacement = processedLines.join('\n');
    codeInput.value = val.substring(0, firstLineStart) + replacement + val.substring(lastLineEnd);
    codeInput.setSelectionRange(firstLineStart, firstLineStart + replacement.length);
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    const start = codeInput.selectionStart;
    const end = codeInput.selectionEnd;
    const val = codeInput.value;
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    const currentLine = val.substring(lineStart, start);
    const match = currentLine.match(/^([ \t]*)/);
    const indent = match ? match[1] : '';
    const openExtra = (currentLine.match(/\(/g) || []).length > (currentLine.match(/\)/g) || []).length;
    const extraIndent = openExtra ? '  ' : '';
    const insertion = '\n' + indent + extraIndent;
    codeInput.value = val.substring(0, start) + insertion + val.substring(end);
    const newPos = start + insertion.length;
    codeInput.setSelectionRange(newPos, newPos);
  }
});

const runBtn = document.getElementById('runBtn');

function logToConsole(text, type) {
  if (type === 'output-err') console.error(text);
  else if (type === 'output-print') console.info(text);
  else console.log(text);
}
activeAppendOutput = logToConsole;

runBtn.addEventListener('click', function() {
  if (animationFrameId) {
    stopProgram();
    console.log("--- Program Stopped ---");
    return;
  }

  console.clear();
  console.log("--- Running SectorLISP Program ---");
  runBtn.textContent = 'STOP';
  runBtn.classList.add('running');
  
  try {
    const expressions = parseAllLispExpressions(codeInput.value);
    if (expressions.length === 0) {
      stopProgram();
      return;
    }

    let globalEnv = makeEnv({...baseEnv.bindings});

    for (const expr of expressions) {
      try {
        const rawResult = evaluate(expandMacros(expr), globalEnv);
        trampoline(rawResult);
      } catch (evalErr) {
        if (evalErr instanceof ProgramEndSignal) {
          return;
        }
        if (evalErr instanceof LispRuntimeError) {
          const loc = evalErr.line > 0 ? ` [Line ${evalErr.line}, Col ${evalErr.col}]` : '';
          logToConsole(`Error${loc}: ${evalErr.message}`, "output-err");
        } else {
          logToConsole(`Error: ${evalErr.message}`, "output-err");
        }
        stopProgram();
        return;
      }
    }

    let setupFn = null;
    try { setupFn = assoc(globalEnv, 'SETUP', 0, 0); } catch (e) {}

    if (setupFn) {
      try {
        trampoline(callClosure(setupFn, [], 0, 0));
      } catch (setupErr) {
        if (setupErr instanceof ProgramEndSignal) return;
        if (setupErr instanceof LispRuntimeError) {
          const loc = setupErr.line > 0 ? ` [Line ${setupErr.line}, Col ${setupErr.col}]` : '';
          logToConsole(`Setup Error${loc}: ${setupErr.message}`, "output-err");
        } else {
          logToConsole(`Setup Error: ${setupErr.message}`, "output-err");
        }
        stopProgram();
        return;
      }
    }

    let updateFn = null;
    try { updateFn = assoc(globalEnv, 'UPDATE', 0, 0); } catch (e) {}

    if (updateFn) {
      function loop() {
        try {
          trampoline(callClosure(updateFn, [], 0, 0));
        } catch (updateErr) {
          if (updateErr instanceof ProgramEndSignal) return;
          if (updateErr instanceof LispRuntimeError) {
            const loc = updateErr.line > 0 ? ` [Line ${updateErr.line}, Col ${updateErr.col}]` : '';
            logToConsole(`Update Error${loc}: ${updateErr.message}`, "output-err");
          } else {
            logToConsole(`Update Error: ${updateErr.message}`, "output-err");
          }
          stopProgram();
          return;
        }
        if (animationFrameId !== null) {
          animationFrameId = requestAnimationFrame(loop);
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    } else {
      stopProgram();
    }
  } catch (parseErr) {
    logToConsole(`Parsing Error: ${parseErr.message}`, "output-err");
    stopProgram();
  }
});