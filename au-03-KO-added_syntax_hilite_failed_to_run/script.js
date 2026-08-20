// --- Canvas & Captured Input State Setup ---
const canvas = document.getElementById('vmCanvas');
const ctx = canvas.getContext('2d');
const WIDTH = 128;
const HEIGHT = 128;

let mouseX = WIDTH / 2;
let mouseY = HEIGHT / 2;

const mouseButtons = {};
const keys = {};

canvas.addEventListener('click', () => {
    canvas.focus();
    if (canvas.requestPointerLock) {
        canvas.requestPointerLock();
    }
});

document.addEventListener('mousemove', e => {
    if (document.pointerLockElement === canvas) {
        mouseX = Math.max(0, Math.min(WIDTH - 1, mouseX + e.movementX * 0.5));
        mouseY = Math.max(0, Math.min(HEIGHT - 1, mouseY + e.movementY * 0.5));
    } else {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;
        if (clientX >= 0 && clientX <= rect.width && clientY >= 0 && clientY <= rect.height) {
            mouseX = Math.floor(clientX * (WIDTH / rect.width));
            mouseY = Math.floor(clientY * (HEIGHT / rect.height));
        }
    }
});

// --- Custom Error System ---
class LispError extends Error {
    constructor(message, line = 1, col = 1, type = 'Error') {
        super(message);
        this.name = type;
        this.line = line;
        this.col = col;
    }
    toString() {
        return `[${this.name}] Line ${this.line}, Col ${this.col}: ${this.message}`;
    }
}

class LispSyntaxError extends LispError {
    constructor(message, line, col) {
        super(message, line, col, 'SyntaxError');
    }
}

class LispRuntimeError extends LispError {
    constructor(message, line, col) {
        super(message, line, col, 'RuntimeError');
    }
}

class LispArityError extends LispError {
    constructor(message, line, col) {
        super(message, line, col, 'ArityError');
    }
}

// --- Syntax Highlighting Engine ---
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function highlightAuCode(code) {
    const keywords = new Set(['if', 'define', 'lambda', 'begin', 'while', 'and', 'or', 'not', 'quote', 'set!']);
    const builtins = new Set([
        '+', '-', '*', '/', '<', '>', '<=', '>=', '=', '/=', 'mod', 'abs', 'sgn', 
        'exit', 'atom', 'eq', 'car', 'cdr', 'cons', 'list', 'cls', 'pset', 'line', 
        'rect', 'frect', 'circ', 'fcirc', 'pget', 'rand', 'time', 'clock', 
        'mouse-x', 'mouse-y', 'mouse-btn', 'key?', 'print', 'setup', 'update'
    ]);

    let html = '';
    let i = 0;
    const len = code.length;

    while (i < len) {
        let char = code[i];

        if (char === ';' || (char === '#' && code[i+1] !== '|')) {
            let start = i;
            while (i < len && code[i] !== '\n') i++;
            html += `<span class="hl-comment">${escapeHtml(code.substring(start, i))}</span>`;
            continue;
        }

        if (char === '#' && code[i+1] === '|') {
            let start = i;
            i += 2;
            while (i < len) {
                if (code[i] === '|' && code[i+1] === '#') {
                    i += 2;
                    break;
                }
                i++;
            }
            html += `<span class="hl-comment">${escapeHtml(code.substring(start, i))}</span>`;
            continue;
        }

        if (char === '"') {
            let start = i;
            i++;
            while (i < len) {
                if (code[i] === '\\' && i + 1 < len) { i += 2; continue; }
                if (code[i] === '"') { i++; break; }
                i++;
            }
            html += `<span class="hl-string">${escapeHtml(code.substring(start, i))}</span>`;
            continue;
        }

        if (/\s/.test(char)) {
            html += escapeHtml(char);
            i++;
            continue;
        }

        if (char === '(' || char === ')' || char === "'") {
            html += `<span class="hl-symbol">${escapeHtml(char)}</span>`;
            i++;
            continue;
        }

        let start = i;
        while (i < len && !/\s/.test(code[i]) && code[i] !== '(' && code[i] !== ')' && code[i] !== '"' && code[i] !== ';') {
            i++;
        }
        let word = code.substring(start, i);
        
        if (!isNaN(Number(word)) && word !== '') {
            html += `<span class="hl-number">${escapeHtml(word)}</span>`;
        } else if (keywords.has(word)) {
            html += `<span class="hl-keyword">${escapeHtml(word)}</span>`;
        } else if (builtins.has(word)) {
            html += `<span class="hl-builtin">${escapeHtml(word)}</span>`;
        } else {
            html += escapeHtml(word);
        }
    }
    return html + (code.endsWith('\n') ? '<br>' : '');
}

