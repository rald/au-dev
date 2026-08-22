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
  if (!color) return defaultStr;
  let colStr = defaultStr;
  
  if (Array.isArray(color) && color[0] === 'COLOR') {
    const [, r, g, b, a = 255] = color;
    colStr = `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a / 255))})`;
  } else if (typeof color === 'string') {
    colStr = color;
    if (colStr.startsWith('"') && colStr.endsWith('"')) colStr = colStr.slice(1, -1);
  } else {
    colStr = lispToString(color);
    if (colStr.startsWith('"') && colStr.endsWith('"')) colStr = colStr.slice(1, -1);
  }
  return colStr;
}

function unescapeString(str) {
  return str
    .replace(/\\b/g, '\b')
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\v/g, '\v')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function drawText(str, x, y, colorStr) {
  let textStr = String(str);
  if (textStr.startsWith('"') && textStr.endsWith('"')) {
    textStr = unescapeString(textStr.slice(1, -1));
  }
  
  let startX = Math.floor(x);
  let cursorX = startX;
  let startY = Math.floor(y);
  ctx.fillStyle = colorStr;

  const CANVAS_WIDTH = 128;
  const CANVAS_HEIGHT = 128;

  for (let i = 0; i < textStr.length; i++) {
    const code = textStr.charCodeAt(i);
    
    if (code === 8) { // Backspace (\b) -> Move cursor back one character width (8px)
      cursorX = Math.max(startX, cursorX - 8);
      continue;
    }

    if (code === 13) { // Carriage Return (\r) -> Reset X to startX
      cursorX = startX;
      continue;
    }

    if (code === 10) { // Newline (\n) -> Move down one line and reset X
      cursorX = startX;
      startY += 8;
      continue;
    }
    
    if (code === 11) { // Vertical tab (\v) -> Move down one line without resetting X
      startY += 8;
      continue;
    }
    
    if (code === 9) { // Tab character support (\t) -> Advance by 4 spaces (32px)
      cursorX += 32;
      if (cursorX + 8 > CANVAS_WIDTH) {
        cursorX = startX;
        startY += 8;
      }
      continue;
    }
    
    if (cursorX + 8 > CANVAS_WIDTH) {
      cursorX = startX;
      startY += 8;
    }
    
    if (startY >= CANVAS_HEIGHT) {
      break;
    }

    if (startY + 8 > 0) {
      const charBitmap = DOS_FONT_8X8[code] || DOS_FONT_8X8[32];
      for (let row = 0; row < 8; row++) {
        const rowByte = charBitmap[row];
        for (let col = 0; col < 8; col++) {
          if ((rowByte & (1 << (7 - col))) !== 0) {
            const px = cursorX + col;
            const py = startY + row;
            if (px >= 0 && px < CANVAS_WIDTH && py >= 0 && py < CANVAS_HEIGHT) {
              ctx.fillRect(px, py, 1, 1);
            }
          }
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

const codeInput = document.getElementById('codeInput');

// --- KEYBOARD HANDLING STATE & LISTENERS ---
const activeKeys = new Set();
const keyPressedEvents = [];
const keyReleasedEvents = [];

window.addEventListener('keydown', (e) => {
  if (document.activeElement === codeInput) {
    return;
  }

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    e.preventDefault();
  }
  const key = e.key.toLowerCase();
  if (!activeKeys.has(key)) {
    keyPressedEvents.push(key);
  }
  activeKeys.add(key);
});

window.addEventListener('keyup', (e) => {
  if (document.activeElement === codeInput) {
    return;
  }

  const key = e.key.toLowerCase();
  activeKeys.delete(key);
  keyReleasedEvents.push(key);
});

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
  activeKeys.clear();
  keyPressedEvents.length = 0;
  keyReleasedEvents.length = 0;
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

// Global reference for active environment bindings access during dynamic execution
let globalEnv = null;

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
  'mod': (a, b) => a % b,
  'abs': (a) => Math.abs(a),
  'sgn': (a) => a < 0 ? -1 : (a > 0 ? 1 : 0),
  'max': (...args) => Math.max(...args),
  'min': (...args) => Math.min(...args),
  'random': () => Math.random(),
  'time': () => Date.now(),
  'clock': () => performance.now(),
  'trunc': (a) => Math.trunc(a),
  'floor': (a) => Math.floor(a),
  'ceil': (a) => Math.ceil(a),
  'round': (a) => Math.round(a),
  'bitand': (a, b) => a & b,
  'bitor': (a, b) => a | b,
  'bitxor': (a, b) => a ^ b,
  'bitnot': (a) => ~a,
  'shl': (a, b) => a << b,
  'shr': (a, b) => a >> b,

  // Async Load Primitive[cite: 1]
  'load': async (urlExpr) => {
    let url = lispToString(urlExpr);
    if (url.startsWith('"') && url.endsWith('"')) {
      url = url.slice(1, -1);
    }
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new LispRuntimeError(`Failed to fetch script from URL: ${url}`);
      }
      const codeText = await response.text();
      const expressions = parseAllLispExpressions(codeText);
      
      let lastResult = 'NIL';
      for (const expr of expressions) {
        const rawResult = evaluate(expandMacros(expr), globalEnv);
        lastResult = trampoline(rawResult);
      }
      return lastResult;
    } catch (err) {
      throw new LispRuntimeError(err.message);
    }
  },

  // Character code primitives
  'ord': (str) => {
    let s = lispToString(str);
    if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
    return s.length > 0 ? s.charCodeAt(0) : 0;
  },
  'chr': (code) => {
    const c = Math.floor(code);
    return `"${unescapeString(String.fromCharCode(c))}"`;
  },

  // Keyboard primitives
  'key-down?': (keyStr) => {
    let key = lispToString(keyStr).toLowerCase();
    if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
    return activeKeys.has(key) ? 'T' : 'NIL';
  },
  'key-pressed?': (keyStr) => {
    let key = lispToString(keyStr).toLowerCase();
    if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
    const index = keyPressedEvents.indexOf(key);
    if (index !== -1) {
      keyPressedEvents.splice(index, 1);
      return 'T';
    }
    return 'NIL';
  },
  'key-released?': (keyStr) => {
    let key = lispToString(keyStr).toLowerCase();
    if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
    const index = keyReleasedEvents.indexOf(key);
    if (index !== -1) {
      keyReleasedEvents.splice(index, 1);
      return 'T';
    }
    return 'NIL';
  },

  'color': (r, g, b, a = 255) => {
    const rc = Math.max(0, Math.min(255, Math.floor(r)));
    const gc = Math.max(0, Math.min(255, Math.floor(g)));
    const bc = Math.max(0, Math.min(255, Math.floor(b)));
    const ac = Math.max(0, Math.min(1, a / 255));
    return ['COLOR', rc, gc, bc, a];
  },

  'cls': (color) => {
    const resolvedColor = color !== undefined ? color : ['COLOR', 0, 0, 0, 255];
    clearScreen(parseColor(resolvedColor, '#000000'));
    return 'T';
  },

  'pset': (x, y, color) => {
    pset(x, y, parseColor(color, '#ffffff'));
    return 'T';
  },
  'pget': (x, y) => pget(x, y),

  'text': (str, x, y, color) => {
    let textStr = lispToString(str);
    drawText(textStr, x, y, parseColor(color, '#ffffff'));
    return 'T';
  },

  'putch': (asciiCode, x, y, color) => {
    const code = Math.floor(asciiCode);
    const startX = Math.floor(x);
    const startY = Math.floor(y);
    const colorStr = parseColor(color, '#ffffff');
    const CANVAS_WIDTH = 128;
    const CANVAS_HEIGHT = 128;

    if (startY + 8 > 0 && startY < CANVAS_HEIGHT) {
      const charBitmap = DOS_FONT_8X8[code] || DOS_FONT_8X8[32];
      ctx.fillStyle = colorStr;
      for (let row = 0; row < 8; row++) {
        const rowByte = charBitmap[row];
        for (let col = 0; col < 8; col++) {
          if ((rowByte & (1 << (7 - col))) !== 0) {
            const px = startX + col;
            const py = startY + row;
            if (px >= 0 && px < CANVAS_WIDTH && py >= 0 && py < CANVAS_HEIGHT) {
              ctx.fillRect(px, py, 1, 1);
            }
          }
        }
      }
    }
    return 'T';
  },

  'line': (x1, y1, x2, y2, color) => {
    drawBresenhamLine(x1, y1, x2, y2, parseColor(color, '#ffffff'));
    return 'T';
  },
  'rect': (x, y, w, h, color) => {
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
  'frect': (x, y, w, h, color) => {
    ctx.fillStyle = parseColor(color, '#ffffff');
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
    return 'T';
  },
  'circ': (x, y, r, color) => {
    drawBresenhamCircle(x, y, r, parseColor(color, '#ffffff'), false);
    return 'T';
  },
  'fcirc': (x, y, r, color) => {
    drawBresenhamCircle(x, y, r, parseColor(color, '#ffffff'), true);
    return 'T';
  },

  'end': () => {
    stopProgram();
    throw new ProgramEndSignal();
  },

  '<': (a, b) => a < b ? 'T' : 'NIL',
  '>': (a, b) => a > b ? 'T' : 'NIL',
  '<=': (a, b) => a <= b ? 'T' : 'NIL',
  '>=': (a, b) => a >= b ? 'T' : 'NIL',
  '=': (a, b) => a === b ? 'T' : 'NIL',
  'eq': (a, b) => (a === b || (String(a) === 'NIL' && String(b) === 'NIL')) ? 'T' : 'NIL',
  'not': (x) => (x === 'NIL') ? 'T' : 'NIL',
  'atom': (x) => (!Array.isArray(x) || x === 'NIL' || x.length === 0) ? 'T' : 'NIL',
  'null': (x) => (x === 'NIL' || (Array.isArray(x) && x.length === 0)) ? 'T' : 'NIL',
  'numberp': (x) => typeof x === 'number' ? 'T' : 'NIL',
  'symbolp': (x) => (typeof x === 'string' && !x.startsWith('"')) ? 'T' : 'NIL',
  'listp': (x) => Array.isArray(x) ? 'T' : 'NIL',
  'car': (x) => x[0],
  'cdr': (x) => x.slice(1),
  'cons': (x, y) => [x, ...(Array.isArray(y) && y !== 'NIL' ? y : [y])],
  'list': (...args) => args.length === 0 ? 'NIL' : args,
  
  'len': (x) => {
    if (x === 'NIL' || x === null || (Array.isArray(x) && x.length === 0)) return 0;
    if (Array.isArray(x)) return x.length;
    if (typeof x === 'string') {
      let str = x;
      if (str.startsWith('"') && str.endsWith('"')) {
        str = str.slice(1, -1);
      }
      return unescapeString(str).length;
    }
    return 0;
  },

  'list-push-back': (lst, item) => {
    const arr = (lst === 'NIL' || !Array.isArray(lst)) ? [] : [...lst];
    arr.push(item);
    return arr;
  },
  'list-push-front': (lst, item) => {
    const arr = (lst === 'NIL' || !Array.isArray(lst)) ? [] : [...lst];
    arr.unshift(item);
    return arr;
  },
  'list-pop-back': (lst) => {
    if (!Array.isArray(lst) || lst.length === 0 || lst === 'NIL') return 'NIL';
    const arr = [...lst];
    arr.pop();
    return arr.length === 0 ? 'NIL' : arr;
  },
  'list-pop-front': (lst) => {
    if (!Array.isArray(lst) || lst.length === 0 || lst === 'NIL') return 'NIL';
    const arr = [...lst];
    arr.shift();
    return arr.length === 0 ? 'NIL' : arr;
  },
  'list-push-at': (lst, index, item) => {
    const arr = (lst === 'NIL' || !Array.isArray(lst)) ? [] : [...lst];
    arr.splice(index, 0, item);
    return arr;
  },
  'list-pop-at': (lst, index) => {
    if (!Array.isArray(lst) || lst === 'NIL') return 'NIL';
    const arr = [...lst];
    arr.splice(index, 1);
    return arr.length === 0 ? 'NIL' : arr;
  },
  'list-get': (lst, index) => {
    if (!Array.isArray(lst) || lst === 'NIL' || index < 0 || index >= lst.length) return 'NIL';
    return lst[index];
  },
  'list-set': (lst, index, item) => {
    if (!Array.isArray(lst) || lst === 'NIL' || index < 0 || index >= lst.length) return lst;
    const arr = [...lst];
    arr[index] = item;
    return arr;
  },
  'list-contains': function deepContains(lst, item) {
    if (!Array.isArray(lst) || lst === 'NIL') return 'NIL';
    for (const elem of lst) {
      if (elem === item) return 'T';
      if (Array.isArray(elem) && Array.isArray(item)) {
        if (deepContains(elem, item) === 'T') return 'T';
      }
    }
    return 'NIL';
  },
  'list-index-of': (lst, item) => {
    if (!Array.isArray(lst) || lst === 'NIL') return -1;
    const idx = lst.findIndex(elem => elem === item);
    return idx !== -1 ? idx : -1;
  },
  'list-flatten': function deepFlatten(lst) {
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

  'append': (...lists) => {
    let result = [];
    for (const lst of lists) {
      if (lst !== 'NIL' && Array.isArray(lst)) {
        result = result.concat(lst);
      }
    }
    return result.length === 0 ? 'NIL' : result;
  },
  'equal': function deepEqual(a, b) {
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
  'error': (msg) => { throw new LispRuntimeError(msg); },
  'clear-log': () => {
    console.clear();
    return 'T';
  },
  'print': (...args) => {
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
      const [, closureEnv, name, lambdaExpr] = fnVal;
      const recursiveBindings = {};
      recursiveBindings[name] = fnVal;
      const recursiveEnv = makeEnv(recursiveBindings, closureEnv);
      if (lambdaExpr[0] === 'lambda') {
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

    if (op === 'quote') return args[0];
    if (op === 'not') return evaluate(args[0], env) === 'NIL' ? 'T' : 'NIL';
    if (op === 'and') {
      let res = 'T';
      for (const arg of args) {
        res = evaluate(arg, env);
        if (res === 'NIL') return 'NIL';
      }
      return res;
    }
    if (op === 'or') {
      for (const arg of args) {
        const res = evaluate(arg, env);
        if (res !== 'NIL') return res;
      }
      return 'NIL';
    }
    if (op === 'cond') {
      for (const clause of args) {
        const [condition, result] = clause;
        if (evaluate(condition, env) !== 'NIL') return evaluate(result, env);
      }
      return 'NIL';
    }
    
    if (op === 'while') {
      const [condition, ...body] = args;
      let lastRes = 'NIL';
      while (evaluate(condition, env) !== 'NIL') {
        for (const stmt of body) {
          lastRes = evaluate(stmt, env);
        }
      }
      return lastRes;
    }

    if (op === 'label') {
      return ['LABEL', env, args[0], args[1]];
    }
    if (op === 'lambda') return ['CLOSURE', env, args[0], args[1]];
    if (op === 'begin') {
      let lastResult = 'NIL';
      for (let i = 0; i < args.length; i++) {
        if (i === args.length - 1) return evaluate(args[i], env);
        lastResult = evaluate(args[i], env);
      }
      return lastResult;
    }
    if (op === 'define') return defineVar(env, args[0], evaluate(args[1], env));
    if (op === 'set!') return setVar(env, args[0], evaluate(args[1], env), line, col);

    const evaluatedOp = evaluate(op, env);
    const evaluatedArgs = args.map(arg => evaluate(arg, env));

    try {
      const res = callClosure(evaluatedOp, evaluatedArgs, line, col);
      
      // Handle asynchronous Promise returns (e.g. from fetch-based 'load')
      if (res instanceof Promise) {
        return res.then(val => trampoline(val)).catch(jsErr => {
          if (jsErr instanceof LispRuntimeError) throw jsErr;
          throw new LispRuntimeError(jsErr.message, line, col);
        });
      }

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
  const macroOp = typeof op === 'string' ? op : '';
  const line = expr._line || 0;
  const col = expr._col || 0;

  if (macroOp === 'let') {
    const bindings = args[0];
    const body = args[1];
    const vars = bindings.map(b => b[0]);
    const vals = bindings.map(b => expandMacros(b[1]));
    return annotate([['lambda', vars, expandMacros(body)], ...vals], line, col);
  }
  
  if (macroOp === 'if') {
    const [condition, thenBranch, elseBranch = 'NIL'] = args;
    const condExpr = ['cond', [condition, thenBranch], ['T', elseBranch]];
    return expandMacros(annotate(condExpr, line, col));
  }

  return annotate(expr.map(expandMacros), line, col);
}

function parseAllLispExpressions(text) {
  let cleanText = text.replace(/#\|[\s\S]*?\|#/g, '');
  
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
      parsed = ['quote', parseTokens()];
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

codeInput.addEventListener('click', function() {
  codeInput.focus();
});

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

    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = val.indexOf('\n', end - 1);
    if (lineEnd === -1) lineEnd = val.length;

    const selectedText = val.substring(lineStart, lineEnd);

    if (e.shiftKey) {
      const lines = selectedText.split('\n');
      let totalRemoved = 0;
      const updatedLines = lines.map((line, idx) => {
        const match = line.match(/^( {1,2})/);
        if (match) {
          const removed = match[1].length;
          if (idx === 0) totalRemoved = removed;
          return line.substring(removed);
        }
        return line;
      });

      const updatedText = updatedLines.join('\n');
      codeInput.value = val.substring(0, lineStart) + updatedText + val.substring(lineEnd);
      
      const newStart = Math.max(lineStart, start - totalRemoved);
      const newEnd = Math.max(newStart, end - (selectedText.length - updatedText.length));
      codeInput.setSelectionRange(newStart, newEnd);

    } else {
      if (start === end) {
        codeInput.value = val.substring(0, start) + '  ' + val.substring(end);
        codeInput.setSelectionRange(start + 2, start + 2);
      } else {
        const lines = selectedText.split('\n');
        const updatedLines = lines.map(line => '  ' + line);
        const updatedText = updatedLines.join('\n');

        codeInput.value = val.substring(0, lineStart) + updatedText + val.substring(lineEnd);
        codeInput.setSelectionRange(lineStart, lineStart + updatedText.length);
      }
    }
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

runBtn.addEventListener('click', async function() {
  if (animationFrameId) {
    stopProgram();
    console.log("--- Program Stopped ---");
    return;
  }

  console.clear();
  console.log("--- Running AuLisp Program ---");
  runBtn.textContent = 'STOP';
  runBtn.classList.add('running');
  
  try {
    const codeContent = codeInput.value;
    const expressions = parseAllLispExpressions(codeContent);
    if (expressions.length === 0) {
      stopProgram();
      return;
    }

    globalEnv = makeEnv({...baseEnv.bindings});

    for (const expr of expressions) {
      try {
        let rawResult = evaluate(expandMacros(expr), globalEnv);
        if (rawResult instanceof Promise) {
          rawResult = await rawResult;
        }
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
    try { setupFn = assoc(globalEnv, 'setup', 0, 0); } catch (e) {}

    if (setupFn) {
      try {
        let setupRes = callClosure(setupFn, [], 0, 0);
        if (setupRes instanceof Promise) setupRes = await setupRes;
        trampoline(setupRes);
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
    try { updateFn = assoc(globalEnv, 'update', 0, 0); } catch (e) {}

    if (updateFn) {
      let lastTime = performance.now();

      function loop(currentTime) {
        const dt = (currentTime - lastTime) / 1000.0;
        lastTime = currentTime;

        try {
          const updateRes = callClosure(updateFn, [dt], 0, 0);
          if (updateRes instanceof Promise) {
            updateRes.then(res => trampoline(res)).catch(updateErr => {
              if (!(updateErr instanceof ProgramEndSignal)) {
                logToConsole(`Update Error: ${updateErr.message}`, "output-err");
                stopProgram();
              }
            });
          } else {
            trampoline(updateRes);
          }
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

      animationFrameId = requestAnimationFrame((timestamp) => {
        lastTime = timestamp;
        animationFrameId = requestAnimationFrame(loop);
      });
    } else {
      stopProgram();
    }
  } catch (parseErr) {
    logToConsole(`Parsing Error: ${parseErr.message}`, "output-err");
    stopProgram();
  }
});