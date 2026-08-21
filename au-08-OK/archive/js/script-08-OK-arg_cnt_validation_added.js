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

// --- Textarea Custom Shortcuts (Tab & Ctrl+L Line/Col Info) ---
const textarea = document.getElementById('code-input');
textarea.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        
        textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
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

        // Multi-line comments: #| ... |#
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

        // Single-line comments: ; or #
        if (char === ';' || char === '#') {
            while (i < input.length && input[i] !== '\n') {
                i++;
            }
            continue;
        }

        // String literals with escape sequence support
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
            if (i < input.length) { i++; col++; } // skip closing quote
            tokens.push({ type: 'ATOM', value: `__STR__${btoa(strVal)}`, line: startLine, col: startCol });
            continue;
        }

        // Quotes, Parentheses
        if (char === '\'' || char === '(' || char === ')') {
            tokens.push({ type: char, value: char, line, col });
            col++;
            i++;
            continue;
        }

        // Regular tokens/atoms
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
    if (tokens.length === 0) throw new Error('1:1: Unexpected EOF while reading');
    const token = tokens.shift();
    
    // Support quote shorthand 'expr or '(list)
    if (token.value === "'") {
        return ['quote', parse(tokens)];
    }

    if (token.value === '(') {
        const list = [];
        while (tokens.length > 0 && tokens[0].value !== ')') {
            list.push(parse(tokens));
        }
        if (tokens.length === 0) {
            throw new Error(`${token.line}:${token.col}: Missing closing parenthesis`);
        }
        tokens.shift(); // remove ')'
        return list;
    } else if (token.value === ')') {
        throw new Error(`${token.line}:${token.col}: Unexpected closing parenthesis`);
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
    find(variable) {
        if (variable in this.bindings) return this;
        if (this.outer) return this.outer.find(variable);
        throw new Error(`Unbound symbol: ${variable}`);
    }
    set(variable, value) {
        this.bindings[variable] = value;
    }
    update(variable, value) {
        try {
            const env = this.find(variable);
            env.bindings[variable] = value;
            return value;
        } catch (e) {
            throw new Error(`Cannot set! unbound symbol: ${variable}`);
        }
    }
}

function evaluate(exp, env) {
    if (typeof exp === 'number') return exp;
    if (typeof exp === 'boolean') return exp;
    if (typeof exp === 'string') {
        if (env) {
            try {
                return env.find(exp).bindings[exp];
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
        return env.update(symbol, val);
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
                throw new Error(`Arity mismatch: expected ${params.length} arguments, but got ${args.length}`);
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
    if (typeof proc !== 'function') throw new Error(`Not a function: ${head}`);
    return proc(...args);
}

let animationFrameId = null;
let lastTime = 0;

function runLisp() {
    stopLoop();
    const outputEl = document.getElementById('output');
    outputEl.textContent = "";
    const code = document.getElementById('code-input').value;

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
                        outputEl.textContent += `\n> Loop Error: ${loopErr.message}`;
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
        outputEl.textContent = `> Error\n${err.message}`;
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