// --- Textarea Custom Handlers (Highlighting, Auto-Indent, Multi-line Tab) ---
const textarea = document.getElementById('code-input');
const backdrop = document.getElementById('editor-backdrop');

function updateEditorView() {
    backdrop.innerHTML = highlightAuCode(textarea.value);
}

textarea.addEventListener('input', updateEditorView);
textarea.addEventListener('scroll', () => {
    backdrop.scrollTop = textarea.scrollTop;
    backdrop.scrollLeft = textarea.scrollLeft;
});

textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;

        const lineStart = val.lastIndexOf('\n', start - 1) + 1;
        const currentLineSlice = val.substring(lineStart, start);
        
        const match = currentLineSlice.match(/^([ \t]*)/);
        let indent = match ? match[1] : '';

        const trimmedBeforeCursor = currentLineSlice.trimEnd();
        if (trimmedBeforeCursor.endsWith('(')) {
            indent += '    ';
        }

        const replacement = '\n' + indent;
        textarea.value = val.substring(0, start) + replacement + val.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + replacement.length;
        updateEditorView();
    }

    if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;

        if (start !== end) {
            const firstLineStart = val.lastIndexOf('\n', start - 1) + 1;
            let lastLineEnd = val.indexOf('\n', end);
            if (lastLineEnd === -1) lastLineEnd = val.length;

            const selectedBlock = val.substring(firstLineStart, lastLineEnd);
            const lines = selectedBlock.split('\n');

            let modifiedLines;
            let totalShift = 0;

            if (e.shiftKey) {
                modifiedLines = lines.map(line => {
                    const match = line.match(/^( {1,4})/);
                    if (match) {
                        totalShift += match[1].length;
                        return line.substring(match[1].length);
                    }
                    return line;
                });
                textarea.value = val.substring(0, firstLineStart) + modifiedLines.join('\n') + val.substring(lastLineEnd);
                textarea.selectionStart = start - (start > firstLineStart ? Math.min(4, start - firstLineStart) : 0);
                textarea.selectionEnd = Math.max(textarea.selectionStart, end - totalShift);
            } else {
                modifiedLines = lines.map(line => '    ' + line);
                totalShift = lines.length * 4;
                textarea.value = val.substring(0, firstLineStart) + modifiedLines.join('\n') + val.substring(lastLineEnd);
                textarea.selectionStart = start + 4;
                textarea.selectionEnd = end + totalShift;
            }
        } else {
            if (e.shiftKey) {
                const lineStart = val.lastIndexOf('\n', start - 1) + 1;
                const lineSlice = val.substring(lineStart, start);
                const match = lineSlice.match(/^( {1,4})/);
                if (match) {
                    const spacesToRemove = match[1].length;
                    textarea.value = val.substring(0, lineStart) + val.substring(lineStart + spacesToRemove);
                    textarea.selectionStart = textarea.selectionEnd = Math.max(lineStart, start - spacesToRemove);
                }
            } else {
                textarea.value = val.substring(0, start) + '    ' + val.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + 4;
            }
        }
        updateEditorView();
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        const textUpToCursor = textarea.value.substring(0, textarea.selectionStart);
        const lines = textUpToCursor.split('\n');
        const currentLine = lines.length;
        const currentCol = lines[lines.length - 1].length + 1;
        const totalLines = textarea.value.split('\n').length;

        const input = prompt(`Current: Line ${currentLine}, Col ${currentCol} | Total Lines: ${totalLines}\nGo to line:column (e.g. 5:12):`);
        
        if (input) {
            const parts = input.split(':');
            const targetLine = parseInt(parts[0], 10);
            const targetCol = parts[1] ? parseInt(parts[1], 10) : 1;

            if (!isNaN(targetLine) && targetLine > 0) {
                const allLines = textarea.value.split('\n');
                let charIndex = 0;
                
                for (let i = 0; i < Math.min(targetLine - 1, allLines.length); i++) {
                    charIndex += allLines[i].length + 1;
                }
                
                charIndex += Math.max(0, targetCol - 1);
                textarea.focus();
                textarea.setSelectionRange(charIndex, charIndex);
            }
        }
    }
});

window.addEventListener('keydown', e => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    keys[e.key.toLowerCase()] = true;
    keys[e.code] = true;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
    }
});

window.addEventListener('keyup', e => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    keys[e.key.toLowerCase()] = false;
    keys[e.code] = false;
});

window.addEventListener('mousedown', e => {
    if (document.pointerLockElement === canvas || e.target === canvas) {
        mouseButtons[e.button] = true;
    }
});

window.addEventListener('mouseup', e => {
    mouseButtons[e.button] = false;
});

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function clearCanvas(colorIndex = 0) {
    const cIdx = Math.floor(colorIndex) % PALETTE.length;
    ctx.fillStyle = PALETTE[cIdx < 0 ? 0 : cIdx];
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function setPixel(x, y, colorIndex) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi >= 0 && xi < WIDTH && yi >= 0 && yi < HEIGHT) {
        const cIdx = Math.floor(colorIndex) % PALETTE.length;
        ctx.fillStyle = PALETTE[cIdx < 0 ? 0 : cIdx];
        ctx.fillRect(xi, yi, 1, 1);
    }
}

function drawBresenhamLine(x0, y0, x1, y1, colorIndex) {
    let ix0 = Math.floor(x0);
    let iy0 = Math.floor(y0);
    const ix1 = Math.floor(x1);
    const iy1 = Math.floor(y1);

    const dx = Math.abs(ix1 - ix0);
    const dy = Math.abs(iy1 - iy0);
    const sx = (ix0 < ix1) ? 1 : -1;
    const sy = (iy0 < iy1) ? 1 : -1;
    let err = dx - dy;

    while (true) {
        setPixel(ix0, iy0, colorIndex);
        if (ix0 === ix1 && iy0 === iy1) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            ix0 += sx;
        }
        if (e2 < dx) {
            err += dx;
            iy0 += sy;
        }
    }
}

function drawRect(x, y, w, h, colorIndex) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iw = Math.floor(w);
    const ih = Math.floor(h);
    drawBresenhamLine(ix, iy, ix + iw, iy, colorIndex);
    drawBresenhamLine(ix + iw, iy, ix + iw, iy + ih, colorIndex);
    drawBresenhamLine(ix + iw, iy + ih, ix, iy + ih, colorIndex);
    drawBresenhamLine(ix, iy + ih, ix, iy, colorIndex);
}

function drawFilledRect(x, y, w, h, colorIndex) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iw = Math.floor(w);
    const ih = Math.floor(h);
    for (let dy = 0; dy <= ih; dy++) {
        for (let dx = 0; dx <= iw; dx++) {
            setPixel(ix + dx, iy + dy, colorIndex);
        }
    }
}

function drawCircle(xc, yc, r, colorIndex) {
    let x = 0;
    let y = Math.floor(r);
    let d = 3 - 2 * r;
    const ix = Math.floor(xc);
    const iy = Math.floor(yc);

    const plotSymmetric = (cx, cy, px, py, c) => {
        setPixel(cx + px, cy + py, c);
        setPixel(cx - px, cy + py, c);
        setPixel(cx + px, cy - py, c);
        setPixel(cx - px, cy - py, c);
        setPixel(cx + py, cy + px, c);
        setPixel(cx - py, cy + px, c);
        setPixel(cx + py, cy - px, c);
        setPixel(cx - py, cy - px, c);
    };

    plotSymmetric(ix, iy, x, y, colorIndex);
    while (y >= x) {
        x++;
        if (d > 0) {
            y--;
            d = d + 4 * (x - y) + 10;
        } else {
            d = d + 4 * x + 6;
        }
        plotSymmetric(ix, iy, x, y, colorIndex);
    }
}

function drawFilledCircle(xc, yc, r, colorIndex) {
    let x = 0;
    let y = Math.floor(r);
    let d = 3 - 2 * r;
    const ix = Math.floor(xc);
    const iy = Math.floor(yc);

    const drawHorizontalLine = (x1, x2, yCoord, c) => {
        for (let px = x1; px <= x2; px++) setPixel(px, yCoord, c);
    };

    const fillSymmetric = (cx, cy, px, py, c) => {
        drawHorizontalLine(cx - px, cx + px, cy + py, c);
        drawHorizontalLine(cx - px, cx + px, cy - py, c);
        drawHorizontalLine(cx - py, cx + py, cy + px, c);
        drawHorizontalLine(cx - py, cx + py, cy - px, c);
    };

    fillSymmetric(ix, iy, x, y, colorIndex);
    while (y >= x) {
        x++;
        if (d > 0) {
            y--;
            d = d + 4 * (x - y) + 10;
        } else {
            d = d + 4 * x + 6;
        }
        fillSymmetric(ix, iy, x, y, colorIndex);
    }
}

function getPixel(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi >= 0 && xi < WIDTH && yi >= 0 && yi < HEIGHT) {
        const pixelData = ctx.getImageData(xi, yi, 1, 1).data;
        return PALETTE.indexOf(rgbToHex(pixelData[0], pixelData[1], pixelData[2]));
    }
    return -1;
}

clearCanvas(0);

function logToConsole(...messages) {
    const outputEl = document.getElementById('output');
    const text = messages.map(m => Array.isArray(m) ? '(' + m.join(' ') + ')' : String(m)).join(' ');
    outputEl.style.color = '#a7f070';
    outputEl.textContent += (outputEl.textContent ? '\n' : '') + text;
    outputEl.scrollTop = outputEl.scrollHeight;
}

// --- Position-Aware Tokenizer & Parser ---
function tokenize(input) {
    const tokens = [];
    let line = 1;
    let col = 1;
    let i = 0;

    while (i < input.length) {
        let char = input[i];

        if (char === '\n') {
            line++;
            col = 1;
            i++;
            continue;
        }

        if (/\s/.test(char)) {
            col++;
            i++;
            continue;
        }

        if (char === '#' && i + 1 < input.length && input[i + 1] === '|') {
            i += 2;
            col += 2;
            while (i < input.length) {
                if (input[i] === '\n') {
                    line++;
                    col = 1;
                } else {
                    col++;
                }
                if (input[i] === '|' && i + 1 < input.length && input[i + 1] === '#') {
                    i += 2;
                    col += 2;
                    break;
                }
                i++;
            }
            continue;
        }

        if (char === ';' || char === '#') {
            while (i < input.length && input[i] !== '\n') {
                i++;
            }
            continue;
        }

        if (char === '"') {
            const startLine = line;
            const startCol = col;
            i++;
            col++;
            let strVal = '';
            
            while (i < input.length && input[i] !== '"') {
                if (input[i] === '\\' && i + 1 < input.length) {
                    i++;
                    col++;
                    const nextChar = input[i];
                    if (nextChar === 'n') strVal += '\n';
                    else if (nextChar === 't') strVal += '\t';
                    else if (nextChar === '"') strVal += '"';
                    else if (nextChar === '\\') strVal += '\\';
                    else strVal += nextChar;
                } else {
                    if (input[i] === '\n') { line++; col = 1; }
                    else { col++; }
                    strVal += input[i];
                }
                i++;
            }
            if (i < input.length) { i++; col++; }
            tokens.push({ type: 'ATOM', value: `__STR__${btoa(strVal)}`, line: startLine, col: startCol });
            continue;
        }

        if (char === '\'' || char === '(' || char === ')') {
            tokens.push({ type: char, value: char, line, col });
            col++;
            i++;
            continue;
        }

        const startLine = line;
        const startCol = col;
        let atomVal = '';
        while (i < input.length && !/\s/.test(input[i]) && input[i] !== '(' && input[i] !== ')' && input[i] !== '\'') {
            atomVal += input[i];
            col++;
            i++;
        }
        tokens.push({ type: 'ATOM', value: atomVal, line: startLine, col: startCol });
    }
    return tokens;
}

function parse(tokens) {
    if (tokens.length === 0) throw new LispSyntaxError('Unexpected EOF while reading', 1, 1);
    const token = tokens.shift();
    
    if (token.value === "'") {
        return ['quote', parse(tokens)];
    }

    if (token.value === '(') {
        const startLine = token.line;
        const startCol = token.col;
        const list = [];
        while (tokens.length > 0 && tokens[0].value !== ')') {
            list.push(parse(tokens));
        }
        if (tokens.length === 0) {
            throw new LispSyntaxError('Missing closing parenthesis', startLine, startCol);
        }
        tokens.shift();
        list.line = startLine;
        list.col = startCol;
        return list;
    } else if (token.value === ')') {
        throw new LispSyntaxError('Unexpected closing parenthesis', token.line, token.col);
    } else {
        return parseAtom(token);
    }
}

function parseAtom(token) {
    const val = token.value;
    if (val.startsWith('__STR__')) {
        return atob(val.slice(7));
    }
    if (val === "t") return true;
    if (val === "nil" || val === "NIL") return [];
    if (!isNaN(Number(val))) return Number(val);
    return val;
}

class Environment {
    constructor(bindings = {}, outer = null) {
        this.bindings = bindings;
        this.outer = outer;
    }
    find(variable, line = 1, col = 1) {
        if (variable in this.bindings) return this;
        if (this.outer) return this.outer.find(variable, line, col);
        throw new LispRuntimeError(`Unbound symbol: ${variable}`, line, col);
    }
    set(variable, value) {
        this.bindings[variable] = value;
    }
    update(variable, value, line = 1, col = 1) {
        try {
            const env = this.find(variable, line, col);
            env.bindings[variable] = value;
            return value;
        } catch (e) {
            throw new LispRuntimeError(`Cannot set! unbound symbol: ${variable}`, line, col);
        }
    }
}

function evaluate(exp, env) {
    const line = exp && exp.line ? exp.line : 1;
    const col = exp && exp.col ? exp.col : 1;

    if (typeof exp === 'number') return exp;
    if (typeof exp === 'boolean') return exp;
    if (typeof exp === 'string') {
        if (env) {
            try {
                return env.find(exp, line, col).bindings[exp];
            } catch (e) {
                return exp;
            }
        }
        return exp;
    }
    if (exp === null || exp.length === 0) return [];

    const head = exp[0];

    if (head === 'quote') return exp[1];
    if (head === 'if') {
        const [, condition, thenExpr, elseExpr] = exp;
        if (evaluate(condition, env)) {
            return evaluate(thenExpr, env);
        } else {
            return elseExpr !== undefined ? evaluate(elseExpr, env) : [];
        }
    }
    if (head === 'and') {
        let res = true;
        for (let i = 1; i < exp.length; i++) {
            res = evaluate(exp[i], env);
            if (!res) return res;
        }
        return res;
    }
    if (head === 'or') {
        let res = false;
        for (let i = 1; i < exp.length; i++) {
            res = evaluate(exp[i], env);
            if (res) return res;
        }
        return res;
    }
    if (head === 'not') {
        return !evaluate(exp[1], env);
    }
    if (head === 'while') {
        const [, conditionExpr, ...bodyExprs] = exp;
        let result = [];
        while (evaluate(conditionExpr, env)) {
            for (let i = 0; i < bodyExprs.length; i++) {
                result = evaluate(bodyExprs[i], env);
            }
        }
        return result;
    }
    if (head === 'define') {
        const [, symbol, expr] = exp;
        const val = evaluate(expr, env);
        env.set(symbol, val);
        return symbol;
    }
    if (head === 'set!') {
        const [, symbol, expr] = exp;
        const val = evaluate(expr, env);
        return env.update(symbol, val, line, col);
    }
    if (head === 'print') {
        const args = exp.slice(1).map(arg => evaluate(arg, env));
        logToConsole(...args);
        return args[args.length - 1];
    }
    if (head === 'lambda') {
        const [, params, body] = exp;
        return (...args) => {
            if (args.length !== params.length) {
                throw new LispArityError(`Arity mismatch: expected ${params.length} arguments, but got ${args.length}`, line, col);
            }
            const localBindings = {};
            for (let i = 0; i < params.length; i++) localBindings[params[i]] = args[i];
            return evaluate(body, new Environment(localBindings, env));
        };
    }
    if (head === 'begin') {
        let res = [];
        for (let i = 1; i < exp.length; i++) res = evaluate(exp[i], env);
        return res;
    }

    const proc = evaluate(head, env);
    const args = exp.slice(1).map(arg => evaluate(arg, env));
    if (typeof proc !== 'function') {
        throw new LispRuntimeError(`Not a function: ${head}`, line, col);
    }
    return proc(...args);
}

let animationFrameId = null;
let lastTime = 0;

function runLisp() {
    stopLoop();
    const outputEl = document.getElementById('output');
    outputEl.textContent = "";
    const code = textarea.value;

    const freshEnv = new Environment({
        '+': (a, b) => a + b,
        '-': (a, b) => a - b,
        '*': (a, b) => a * b,
        '/': (a, b) => a / b,
        '<': (a, b) => a < b,
        '>': (a, b) => a > b,
        '<=': (a, b) => a <= b,
        '>=': (a, b) => a >= b,
        '=': (a, b) => a === b,
        '/=': (a, b) => a !== b,
        'mod': (a, b) => a % b,
        'abs': a => Math.abs(a),
        'sgn': a => a < 0 ? -1 : (a > 0 ? 1 : 0),
        'exit': () => { stopLoop(); return []; },
        'atom': x => !Array.isArray(x),
        'eq': (a, b) => {
            if (Array.isArray(a) && Array.isArray(b)) return a.length === 0 && b.length === 0;
            return a === b;
        },
        'car': x => x[0],
        'cdr': x => x.slice(1),
        'cons': (x, y) => [x].concat(y),
        'list': (...args) => args.reduceRight((acc, val) => [val].concat(acc), []),
        'cls': (c = 0) => { clearCanvas(c); return c; },
        'pset': (x, y, c) => { setPixel(x, y, c); return c; },
        'line': (x0, y0, x1, y1, c) => { drawBresenhamLine(x0, y0, x1, y1, c); return c; },
        'rect': (x, y, w, h, c) => { drawRect(x, y, w, h, c); return c; },
        'frect': (x, y, w, h, c) => { drawFilledRect(x, y, w, h, c); return c; },
        'circ': (x, y, r, c) => { drawCircle(x, y, r, c); return c; },
        'fcirc': (x, y, r, c) => { drawFilledCircle(x, y, r, c); return c; },
        'pget': (x, y) => getPixel(x, y),
        'rand': n => Math.floor(Math.random() * n),
        'time': () => Date.now(),
        'clock': () => performance.now(),
        'mouse-x': () => mouseX,
        'mouse-y': () => mouseY,
        'mouse-btn': (buttonIndex = 0) => !!mouseButtons[buttonIndex],
        'key?': k => !!keys[k.toLowerCase()] || !!keys[k]
    });

    try {
        const tokens = tokenize(code);
        while (tokens.length > 0) {
            const parsedExpr = parse(tokens);
            evaluate(parsedExpr, freshEnv);
        }

        try {
            const setupFn = evaluate('setup', freshEnv);
            if (typeof setupFn === 'function') setupFn();
        } catch (e) { /* setup optional */ }

        try {
            const updateFn = evaluate('update', freshEnv);
            if (typeof updateFn === 'function') {
                lastTime = performance.now();
                const loop = (currentTime) => {
                    const dt = (currentTime - lastTime) / 1000;
                    lastTime = currentTime;
                    try {
                        updateFn(dt);
                    } catch (loopErr) {
                        outputEl.style.color = '#b13e53';
                        const formattedMsg = loopErr instanceof LispError ? loopErr.toString() : loopErr.message;
                        outputEl.textContent += `\n> Loop Error: ${formattedMsg}`;
                        stopLoop();
                        return;
                    }
                    animationFrameId = requestAnimationFrame(loop);
                };
                animationFrameId = requestAnimationFrame(loop);
            }
        } catch (e) { /* update optional */ }

    } catch (err) {
        outputEl.style.color = '#b13e53';
        const formattedMsg = err instanceof LispError ? err.toString() : err.message;
        outputEl.textContent = `> Error\n${formattedMsg}`;
    }
}

function stopLoop() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        logToConsole("Animation loop stopped.");
    }
    if (document.exitPointerLock) {
        document.exitPointerLock();
    }
}

function clearCanvasBtn() {
    stopLoop();
    clearCanvas(0);
    document.getElementById('output').textContent = "Canvas cleared.";
}

// Initial highlight synchronization on script load
updateEditorView();