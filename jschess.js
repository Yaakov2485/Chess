/* ============================================================
   Chess — Human (White) vs Computer (Black)
   Full legal rules + minimax/alpha-beta bot (5-ply search).

   HEAVILY COMMENTED VERSION.
   You said your last JS was Battleship, so wherever this file uses
   a syntax feature Battleship probably didn't (arrow functions,
   destructuring, the ternary "? :" operator, spread "...", closures,
   Set, etc.) there's a plain-English note explaining what it does,
   right next to the chess-specific explanation of WHY it's there.
   ============================================================ */

/* ---------- Board representation ----------
   The whole board is ONE flat array of 64 strings (not an 8x8 grid of
   arrays). This is a very common trick in chess engines because it makes
   "is this square attacked" and move generation much simpler to write
   with plain math instead of nested loops over rows and columns.

   index = row * 8 + col        (so index 0..63)
   row 0 = rank 8 (the BLACK side, top of a normal chess diagram)
   row 7 = rank 1 (the WHITE side, bottom of a normal chess diagram)

   Each square holds either '' (empty) or a single letter for a piece:
     uppercase = White piece   ('P','N','B','R','Q','K')
     lowercase = Black piece   ('p','n','b','r','q','k')
   P/p = pawn, N/n = knight, B/b = bishop, R/r = rook, Q/q = queen, K/k = king.
------------------------------------------------- */
/* ---------- Game mode ----------
   The whole UI needs to know WHICH kind of game is being played. Rather than
   juggle several true/false flags (which can contradict each other — e.g.
   "vs computer" and "vs person" both true at once, or "not started" vs
   "person mode" getting tangled), we keep ONE variable with three clear states:

     null       -> no game started yet. The board is drawn, but every click is
                   ignored, so the pieces show but cannot be moved.
     'comp'     -> You (White) vs the Computer (Black).
     'person'   -> Two humans sharing this one board, taking turns.

   It lives out here at module scope (top level of the file, not inside any
   function) so that BOTH the inner functions inside buildmyass() AND the Start
   buttons over in the HTML can read and change it. The function that actually
   sets it, startGame(), is defined inside buildmyass() and exposed on `window`
   down there — because it needs to call newGame(), which is private to that
   function. */
let mode = null;
// `const` = a variable that can never be reassigned after this line.
// Here we just use two short strings as labels for "whose turn is it" /
// "whose piece is this" instead of writing 'white'/'black' everywhere.
/* ================================================================
   ⚡ EXAM CHEAT-SHEET (quick-reference for the most-asked concepts)
   ================================================================

   const vs let:
     const = cannot be reassigned (carved in stone). let = can change.
     Use let ONLY when the value changes (e.g. `let best`, `let alpha`,
     `let selected`). `const beta = Infinity` is const because it never changes.

   THE THREE "SCORING" JOBS (do NOT mix these up):
     • evaluate(state) -> scores ONE static position (material + piece-square
       tables). Returns a NUMBER from the side-to-move's point of view.
     • scoreMove(m)    -> rough guess used only to ORDER moves for SPEED.
       Deleting it = same moves, just slower. Never changes the decision.
     • search(...)     -> looks 5 plies ahead and returns the best SCORE.
     • findBestMove()  -> like search but returns the actual MOVE to play
       (keeps bestMoves[] for ties, random-picks one for variety).

   NEGAMAX (the search):
     • Every node MAXIMIZES from its own side's view; negate the child's
       score on the way up: `val = -search(...)`. One rule replaces
       minimax's separate max-for-White / min-for-Black.
     • Perspective is NODE-RELATIVE and flips every ply. Making a move
       passes the turn, so the child is the OPPONENT to move: its score is
       from the opponent's view, and the `-` flips it back to mine.
     • evaluate MUST be symmetric (score from side-to-move's view) or the
       negation flips the wrong way. That's `return turn===WHITE ? score : -score`.
     • alpha = best score I'm assured (starts -Infinity). beta = best the
       opponent will allow me (starts +Infinity). The window narrows; when
       alpha >= beta we PRUNE (this move is too good, so the opponent avoids it).
     • Crossing into child: pass (-beta, -alpha) — swapped (maximizer flips)
       AND negated (perspective flips).
     • Base cases: depth 0 -> evaluate. No legal moves -> checkmate
       (-MATE + ply) if in check, else stalemate (0). The +ply makes FASTER
       mates score better so the bot doesn't dither.

   OBJECTS vs PRIMITIVES (reference vs value):
     • Objects/arrays are shared by REFERENCE. `{ ...state.castling }` makes
       a real COPY so the undo snapshot isn't corrupted when we mutate it.
     • Numbers/strings copy by VALUE (that's why `prevEp: state.ep` is fine).

   BOARD: one FLAT array of 64 STRINGS ('' = empty, UPPER=white, lower=black).
     index = row*8 + col.  rc(i)=[row,col], idx(r,c)=index (they're inverses).
     WATCH OUT: row != rank. row 0 = rank 8 (black, top); rank = 8 - row.

   RETURN TYPES: colorOf(p) -> 'w'/'b'/null (a label). isWhite(p) -> true/false.
   PSEUDO-LEGAL = obeys movement rules but NOT checked for self-check.
     generateLegalMoves makes each one, keeps it only if the king is safe, unmakes.
   makeMove returns an UNDO record; unmakeMove uses it to reverse the move exactly.
   ep = en-passant target square (the square a 2-step pawn skipped over), or -1.
   isSquareAttacked(board, sq, by): can side `by` capture on square sq? Used
     everywhere via inCheck (legal-move filtering, checkmate, UI) + castling.
   ================================================================ */

const WHITE = 'w', BLACK = 'b'; // this one line declares BOTH constants, comma-separated

// A regular function declaration: `function name(parameters) { ...body... }`.
// isWhite(p) takes a piece string (like 'K' or 'p' or '') and answers true/false.
function isWhite(p) {
  // `!==` means "not equal to". `p !== ''` is true when the square isn't empty.
  // `p.toUpperCase()` converts the string to all-caps ('p' -> 'P', 'K' stays 'K').
  // So "p === p.toUpperCase()" is true only when p was ALREADY uppercase,
  // i.e. it's a White piece. `&&` means "and both sides must be true".
  return p !== '' && p === p.toUpperCase();
}

function isBlack(p) {
  // Same idea as isWhite, but checking p equals its own lowercase version.
  return p !== '' && p === p.toLowerCase();
}

// colorOf(p) turns a piece letter into the WHITE/BLACK label from above.
function colorOf(p) {
  // This is a TERNARY expression: `condition ? valueIfTrue : valueIfFalse`.
  // It's a compact if/else that produces a value instead of running statements.
  // Read as: "if p is empty, the color is null (no piece, no color);
  //           otherwise, if isWhite(p) is true use WHITE, otherwise use BLACK."
  return p === '' ? null : (isWhite(p) ? WHITE : BLACK);
}
function buildmyass() {
        // Short alias: `window.Chess` (set at the bottom of jschess.js) holds
        // every function the rules engine exposes. Calling it `C` here just
        // saves typing "window.Chess." everywhere below.
        const C = window.Chess;
        // How many half-moves (plies) ahead the computer searches. Higher =
        // stronger but slower; 5 was chosen as a reasonable "thinks a few
        // moves ahead" difficulty that still replies in a couple of seconds.
        const SEARCH_DEPTH = 5;

        // Maps each single-letter piece code to the Unicode chess symbol
        // that actually gets drawn on the board.
        const GLYPH = {
            P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔',
            p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚',
        };
        function buildBoard() {
            boardEl.innerHTML = ''; // clear out anything already inside #board (safety, in case this ever runs twice)
            for (let i = 0; i < 64; i++) {
                const [r, c] = C.rc(i); // convert the flat index into [row, col] (function borrowed from jschess.js)
                const sq = document.createElement('div'); // create a new, empty <div> element (not yet on the page)
                // (r + c) % 2 alternates 0/1 in a checkerboard pattern as you
                // scan across rows and columns — that's what picks light vs dark.
                sq.className = 'sq ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
                // dataset.i stores the square's index as a custom `data-i=".."`
                // HTML attribute — handy for debugging in the browser inspector,
                // though the click handler below actually captures `i` directly.
                sq.dataset.i = i;
                // addEventListener registers a function to run when this exact
                // event happens on this exact element. Here we pass an ARROW
                // FUNCTION `() => onSquareClick(i)` instead of `onSquareClick`
                // directly — that's what lets each of the 64 squares remember
                // ITS OWN index `i` and pass it along when clicked.
                sq.addEventListener('click', () => onSquareClick(i));
                boardEl.appendChild(sq); // actually insert the new square into the page, inside #board
            }
        }
        // document.getElementById(id) looks up an element already sitting in
        // the HTML above by its id="..." attribute. We grab references to
        // everything we'll need to update once, up front, instead of
        // re-searching the page every time.
        const boardEl = document.getElementById('board');
        const statusEl = document.getElementById('status');
        const promoModal = document.getElementById('promoModal');
        const promoRow = document.getElementById('promoRow');
        const titleEl = document.getElementById('title'); // the <h1> heading — reworded per mode
        const hintEl = document.getElementById('hint');   // the small hint line under the board

        // --- Mutable UI state. Declared with `let` because, unlike `const`,
        // these variables DO get reassigned as the game progresses. ---
        let state = C.startState();  // the actual chess position (board array, turn, etc. — see jschess.js)
        let selected = -1;           // index of the square currently clicked/selected, or -1 for "nothing selected"
        let legalForSel = [];        // the legal moves available FROM `selected`, so we know what to highlight
        let lastMove = null;         // { from, to } of the most recent move, for the yellow highlight
        let history = [];            // a stack of "undo" records (see jschess.js makeMove), used by the Undo button
        let busy = false;            // true while the computer is "thinking" — blocks the human from clicking during that time
        let gameOver = false;        // true once checkmate or stalemate has been reached

        // --- Extra state used ONLY by 'online' mode (play vs another person
        // over the local server). Harmless/ignored in 'comp' and 'person' modes. ---
        let myColor = null;      // 'w' or 'b' — the color THIS browser controls (assigned by the server)
        let playerId = null;     // a random id identifying this browser to the server
        let pollTimer = null;    // handle for the repeating timer that asks the server for new moves
        let polling = false;     // guard so two overlapping polls don't both apply the same move
        let onlineGameId = null; // the server's current game id; if it changes, the other side hit "New Game"

        // --- Account + history state ---
        let loggedInName = null;     // the username this browser logged in as
        let onlineWhiteName = null;  // display names of the two players in the current online game
        let onlineBlackName = null;
        let reportedThisGame = false;// have we already saved THIS finished game to the history DB?

        // Build the 64 square <div> elements once, when the page first loads.


        // render() re-draws every square's contents (piece glyph + any
        // highlight markers) based on the CURRENT values of `state`,
        // `selected`, `legalForSel`, and `lastMove`. It's called after every
        // change so the board on screen always matches the game state.
        function render() {
            const cells = boardEl.children; // the 64 <div class="sq"> elements, in the same order they were created
            // `new Set(...)` builds a Set — a collection like an array, but
            // with fast "does this value exist in here" lookups and no
            // duplicates. `.map(m => m.to)` first turns the legal-move list
            // into a plain array of just the destination squares.
            const legalTargets = new Set(legalForSel.map(m => m.to));
            // Ternary: if the side to move is in check, remember their color; else null.
            const checkedColor = C.inCheck(state, state.turn) ? state.turn : null;
            const kingSq = checkedColor ? findKing(checkedColor) : -1;

            for (let i = 0; i < 64; i++) {
                const cell = cells[i];
                const p = state.board[i];
                // classList.remove(...) strips old highlight classes before
                // recomputing which ones (if any) apply this render.
                cell.classList.remove('sel', 'last', 'check');
                cell.innerHTML = ''; // clear any piece glyph / marker left over from the previous render

                if (lastMove && (i === lastMove.from || i === lastMove.to)) cell.classList.add('last');
                if (i === selected) cell.classList.add('sel');
                if (i === kingSq) cell.classList.add('check');

                if (p !== '') {
                    // Build a <span> to hold the piece's Unicode glyph, colored by
                    // its side, and drop it inside the square.
                    const span = document.createElement('span');
                    span.className = 'piece ' + (C.isWhite(p) ? 'white' : 'black');
                    span.textContent = GLYPH[p];
                    cell.appendChild(span);
                }
                if (legalTargets.has(i)) { // Set.has(value): true if that value was added to the Set
                    const marker = document.createElement('div');
                    // Occupied legal-move square = a capture (draw the ring);
                    // empty legal-move square = a normal move (draw the dot).
                    marker.className = state.board[i] !== '' ? 'capture-ring' : 'dot';
                    cell.appendChild(marker);
                }
            }
        }

        // Scan the board for a given color's king (used only for the red
        // "in check" highlight — jschess.js has its own internal copy of
        // this same idea for move-generation purposes).
        function findKing(color) {
            const k = color === 'w' ? 'K' : 'k';
            for (let i = 0; i < 64; i++) if (state.board[i] === k) return i;
            return -1;
        }

        /* ---------- Move animation (the "sliding piece" effect) ----------
           How long a piece takes to glide from its old square to its new one. */
        const ANIM_MS = 220;
        // Respect the OS "reduce motion" accessibility setting: if the user
        // has asked for less animation, we skip the slide entirely and let
        // pieces snap into place. window.matchMedia(...) checks a CSS media
        // query from JavaScript; `.matches` is true when that query applies.
        const prefersReduced =
            window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // slide(fromIdx, toIdx): make the piece that render() just drew ON the
        // destination square APPEAR to start at the source square and glide
        // over. render() has already placed the piece at its FINAL square, so
        // all we do is play a temporary animation that starts it offset (back
        // at the source) and lets it travel to its resting position.
        function slide(fromIdx, toIdx) {
            // querySelector finds the first matching element inside this cell;
            // '.piece' is the <span> holding the glyph. It may be null if the
            // destination is somehow empty (shouldn't happen for a real move).
            const span = boardEl.children[toIdx].querySelector('.piece');
            if (!span) return;
            const [fr, fc] = C.rc(fromIdx); // source row/col
            const [tr, tc] = C.rc(toIdx);   // destination row/col
            const cell = boardEl.clientWidth / 8; // pixel size of one square (board width / 8 columns)
            if (!cell) return;              // board not laid out yet (0-width) — nothing sensible to animate
            // How far the SOURCE square is from the DESTINATION, in pixels — the
            // offset the piece should START at so it looks like it came from there.
            const dx = (fc - tc) * cell;
            const dy = (fr - tr) * cell;
            if (dx === 0 && dy === 0) return; // no distance to cover (shouldn't happen for a real move)

            span.style.zIndex = '3'; // ride above the other pieces while mid-flight

            // element.animate(keyframes, options) is the Web Animations API. It
            // plays a temporary animation from the FIRST keyframe (offset back at
            // the source) to the LAST (no offset = resting on the destination).
            // Because we DON'T set `fill`, the override disappears when the
            // animation ends and the piece simply rests at its real position —
            // so a hiccup can only ever drop the animation, never strand the
            // piece off-square. That makes this far more robust than manually
            // juggling CSS transitions.
            const anim = span.animate(
                [
                    { transform: `translate(${dx}px, ${dy}px)` }, // start: appear at the source square
                    { transform: 'translate(0px, 0px)' }          // end: settle onto the destination square
                ],
                {
                    duration: ANIM_MS,
                    easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' // an "ease-out" curve: quick start, gentle finish
                }
            );
            // When the glide finishes, drop the temporary raised z-index.
            anim.onfinish = () => { span.style.zIndex = ''; };
        }

        // animateMove(move): slide the piece that just moved, plus — for
        // castling — the rook that moved alongside the king.
        function animateMove(move) {
            if (prefersReduced) return;   // honor the reduce-motion preference
            slide(move.from, move.to);    // the main piece (or the king, when castling)
            if (move.flag === 'castleK' || move.flag === 'castleQ') {
                const white = move.piece === 'K'; // uppercase 'K' = White king; 'k' = Black
                let rFrom, rTo;
                if (move.flag === 'castleK') {          // kingside: rook goes to the king's other side
                    rFrom = white ? 63 : 7; rTo = white ? 61 : 5;
                } else {                                 // queenside
                    rFrom = white ? 56 : 0; rTo = white ? 59 : 3;
                }
                slide(rFrom, rTo); // animate the rook too, so castling looks right
            }
        }

        // Small helper to update the status line's text AND its CSS class
        // (which controls its color — see the #status.think/.win/etc. rules
        // near the top of this file) in one call.
        function setStatus(text, cls) {
            statusEl.textContent = text;
            statusEl.className = cls || ''; // `cls || ''` : if cls wasn't passed in, fall back to no extra class
        }

        // The click handler attached to every square (see buildBoard above).
        // `i` is the index of whichever square was just clicked.
        function onSquareClick(i) {
            // The board is DRAWN on page load but stays "dead" until the player
            // picks a mode with a Start button (which sets `mode`). While mode is
            // still null, ignore every click so the pieces show but can't move.
            if (mode === null) return;
            // Ignore clicks while the computer is thinking, or once the game has ended.
            if (busy || gameOver) return;
            // In 'comp' mode ONLY White (the human) clicks — Black is the computer
            // and moves itself via computerMove(). In 'person' mode BOTH colors are
            // human, so whoever's turn it is may click; we don't block either side.
            if (mode === 'comp' && state.turn !== 'w') return;
            // In 'online' mode you control exactly ONE color (myColor). You may
            // only click when it's your turn; when it's the opponent's turn the
            // board is read-only and their move arrives via polling. (Spectators
            // have myColor 'spectator', which never equals state.turn, so they're
            // blocked from moving entirely — they just watch.)
            if (mode === 'online' && state.turn !== myColor) return;

            const p = state.board[i];

            // Case 1: we already have a piece selected, and this click landed
            // on one of ITS legal destination squares — so this click means
            // "make this move", not "select a different piece".
            if (selected >= 0) {
                // Array.filter(...) keeps only the moves whose `.to` matches
                // this square (there can be more than one match only when
                // several PROMOTION choices share the same destination).
                const candidates = legalForSel.filter(m => m.to === i);
                if (candidates.length > 0) {
                    if (candidates.length > 1 && candidates[0].promotion) {
                        askPromotion(candidates); // let the player choose which piece to promote to
                    } else {
                        doHumanMove(candidates[0]); // just one matching move — play it directly
                    }
                    return; // done handling this click either way
                }
            }

            // Case 2: not moving — (re)select a piece, but only if it belongs to
            // the side whose turn it is. C.colorOf(p) returns 'w' or 'b'; comparing
            // it to state.turn means "this piece is the current player's own".
            // (In 'comp' mode state.turn is always 'w' by the time we reach here,
            // so this only ever lets you pick White pieces. In 'person' mode it
            // naturally lets White pick on White's turn and Black pick on Black's.)
            if (p !== '' && C.colorOf(p) === state.turn) {
                selected = i;
                // Ask the rules engine for ALL legal moves in this position, then
                // keep only the ones that start FROM the square we just selected.
                legalForSel = C.generateLegalMoves(state).filter(m => m.from === i);
                render();
            } else {
                // Clicked an empty square or an enemy piece with nothing selected
                // (or after an invalid attempt) — just clear the selection.
                selected = -1;
                legalForSel = [];
                render();
            }
        }

        // Show the "choose a piece to promote to" popup, and wire up a click
        // handler on each of the (up to 4) choice buttons.
        function askPromotion(candidates) {
            promoRow.innerHTML = ''; // clear any buttons left over from a previous promotion
            for (const m of candidates) {
                const b = document.createElement('button');
                b.className = 'promo-btn';
                b.textContent = GLYPH[m.promotion];
                b.addEventListener('click', () => {
                    promoModal.classList.remove('show'); // hide the popup again
                    doHumanMove(m); // actually play the move the player chose (with the right `promotion` letter attached)
                });
                promoRow.appendChild(b);
            }
            promoModal.classList.add('show'); // reveal the popup (see .modal-back.show in the CSS above)
        }

        // applyMove(m): the SHARED core of playing any move — whether it came
        // from the human clicking, the computer deciding, or the opponent over
        // the network. It just updates the game state and redraws; deciding
        // "what happens next" (ask the bot? send to the server?) is left to the
        // callers below, so this one piece of logic never gets duplicated.
        function applyMove(m) {
            const undo = C.makeMove(state, m); // mutate `state`; get a record to undo it later
            history.push(undo);                // remember it (undo stack / move count)
            lastMove = { from: m.from, to: m.to };
            selected = -1;
            legalForSel = [];
            render();
            animateMove(m); // slide the piece to its new square
        }

        // Play a move the LOCAL human just chose by clicking.
        function doHumanMove(m) {
            applyMove(m);

            // In online mode, tell the server about our move BEFORE checkEnd's
            // early-return, so the opponent still receives a checkmating move.
            if (mode === 'online') postMove(m);

            if (checkEnd()) { reportGameResult(); return; } // game ended — save it to the history DB

            // What happens next depends on the mode:
            if (mode === 'comp') {
                // vs COMPUTER: it's now Black's turn, so let the bot reply.
                busy = true; // block further human clicks while the bot "thinks"
                setStatus('Computer is thinking…', 'think');
                // setTimeout(fn, ms) schedules `fn` to run after roughly `ms`
                // milliseconds, WITHOUT freezing the page in the meantime. We wait
                // for the slide animation to finish FIRST (ANIM_MS), plus a little
                // buffer, before kicking off the search — because the search is
                // synchronous and CPU-heavy, and would otherwise freeze the tab
                // mid-glide and make the animation look janky.
                setTimeout(computerMove, ANIM_MS + 40);
            }
            // vs PERSON: nothing to schedule — the other human clicks next.
            // vs ONLINE: nothing to schedule here either — we already posted the
            //   move above, and the opponent's reply will arrive via polling.
        }

        // Play a move that ARRIVED FROM THE SERVER (the opponent's move in
        // online mode). Same as a human move, but we must NOT send it back to
        // the server (it came from there) and there's no computer to trigger.
        function applyRemoteMove(m) {
            applyMove(m);
            checkEnd();
        }

        // Ask the rules engine for the computer's move, play it, and update the UI.
        function computerMove() {
            const move = C.findBestMove(state, SEARCH_DEPTH); // the 5-ply minimax/alpha-beta search lives in jschess.js
            if (!move) { checkEnd(); busy = false; return; } // defensive guard: shouldn't happen if checkEnd() already caught game-over
            applyMove(move);
            busy = false; // hand control back to the human
            if (checkEnd()) reportGameResult(); // bot's move ended the game — record it
        }

        // After any move, figure out if the game just ended, and update the
        // status line accordingly. Returns true if the game is over (so
        // callers know to stop, e.g. not let the computer move after being checkmated).
        // Tiny helper: turn a side letter ('w'/'b') into a word for messages.
        // Arrow function returning one expression — see the notes at the top of
        // the file on arrow functions.
        const sideName = (t) => (t === 'w' ? 'White' : 'Black');

        function checkEnd() {
            const status = C.gameStatus(state); // one of: 'checkmate' | 'stalemate' | 'check' | 'ongoing'
            if (status === 'checkmate') {
                gameOver = true;
                // Whoever's turn it is when checkmate is detected is the LOSER
                // (they have no legal moves and their king is attacked). How we
                // word it depends on the mode:
                if (mode === 'comp') {
                    // vs computer: White = you, Black = the computer.
                    if (state.turn === 'w') setStatus('Checkmate — Computer wins.', 'lose');
                    else setStatus('Checkmate — You win! 🎉', 'win');
                } else if (mode === 'online') {
                    // online: the winner is the side NOT to move. Word it as
                    // win/lose depending on which side THIS browser is playing.
                    const winner = state.turn === 'w' ? 'b' : 'w';
                    if (winner === myColor) setStatus('Checkmate — You win! 🎉', 'win');
                    else setStatus('Checkmate — You lose.', 'lose');
                } else {
                    // vs person: name the winner, which is the side NOT to move.
                    const winner = state.turn === 'w' ? 'Black' : 'White';
                    setStatus('Checkmate — ' + winner + ' wins! 🎉', 'win');
                }
                return true;
            }
            if (status === 'stalemate') {
                gameOver = true;
                setStatus('Stalemate — draw.', 'draw');
                return true;
            }
            if (status === 'check') {
                // "…in check" — worded per mode.
                if (mode === 'comp') {
                    setStatus(state.turn === 'w' ? 'You are in check.' : 'Computer is in check.', 'think');
                } else if (mode === 'online') {
                    setStatus(state.turn === myColor ? 'You are in check.' : 'Opponent is in check.', 'think');
                } else {
                    setStatus(sideName(state.turn) + ' is in check.', 'think');
                }
                return false; // check isn't game over, just a warning — play continues
            }
            // Ordinary case: just say whose turn it is.
            if (mode === 'comp') {
                setStatus(state.turn === 'w' ? 'Your move.' : 'Computer is thinking…',
                    state.turn === 'w' ? '' : 'think');
            } else if (mode === 'online') {
                // Word it relative to the side this browser is playing.
                setStatus(state.turn === myColor ? 'Your move.' : 'Waiting for opponent…',
                    state.turn === myColor ? '' : 'think');
            } else {
                setStatus(sideName(state.turn) + ' to move.', '');
            }
            return false;
        }

        // Reset everything back to a brand-new game (keeping the current mode).
        function newGame() {
            if (mode === null) return; // locked: does nothing until a mode is chosen
            state = C.startState();
            selected = -1;
            legalForSel = [];
            lastMove = null;
            history = [];
            busy = false;
            gameOver = false;
            reportedThisGame = false; // a fresh game can be recorded again
            render();
            checkEnd(); // sets the correct "to move" status line for the current mode
        }

        // Step the game back to the human's last turn (undoing both the
        // computer's reply and the human's move before it, as one unit —
        // otherwise clicking Undo once would just hand the move right back
        // to the computer to "redo" its own reply).
        function undoMove() {
            if (mode === null) return; // locked: does nothing until a mode is chosen
            // Undo is disabled online: taking a move back on one screen would put
            // the two boards out of sync (the server has no idea we "un-played" it).
            if (mode === 'online') { setStatus('Undo is disabled in online games.', 'think'); return; }
            if (busy) return;          // don't allow undo while the bot is mid-think
            if (history.length === 0) return; // nothing to undo yet
            // Array.pop() removes and returns the LAST item in the array, so this
            // reverses the most recently played move (one ply = one half-move).
            C.unmakeMove(state, history.pop());
            // In 'comp' mode a full round is TWO plies (your move + the computer's
            // reply), so undoing only one would just hand the move straight back to
            // the computer. So if we've landed on Black's turn and there's an
            // earlier move to undo, pop once more to also take back YOUR move —
            // returning the board to White (you) to move again. In 'person' mode we
            // deliberately skip this and undo just the single ply above, one human
            // move at a time.
            if (mode === 'comp' && state.turn !== 'w' && history.length > 0) {
                C.unmakeMove(state, history.pop());
            }
            selected = -1;
            legalForSel = [];
            lastMove = history.length > 0 ? deriveLastMove() : null;
            gameOver = false; // undoing can only leave an ongoing position, never a finished one
            render();
            checkEnd(); // mode-aware "to move" status
        }

        // Look at the current top of the history stack (if any) to figure
        // out what the "last move" highlight should be after an undo.
        function deriveLastMove() {
            const u = history[history.length - 1]; // history.length - 1 is always the index of the last element
            return u ? { from: u.from, to: u.to } : null;
        }

        // startGame(chosenMode): THIS is what the two Start buttons in the HTML
        // call. It records which mode we're in, retitles the heading/hint to
        // match, then starts a fresh game. Because newGame() runs AFTER `mode`
        // is set, newGame's own `if (mode === null) return` guard passes and the
        // board becomes live.
        function startGame(chosenMode) {
            mode = chosenMode; // 'comp' or 'person'
            // Reword the heading and the hint line to suit the chosen mode.
            if (titleEl) {
                titleEl.textContent = chosenMode === 'comp'
                    ? '♟ You (White) vs Computer (Black)'
                    : '♟ Two Players — White vs Black';
            }
            if (hintEl) {
                hintEl.textContent = chosenMode === 'comp'
                    ? 'Click a piece, then a highlighted square. The computer looks 5 moves ahead.'
                    : 'Click a piece, then a highlighted square. White and Black take turns on this screen.';
            }
            newGame(); // reset to the starting position and unlock the board
        }
        // Expose startGame on the global `window` object. Everything else inside
        // buildmyass() is private to it (that's the whole point of wrapping the
        // code in a function), but the buttons' inline onclick="startGame('comp')"
        // runs in GLOBAL scope, so it can only see things hanging off `window`.
        window.startGame = startGame;

        /* ============================================================
           ONLINE MODE — play against another person over the local server.
           The browser is the chess brain; the Python server is only a relay.
           These functions do all the talking to it, using plain fetch().
           (fetch() sends a web request and returns a Promise — a "it'll be
           ready later" object — which `await` waits on inside an async function.)
           ============================================================ */

        // Make a random id so the server can tell the two browsers apart. We
        // save it so a page refresh keeps you on the same side.
        function ensurePlayerId() {
            try {
                playerId = localStorage.getItem('chessPlayerId');
                if (!playerId) {
                    playerId = 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36);
                    localStorage.setItem('chessPlayerId', playerId);
                }
            } catch (e) {
                // localStorage can be blocked; fall back to a per-session id.
                if (!playerId) playerId = 'p' + Math.random().toString(36).slice(2);
            }
        }

        // startOnline(): called by the "Play Online" button. Joins the server,
        // learns which color we are, resets the board, and starts listening for
        // the opponent's moves. It's `async` because talking to the server takes
        // a moment and we `await` the reply.
        async function startOnline() {
            ensurePlayerId();
            setStatus('Connecting to server…', 'think');
            let data;
            try {
                const res = await fetch('/join', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ playerId, name: loggedInName })
                });
                data = await res.json();
            } catch (e) {
                // Most likely the page was opened straight from a file instead of
                // through the server, so there's nothing to fetch from.
                setStatus('Could not reach the server. Open the page via the server URL (http://…:8000/).', 'lose');
                return;
            }
            mode = 'online';
            myColor = data.color;      // 'w', 'b', or 'spectator'
            onlineGameId = data.gameId;
            onlineWhiteName = data.white;   // names known so far (opponent may be null until they join)
            onlineBlackName = data.black;
            reportedThisGame = false;

            // Heading + hint reflect which side you're on.
            if (titleEl) {
                titleEl.textContent =
                    myColor === 'w' ? '♟ Online — You are White' :
                    myColor === 'b' ? '♟ Online — You are Black' :
                    '♟ Online — Spectating';
            }
            if (hintEl) {
                hintEl.textContent = myColor === 'spectator'
                    ? 'The game is full — you are watching. Moves update automatically.'
                    : 'You are ' + (myColor === 'w' ? 'White' : 'Black') +
                      '. Move only on your turn; the opponent\'s moves appear automatically.';
            }

            // Fresh board, then start the polling loop. (mode is already set, so
            // the board is unlocked for your color.)
            state = C.startState();
            selected = -1; legalForSel = []; lastMove = null; history = [];
            busy = false; gameOver = false;
            render();
            checkEnd();     // shows "Your move." or "Waiting for opponent…"
            startPolling();
        }

        // Send our just-played move to the server so the opponent can fetch it.
        // Only the three identifying facts are needed; their engine fills in the rest.
        function postMove(m) {
            fetch('/move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerId, from: m.from, to: m.to, promotion: m.promotion || '' })
            }).catch(() => {/* a dropped send shows up as a missing move; ignore here */});
        }

        // Ask the server for the full move list and apply anything new. Runs on a
        // timer (startPolling). The `polling` guard stops a slow request from
        // overlapping the next tick and applying a move twice.
        async function pollMoves() {
            if (mode !== 'online' || polling) return;
            polling = true;
            try {
                const res = await fetch('/moves');
                const data = await res.json();
                // Keep the current players' names up to date (the opponent's name
                // appears here once they join) — used for the history record.
                onlineWhiteName = data.white;
                onlineBlackName = data.black;

                // If the game id changed, the OTHER player pressed New Game —
                // wipe our board and resync from scratch.
                if (data.gameId !== onlineGameId) {
                    onlineGameId = data.gameId;
                    state = C.startState();
                    selected = -1; legalForSel = []; lastMove = null; history = [];
                    busy = false; gameOver = false;
                    reportedThisGame = false;
                    render();
                    checkEnd();
                }

                // Apply every move the server has that we haven't applied yet.
                // history.length = how many moves we've already played locally.
                for (let k = history.length; k < data.moves.length; k++) {
                    const mv = data.moves[k];
                    // Turn the bare {from,to,promotion} into a real, fully-formed
                    // legal move by finding the match in OUR engine — so we only
                    // ever apply a genuinely legal move.
                    const legal = C.generateLegalMoves(state);
                    const m = legal.find(x =>
                        x.from === mv.from && x.to === mv.to &&
                        (x.promotion || '') === (mv.promotion || ''));
                    if (m) {
                        applyRemoteMove(m);
                    } else {
                        // Shouldn't happen if both sides agree; stop and retry next tick.
                        console.warn('Could not match incoming move', mv);
                        break;
                    }
                }
            } catch (e) {
                // Network hiccup — ignore and try again on the next tick.
            } finally {
                polling = false;
            }
        }

        function startPolling() {
            stopPolling();                              // clear any previous timer first
            pollTimer = setInterval(pollMoves, 1000);   // check for the opponent's move once a second
        }
        function stopPolling() {
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        }

        // Ask the server to start a new game. We DON'T reset locally here — we let
        // the poll notice the new game id and reset BOTH browsers the same way,
        // keeping the two screens perfectly in step.
        function requestOnlineReset() {
            fetch('/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerId })
            }).catch(() => {});
        }

        // New Game behaves differently per mode: online it asks the server to
        // reset (both sides); otherwise it just resets locally.
        function onNewGameClick() {
            if (mode === 'online') requestOnlineReset();
            else newGame();
        }

        // Let the inline button onclick="startOnline()" reach this function.
        window.startOnline = startOnline;

        /* ============================================================
           SAVING A FINISHED GAME to the history database (the GAMES table).
           ============================================================ */
        // Called when a game ends in 'comp' or 'online' mode. Works out who won
        // from the final position and POSTs it to the server's /gameover.
        function reportGameResult() {
            if (reportedThisGame) return;                      // never record the same game twice
            if (mode !== 'comp' && mode !== 'online') return;  // 'person' games aren't recorded
            const status = C.gameStatus(state);
            let result;
            if (status === 'checkmate') result = (state.turn === 'w') ? 'black' : 'white'; // winner = side NOT to move
            else if (status === 'stalemate') result = 'draw';
            else return;                                       // not actually over
            let white, black;
            if (mode === 'comp') { white = loggedInName || 'Player'; black = 'Computer'; }
            else { white = onlineWhiteName || 'White'; black = onlineBlackName || 'Black'; }
            reportedThisGame = true;
            fetch('/gameover', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ white, black, result, moves: history.length })
            }).then(() => renderHistory()).catch(() => {});
        }

        /* ============================================================
           LOGIN / REGISTER (talks to the USERS table via the server).
           ============================================================ */
        const loginScreen = document.getElementById('loginScreen');
        const gameArea    = document.getElementById('gameArea');
        const loginName   = document.getElementById('loginName');
        const loginPass   = document.getElementById('loginPass');
        const loginMsg    = document.getElementById('loginMsg');
        const whoamiEl    = document.getElementById('whoami');
        const historyEl   = document.getElementById('history');

        function showLoginMsg(text, cls) {
            loginMsg.textContent = text;
            loginMsg.className = cls || '';
        }

        // doAuth('login') or doAuth('register'): send the typed name + password to
        // the matching server endpoint; on success, reveal the game.
        async function doAuth(kind) {
            const name = loginName.value.trim();
            const password = loginPass.value;
            if (!name || !password) { showLoginMsg('Enter a username and password.', 'err'); return; }
            showLoginMsg(kind === 'register' ? 'Creating account…' : 'Logging in…', '');
            let data;
            try {
                const res = await fetch('/' + kind, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, password })
                });
                data = await res.json();
            } catch (e) {
                showLoginMsg('Could not reach the server. Open the page via the server URL (http://…:8000/).', 'err');
                return;
            }
            if (data.ok) afterLogin(data.name);
            else showLoginMsg(data.error || 'Something went wrong.', 'err');
        }

        // After a successful login: remember the name, swap the login screen for
        // the game, and show the recent-games list.
        function afterLogin(name) {
            loggedInName = name;
            try { localStorage.setItem('chessLastUser', name); } catch (e) {}
            whoamiEl.textContent = 'Logged in as ' + name;
            loginScreen.hidden = true;  // hide the login screen...
            gameArea.hidden = false;    // ...and reveal the game
            renderHistory();            // show recent games
        }

        // Fetch recent games from the server (the GAMES table) and draw them as a
        // small table under the board.
        async function renderHistory() {
            if (!historyEl) return;
            let games = [];
            try {
                const res = await fetch('/history');
                games = (await res.json()).games || [];
            } catch (e) { return; }
            if (games.length === 0) {
                historyEl.innerHTML = '<h3>Recent games</h3><div class="empty">No games played yet.</div>';
                return;
            }
            let rows = '';
            for (const g of games) {
                const outcome = g.result === 'draw' ? 'Draw'
                    : (g.result === 'white' ? g.white + ' won' : g.black + ' won');
                rows += '<tr><td>' + esc(g.white) + '</td><td>' + esc(g.black) +
                        '</td><td>' + esc(outcome) + '</td><td>' + g.moves +
                        '</td><td>' + esc(g.playedAt) + '</td></tr>';
            }
            historyEl.innerHTML =
                '<h3>Recent games</h3><table><tr><th>White</th><th>Black</th>' +
                '<th>Result</th><th>Moves</th><th>When</th></tr>' + rows + '</table>';
        }

        // Escape user-supplied text so a crafted username can't inject HTML into
        // the history table.
        function esc(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        // Wire the login screen's buttons + the Enter key.
        document.getElementById('loginBtn').addEventListener('click', () => doAuth('login'));
        document.getElementById('registerBtn').addEventListener('click', () => doAuth('register'));
        loginPass.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAuth('login'); });
        // Prefill the last username used on this browser (convenience only).
        try {
            const last = localStorage.getItem('chessLastUser');
            if (last) loginName.value = last;
        } catch (e) {}

        // Wire up the two in-game buttons to their handlers. Both handlers start
        // with `if (mode === null) return`, so they safely do nothing until a
        // mode has been chosen — that's the "lock New Game / Undo" fix.
        document.getElementById('newGame').addEventListener('click', onNewGameClick);
        document.getElementById('undo').addEventListener('click', undoMove);
        // Clicking the dimmed backdrop (but NOT the popup box itself) closes
        // the promotion modal without picking a piece. `e.target` is exactly
        // whichever element was clicked; we only close if that was the
        // backdrop itself, not something inside it bubbling the click up.
        promoModal.addEventListener('click', (e) => {
            if (e.target === promoModal) promoModal.classList.remove('show');
        });

        // --- Run once, immediately, when the page's <script> executes: ---
        buildBoard(); // create the 64 square elements
        render();     // draw the starting position onto them (visible, but locked)
        setStatus('Choose a mode above to start.', ''); // prompt the player to pick
}
// Builds and returns a brand-new game in the standard starting position.
function startState() {
  // An ARRAY LITERAL: square brackets with comma-separated values create
  // an array in one shot. This lays out all 64 squares, row by row,
  // starting at the Black back rank (row 0) and ending at the White
  // back rank (row 7) — matching the "row 0 = rank 8" rule above.
  const board = [
    'r','n','b','q','k','b','n','r', // row 0: Black's home row (rank 8)
    'p','p','p','p','p','p','p','p', // row 1: Black's pawns (rank 7)
    '','','','','','','','',         // row 2: empty (rank 6)
    '','','','','','','','',         // row 3: empty (rank 5)
    '','','','','','','','',         // row 4: empty (rank 4)
    '','','','','','','','',         // row 5: empty (rank 3)
    'P','P','P','P','P','P','P','P', // row 6: White's pawns (rank 2)
    'R','N','B','Q','K','B','N','R'  // row 7: White's home row (rank 1)
  ];
  // Return an OBJECT LITERAL: curly braces with `key: value` pairs.
  // This bundles everything that describes "the current game" into one
  // object so we can pass it around as a single variable called `state`.
    return {
    board:board,                                          // shorthand for `board: board`
    turn: WHITE,                                    // White always moves first
    castling: { wK: true, wQ: true, bK: true, bQ: true }, // who may still castle, per side/wing
    ep: -1,          // "en-passant" target square index this turn, or -1 if none is available
  };
}

/* DIRS = reusable lists of (row-step, col-step) pairs for each piece type.
   Each inner [dr, dc] pair means "move dr rows and dc columns from here".
   This is another OBJECT LITERAL, and each value is an ARRAY of ARRAYS
   (an array of 2-element [row, col] pairs). */
const DIRS = {
  rook:   [[-1, 0], [1, 0], [0, -1], [0, 1]],                     // straight lines: up, down, left, right
  bishop: [[-1, -1], [-1, 1], [1, -1], [1, 1]],                   // diagonals: the 4 corner directions
  king:   [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]], // all 8 neighboring squares
  knight: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]], // the 8 "L-shape" jumps
};
// A queen moves like a rook AND a bishop combined, so we build its
// direction list by gluing the two arrays together with .concat().
DIRS.queen = DIRS.rook.concat(DIRS.bishop);

/* ---------- Small helper functions ----------
   These three are written as ARROW FUNCTIONS: `(params) => expression`.
   An arrow function is just a shorter way to write a function, and when
   the body is a single expression (no curly braces), that expression's
   value is automatically returned — no `return` keyword needed. */

// rc(i): convert a flat index (0..63) back into [row, col].
// `Math.floor` rounds DOWN to a whole number, which is how integer
// division works in JS (there's no built-in "//" operator like Python).
const rc = (i) => [Math.floor(i / 8), i % 8]; // % is the remainder ("modulo") operator

// idx(r, c): the opposite of rc — turn a [row, col] pair back into a flat index.
const idx = (r, c) => r * 8 + c;

// onBoard(r, c): true if row r and column c are both within the 0..7 range,
// i.e. this square actually exists on an 8x8 board.
const onBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

/* ---------- Attack detection ----------
   isSquareAttacked answers: "if it were `by`'s turn right now, could `by`
   capture whatever sits on square `sq`?" This is the single most-used
   helper in the whole engine — it's how we detect check, how we forbid
   castling through/into check, and (indirectly) how we forbid moves
   that would leave your own king exposed. */
function isSquareAttacked(board, sq, by) {
  // DESTRUCTURING: `const [r, c] = rc(sq)` calls rc(sq), which returns a
  // 2-item array like [3, 4], and immediately unpacks it into two
  // separate variables r and c in one line (instead of two lines).
  const [r, c] = rc(sq);

  // --- Pawn attacks ---
  // A pawn attacks diagonally, one square "forward" from its own point of
  // view. So to check "does an enemy pawn attack `sq`", we look at the
  // squares diagonally BEHIND `sq` (from that pawn's direction of travel)
  // and see if a pawn of color `by` is actually sitting there.
  if (by === WHITE) {
    // White pawns move UP the board (toward row 0), so a White pawn that
    // attacks `sq` must be sitting one row BELOW it, i.e. at row r + 1.
    for (const dc of [-1, 1]) { // check both diagonal neighbors (left and right)
      const rr = r + 1, cc = c + dc;
      // Short-circuit: only look at board[...] if the square is actually on the board.
      if (onBoard(rr, cc) && board[idx(rr, cc)] === 'P') return true;
    }
  } else {
    // Black pawns move DOWN the board, so mirror the logic: look one row above.
    for (const dc of [-1, 1]) {
      const rr = r - 1, cc = c + dc;
      if (onBoard(rr, cc) && board[idx(rr, cc)] === 'p') return true;
    }
  }

  // --- Knight attacks ---
  // Pick the right-case letter ('N' for White, 'n' for Black) once, up front.
  const N = by === WHITE ? 'N' : 'n';
  // `for (const [dr, dc] of DIRS.knight)` loops over each [dr, dc] pair in
  // the array, destructuring it into dr/dc on every iteration.
  for (const [dr, dc] of DIRS.knight) {
    const rr = r + dr, cc = c + dc;
    if (onBoard(rr, cc) && board[idx(rr, cc)] === N) return true;
  }

  // --- King attacks --- (needed so kings can't move next to each other)
  const K = by === WHITE ? 'K' : 'k';
  for (const [dr, dc] of DIRS.king) {
    const rr = r + dr, cc = c + dc;
    if (onBoard(rr, cc) && board[idx(rr, cc)] === K) return true;
  }

  // --- Sliding piece attacks (rook/queen orthogonally, bishop/queen diagonally) ---
  // Precompute the letters we're hunting for once, outside the loops below.
  const R = by === WHITE ? 'R' : 'r';
  const B = by === WHITE ? 'B' : 'b';
  const Q = by === WHITE ? 'Q' : 'q';

  // Walk outward in each rook direction (up/down/left/right), one square
  // at a time, until we fall off the board or hit a piece.
  for (const [dr, dc] of DIRS.rook) {
    let rr = r + dr, cc = c + dc; // `let` because rr/cc change each loop step
    while (onBoard(rr, cc)) {
      const p = board[idx(rr, cc)];
      if (p !== '') {
        // We hit SOME piece. If it's an enemy rook or queen, `sq` is attacked
        // along this line. Either way, this piece blocks anything further
        // away, so we `break` out of the while-loop regardless.
        if (p === R || p === Q) return true;
        break;
      }
      rr += dr; cc += dc; // step one more square in this direction
    }
  }
  // Same idea again but walking the 4 diagonal directions, for bishop/queen.
  for (const [dr, dc] of DIRS.bishop) {
    let rr = r + dr, cc = c + dc;
    while (onBoard(rr, cc)) {
      const p = board[idx(rr, cc)];
      if (p !== '') {
        if (p === B || p === Q) return true;
        break;
      }
      rr += dr; cc += dc;
    }
  }
  // If none of the checks above found an attacker, the square is safe.
  return false;
}

// Scan the whole board array and return the index where a given color's king sits.
function kingSquare(board, color) {
  const k = color === WHITE ? 'K' : 'k';
  // Plain old C-style for loop: start i at 0, keep going while i < 64, add 1 each time.
  for (let i = 0; i < 64; i++) if (board[i] === k) return i;
  return -1; // shouldn't normally happen (every position needs a king!), but safe fallback
}

// inCheck(state, color): is `color`'s king currently under attack?
function inCheck(state, color) {
  const ks = kingSquare(state.board, color);
  if (ks < 0) return false; // no king found = nothing to check (defensive guard)
  // "Is the king's square attacked by the OTHER color?" — flip WHITE<->BLACK with the ternary.
  return isSquareAttacked(state.board, ks, color === WHITE ? BLACK : WHITE);
}

/* ---------- Pseudo-legal move generation ----------
   "Pseudo-legal" means: obeys how each piece is allowed to move, but does
   NOT yet check whether making the move would leave your own king in
   check (that filtering happens later, in generateLegalMoves).

   Every move we produce is an OBJECT with this shape:
     { from, to, piece, captured, promotion, flag }
   flag is one of: 'normal' | 'double' (2-square pawn opening move)
                 | 'ep' (en passant capture) | 'castleK' | 'castleQ' */
function generatePseudoMoves(state) {
  // Object destructuring: pull board/turn/ep OUT of `state` into their
  // own local variables in one line, instead of writing state.board,
  // state.turn, state.ep everywhere below.
  const { board, turn, ep } = state;
  const moves = []; // we'll fill this array with move objects and return it
  const me = turn;                       // whose move generation is this for
  const enemy = me === WHITE ? BLACK : WHITE;

  // A small LOCAL helper function, defined as an arrow function and stored
  // in a variable, so it can "see" `board` and `moves` from the outer
  // scope without us having to pass them in every time (this is called a
  // CLOSURE — the inner function remembers the variables around it).
  const push = (from, to, flag) => {
    moves.push({
      from, to,                    // shorthand for from: from, to: to
      piece: board[from],
      captured: board[to],
      promotion: '',
      flag: flag || 'normal'       // `||` here means "use flag, unless it's falsy (undefined), then use 'normal'"
    });
  };

  // Walk every square on the board looking for pieces belonging to `me`.
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p === '' || colorOf(p) !== me) continue; // `continue` skips to the next loop iteration
    const [r, c] = rc(i);
    const type = p.toUpperCase(); // normalize to uppercase so 'p' and 'P' both become 'P'

    if (type === 'P') {
      // Pawns are the fiddliest piece: direction depends on color, they
      // can move 2 squares from their start row, capture only diagonally,
      // promote on the far row, and can capture "en passant".
      const fwd = me === WHITE ? -1 : 1;       // White walks toward row 0, Black toward row 7
      const startRow = me === WHITE ? 6 : 1;   // the row pawns begin on
      const promoRow = me === WHITE ? 0 : 7;   // reaching this row promotes the pawn

      // -- one square forward --
      const r1 = r + fwd;
      if (onBoard(r1, c) && board[idx(r1, c)] === '') { // forward square must be empty (pawns don't capture straight)
        if (r1 === promoRow) addPromotions(moves, i, idx(r1, c), board, 'normal');
        else push(i, idx(r1, c), 'normal');
        // -- two squares forward, only from the starting row, only if BOTH squares are empty --
        const r2 = r + 2 * fwd;
        if (r === startRow && board[idx(r2, c)] === '') push(i, idx(r2, c), 'double');
      }
      // -- diagonal captures (including en passant) --
      for (const dc of [-1, 1]) {
        const cc = c + dc;
        if (!onBoard(r1, cc)) continue; // `!` negates: skip if this diagonal square doesn't exist
        const tsq = idx(r1, cc);
        const target = board[tsq];
        if (target !== '' && colorOf(target) === enemy) {
          // there's an enemy piece to capture diagonally
          if (r1 === promoRow) addPromotions(moves, i, tsq, board, 'normal');
          else push(i, tsq, 'normal');
        } else if (tsq === ep && ep >= 0) {
          // the diagonal square is empty, but it's the en-passant target square
          push(i, tsq, 'ep');
        }
      }
    }
    else if (type === 'N') {
      // Knights: try every [dr, dc] jump; legal if on the board and not
      // landing on our own piece.
      for (const [dr, dc] of DIRS.knight) {
        const rr = r + dr, cc = c + dc;
        if (!onBoard(rr, cc)) continue;
        const t = board[idx(rr, cc)];
        if (t === '' || colorOf(t) === enemy) push(i, idx(rr, cc), 'normal');
      }
    }
    else if (type === 'K') {
      // King: one step in any of the 8 directions, same "empty or enemy" rule.
      for (const [dr, dc] of DIRS.king) {
        const rr = r + dr, cc = c + dc;
        if (!onBoard(rr, cc)) continue;
        const t = board[idx(rr, cc)];
        if (t === '' || colorOf(t) === enemy) push(i, idx(rr, cc), 'normal');
      }
      // Plus the special castling moves (handled in its own function below).
      addCastling(state, moves, me);
    }
    else {
      // Rook, Bishop, Queen: these "slide" — keep stepping in each of
      // their directions until hitting the edge of the board or a piece.
      // The ternary chain below picks which direction list applies.
      const dirs = type === 'R' ? DIRS.rook : type === 'B' ? DIRS.bishop : DIRS.queen;
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (onBoard(rr, cc)) {
          const t = board[idx(rr, cc)];
          if (t === '') {
            push(i, idx(rr, cc), 'normal'); // empty square: legal, and keep sliding further
          } else {
            if (colorOf(t) === enemy) push(i, idx(rr, cc), 'normal'); // capture is legal...
            break; // ...but either way, a piece (ours or theirs) blocks the rest of this line
          }
          rr += dr; cc += dc;
        }
      }
    }
  }
  return moves;
}

// When a pawn reaches the last row, it doesn't become ONE new piece — the
// player chooses which piece to promote to. So this generates 4 separate
// move objects (queen/rook/bishop/knight), one per possible choice.
function addPromotions(moves, from, to, board, flag) {
  const white = isWhite(board[from]);
  // Ternary again: pick the uppercase or lowercase set of letters depending on color.
  const promos = white ? ['Q', 'R', 'B', 'N'] : ['q', 'r', 'b', 'n'];
  for (const pr of promos) {
    moves.push({ from, to, piece: board[from], captured: board[to], promotion: pr, flag });
  }
}

// Castling: a king+rook special move. Legal only if:
//   1) neither the king nor that rook has moved yet this game,
//   2) the squares between them are empty,
//   3) the king is not currently in check,
//   4) the king does not pass through or land on an attacked square.
function addCastling(state, moves, me) {
  // Destructure board and castling-rights out of state.
  const { board, castling } = state;
  const enemy = me === WHITE ? BLACK : WHITE;
  if (me === WHITE) {
    // White king starts on square 60 (row 7, col 4 = e1). If it's not
    // there (already moved, even if it moved back — see makeMove below,
    // which permanently clears the flags on any king move), bail out.
    if (board[60] !== 'K') return;
    if (isSquareAttacked(board, 60, enemy)) return; // can't castle out of check
    // Kingside (short) castle: king e1->g1 (60->62), rook h1->f1.
    // castling.wK is the saved permission flag; the rest of the big `if`
    // checks the squares between king and rook are empty (61, 62) and
    // that the king wouldn't pass through an attacked square.
    if (castling.wK && board[63] === 'R' && board[61] === '' && board[62] === ''
      && !isSquareAttacked(board, 61, enemy) && !isSquareAttacked(board, 62, enemy)) {
      moves.push({ from: 60, to: 62, piece: 'K', captured: '', promotion: '', flag: 'castleK' });
    }
    // Queenside (long) castle: king e1->c1 (60->58), rook a1->d1.
    // Note square 57 (b1) must be empty too, even though the king doesn't
    // cross it — the rook needs somewhere to land.
    if (castling.wQ && board[56] === 'R' && board[59] === '' && board[58] === '' && board[57] === ''
      && !isSquareAttacked(board, 59, enemy) && !isSquareAttacked(board, 58, enemy)) {
      moves.push({ from: 60, to: 58, piece: 'K', captured: '', promotion: '', flag: 'castleQ' });
    }
  } else {
    // Same logic mirrored for Black, whose king starts on square 4 (e8).
    if (board[4] !== 'k') return;
    if (isSquareAttacked(board, 4, enemy)) return;
    // Kingside: king e8->g8 (4->6), rook h8->f8.
    if (castling.bK && board[7] === 'r' && board[5] === '' && board[6] === ''
      && !isSquareAttacked(board, 5, enemy) && !isSquareAttacked(board, 6, enemy)) {
      moves.push({ from: 4, to: 6, piece: 'k', captured: '', promotion: '', flag: 'castleK' });
    }
    // Queenside: king e8->c8 (4->2), rook a8->d8.
    if (castling.bQ && board[0] === 'r' && board[3] === '' && board[2] === '' && board[1] === ''
      && !isSquareAttacked(board, 3, enemy) && !isSquareAttacked(board, 2, enemy)) {
      moves.push({ from: 4, to: 2, piece: 'k', captured: '', promotion: '', flag: 'castleQ' });
    }
  }
}

/* ---------- Make / Unmake ----------
   makeMove actually applies a move to `state` (mutating the board array
   in place) and returns an `undo` record — enough breadcrumbs to reverse
   exactly that move later with unmakeMove. We use this make/unmake pair
   (instead of copying the whole board every move) because the bot's
   search tries THOUSANDS of moves per turn, and copying a 64-item array
   that many times would be needlessly slow. */
function makeMove(state, m) {
  const b = state.board;
  // Build the undo record BEFORE we touch the board, while everything
  // still reflects the position as it was.
  const undo = {
    from: m.from, to: m.to,
    movedPiece: b[m.from],       // what piece is actually leaving `from` (before any promotion swap)
    captured: m.captured,        // what was sitting on `to` (for a normal capture)
    flag: m.flag,
    promotion: m.promotion,
    prevEp: state.ep,            // en-passant target square before this move (to restore later)
    // The `...` here is the SPREAD operator: it copies every key/value
    // out of state.castling into a brand-new object. Without this we'd
    // just be storing a REFERENCE to the same object, and mutating it
      // later would corrupt our "before" snapshot too.
      //Make sure you can say the why in one breath: “because without ... both variables point to the same object, so mutating state.castling also changes the snapshot.”
      // The corruption is the symptom; the shared reference is the cause. Name the cause and you’ll get full marks.
    prevCastling: { ...state.castling },
    epCapturedSq: -1,            // filled in below only for en-passant captures
    epCapturedPiece: '',
  };

  const moving = b[m.from];
  const me = colorOf(moving);

  // Move the piece: put it on the destination square (or the promoted
  // piece, if `m.promotion` was set), then empty out the origin square.
  b[m.to] = m.promotion ? m.promotion : moving;
  b[m.from] = '';

  // En-passant capture: the captured pawn is NOT on the destination
  // square (it's on the square the moving pawn "jumped past"), so we
  // have to remove it separately.
  if (m.flag === 'ep') {
    const [tr, tc] = rc(m.to);
    const capSq = me === WHITE ? idx(tr + 1, tc) : idx(tr - 1, tc);
    undo.epCapturedSq = capSq;
    undo.epCapturedPiece = b[capSq];
    b[capSq] = '';
  }

  // Castling also moves the rook, as a side effect of moving the king.
  if (m.flag === 'castleK') {
    if (me === WHITE) { b[61] = 'R'; b[63] = ''; } // rook h1 -> f1
    else { b[5] = 'r'; b[7] = ''; }                // rook h8 -> f8
  } else if (m.flag === 'castleQ') {
    if (me === WHITE) { b[59] = 'R'; b[56] = ''; } // rook a1 -> d1
    else { b[3] = 'r'; b[0] = ''; }                // rook a8 -> d8
  }

  // Every move except a pawn's double-step clears the en-passant target
  // (it's only available for ONE reply, immediately after the double-step).
  state.ep = -1;
  if (m.flag === 'double') {
    const [fr, fc] = rc(m.from);
    // The en-passant target is the square the pawn skipped OVER.
    state.ep = me === WHITE ? idx(fr - 1, fc) : idx(fr + 1, fc);
  }

  // Update castling rights: moving a king, or moving/capturing a rook
  // from its home square, permanently forfeits that castling option —
  // even if the piece later moves back.
  const cst = state.castling;
  if (moving === 'K') { cst.wK = false; cst.wQ = false; }
  else if (moving === 'k') { cst.bK = false; cst.bQ = false; }
  if (m.from === 63 || m.to === 63) cst.wK = false; // White's h1 rook touched
  if (m.from === 56 || m.to === 56) cst.wQ = false; // White's a1 rook touched
  if (m.from === 7 || m.to === 7) cst.bK = false;   // Black's h8 rook touched
  if (m.from === 0 || m.to === 0) cst.bQ = false;   // Black's a8 rook touched

  // Hand the turn to the other player.
  state.turn = state.turn === WHITE ? BLACK : WHITE;

  return undo;
}

// unmakeMove reverses exactly what makeMove did, using the undo record.
// This must be an EXACT mirror image of makeMove, in reverse order.
function unmakeMove(state, undo) {
  const b = state.board;
  // Flip the turn back to whoever moved.
  state.turn = state.turn === WHITE ? BLACK : WHITE;

  // Put the moved piece back on its original square (this also undoes a
  // promotion automatically, since we restore the ORIGINAL pawn letter,
  // not whatever it was promoted to), and restore whatever was captured
  // (or '' if nothing was) on the destination square.
  b[undo.from] = undo.movedPiece;
  b[undo.to] = undo.captured;

  if (undo.flag === 'ep') {
    // The destination square was empty before an en-passant move, so clear it...
    b[undo.to] = '';
    // ...and put the captured pawn back where it actually was.
    b[undo.epCapturedSq] = undo.epCapturedPiece;
  }

  if (undo.flag === 'castleK') {
    // Move the rook back to its original corner.
    if (colorOf(undo.movedPiece) === WHITE) { b[63] = 'R'; b[61] = ''; }
    else { b[7] = 'r'; b[5] = ''; }
  } else if (undo.flag === 'castleQ') {
    if (colorOf(undo.movedPiece) === WHITE) { b[56] = 'R'; b[59] = ''; }
    else { b[0] = 'r'; b[3] = ''; }
  }

  // Restore the en-passant target and castling rights exactly as they
  // were before this move (we saved copies of both in makeMove).
  state.ep = undo.prevEp;
  state.castling = undo.prevCastling;
}

/* ---------- Legal move generation (filters out self-check) ----------
   Take every pseudo-legal move, actually TRY it on the board, check
   whether our own king ends up in check, and only keep the move if not.
   This is the simplest-to-write (if not the fastest-possible) way to
   guarantee full rule correctness. */
function generateLegalMoves(state) {
  const me = state.turn;
  const pseudo = generatePseudoMoves(state);
  const legal = [];
  for (const m of pseudo) {
    const undo = makeMove(state, m);       // try the move...
    if (!inCheck(state, me)) legal.push(m); // ...keep it only if it didn't expose our king...
    unmakeMove(state, undo);                // ...then always undo it, win or lose.
  }
  return legal;
}

/* ---------- Evaluation ----------
   This is the bot's "how good is this position" scorer. Positive numbers
   favor White, negative numbers favor Black. It's the only thing the
   search function (below) actually knows about chess strategy — the
   search just tries to find the sequence of moves that leads to the
   best possible number here. */

// How many points each piece is "worth". Standard chess piece values,
// scaled up by 100 (so a pawn = 100) to leave room for the smaller,
// finer-grained positional bonuses below without rounding problems.
const PIECE_VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

/* Piece-Square Tables (PST): a bonus/penalty added on top of raw piece
   value, based on WHICH square the piece sits on. For example, knights
   are worth more in the center (more squares reachable) and less in the
   corner — that's what the N table below encodes. Each table is a flat
   64-length array laid out the same way as `board` (row 0 = rank 8),
   and is written from WHITE's point of view; for Black pieces we look
   up the "mirrored" square instead (see `mirror`, right below). */
const PST = {
  P: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0
  ],
  N: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50
  ],
  B: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20
  ],
  R: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0
  ],
  Q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20
  ],
  K: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20, // encourages the king to stay safe near the corners early on
     20, 30, 10,  0,  0, 10, 30, 20
  ]
};

// The PST tables above are written for White. To score a BLACK piece
// fairly, we flip the row (7 - r) so we're reading the "mirror image"
// row from White's table — e.g. Black's back rank (row 0) reads White's
// back rank (row 7) bonuses, which is the symmetric equivalent.
function mirror(i) {
  const [r, c] = rc(i);
  return idx(7 - r, c);
}

// evaluate() adds up piece values + positional bonuses for the WHOLE
// board, then flips the sign depending on whose turn it is. Returning
// the score "from the current player's point of view" (instead of
// always from White's) is what makes the NEGAMAX search below work —
// see the comment above `search` for why that trick is convenient.
function evaluate(state) {                        // give ONE board position a numeric score (no looking ahead)
    let score = 0;                                // running total: positive = good for White, negative = good for Black
  const b = state.board;                          // הפניה
  for (let i = 0; i < 64; i++) {                  // visit every square, index 0 to 63
    const p = b[i];                               // the piece letter on this square ('' if empty)
    if (p === '') continue;                       // empty square scores nothing, skip to the next one
    const t = p.toUpperCase();                    // piece TYPE ('P','N','B','R','Q','K'), ignoring its color
    const val = PIECE_VALUE[t] + PST[t][isWhite(p) ? i : mirror(i)];  // material value + square bonus (mirror the square for Black)
    score += isWhite(p) ? val : -val;             // White pieces add to the score, Black pieces subtract
  }
  return state.turn === WHITE ? score : -score;   // flip the sign so the number is from the side-to-move's point of view
}

/* ---------- Move ordering (MVV-LVA + promotions) ----------
   Alpha-beta pruning (used in `search`, below) throws away huge chunks
   of the search tree early — but ONLY if it examines the strongest
   moves first. scoreMove() gives every move a rough "how promising does
   this look" number so we can sort the move list, strongest-first,
   before searching. MVV-LVA = "Most Valuable Victim, Least Valuable
   Attacker": capturing a queen with a pawn is prioritized far above
   capturing a pawn with a queen. */
function scoreMove(m) {                             // rough "how promising" score, used ONLY to order moves for speed
  let s = 0;                                       // every move starts at 0
  if (m.captured) {                                // did this move capture a piece? ('' = no capture = falsy)
      s += 10 * PIECE_VALUE[m.captured.toUpperCase()] - PIECE_VALUE[m.piece.toUpperCase()];  // MVV-LVA: victim's value up, attacker's value down
      //Pawn takes Queen: victim Q=900, attacker P=100 → 10×900 − 100 = 8900
      //Queen takes Pawn: victim P = 100, attacker Q = 900 → 10×100 − 900 = 100
  }
  if (m.flag === 'ep') s += 10 * PIECE_VALUE.P - PIECE_VALUE.P;  // en passant captures a pawn, score it like any pawn capture
  if (m.promotion) s += PIECE_VALUE[m.promotion.toUpperCase()];  // a promotion is very promising, push it up the order
  return s;                                        // higher number = looks better = gets searched earlier
}
const MATE = 1000000;                              // "checkmate" score: so big it always outweighs any material difference

/* ---------- Negamax with alpha-beta ----------
   This is the "look N moves ahead" brain. It's written as NEGAMAX, a
   trick that simplifies minimax: instead of separate "maximize for
   White" / "minimize for Black" code paths, every call just tries to
   MAXIMIZE the score from its own side's point of view, and negates
   the score before handing it back up to the caller (because "good for
   me" is exactly "bad for my opponent", flipped in sign).

   alpha/beta are the classic alpha-beta pruning bounds: alpha is the
   best score we've already guaranteed we can get, beta is the best
   score the OPPONENT can already guarantee elsewhere in the tree. If a
   move ever proves so good that it exceeds beta, the opponent would
   simply never let us reach this position in the first place — so we
   can stop looking (the `break` near the bottom) without checking the
   rest of the moves here. This is what makes searching 5 moves ahead
   fast enough to run in the browser. */
function search(state, depth, alpha, beta, ply) {   // look `depth` plies ahead; return the best score for the side to move
  // Base case of the recursion: we've run out of depth, just score the position.
  if (depth === 0) return evaluate(state);          // hit the depth limit: stop looking ahead and score the position as-is

  const moves = generateLegalMoves(state);          // every legal move in this position

  if (moves.length === 0) {                         // no legal moves at all -> the game ends right here
    // No legal moves means either checkmate or stalemate for whoever's turn it is.
    // `-MATE + ply` makes a mate found SOONER (smaller ply) score as more
    // negative/worse for the side being mated, so the bot prefers faster
    // checkmates over slower ones when it has a choice.
    if (inCheck(state, state.turn)) return -MATE + ply;  // in check + no moves = checkmate (a loss); +ply makes faster mates score better
    return 0; // stalemate = a draw = neutral score
  }

  // Sort moves best-looking-first (see scoreMove above) so alpha-beta
  // pruning cuts off as much of the tree as possible.
  // `.sort((a, b) => scoreMove(b) - scoreMove(a))` — the callback returns
  // a negative number when b's score is bigger than a's, which tells
  // .sort() to place b before a, i.e. DESCENDING order (best first).
  moves.sort((a, b) => scoreMove(b) - scoreMove(a));  // put the strongest-looking moves first so the prune fires early

  let best = -Infinity; // JS has a built-in Infinity value; -Infinity loses to any real score
  for (const m of moves) {                          // try each candidate move in turn
    const undo = makeMove(state, m);                // play it on the board; keep an `undo` record to reverse it later
    // Recurse one ply deeper, from the OPPONENT's point of view. We
    // negate their best score (what's good for them is bad for us) and
    // swap+negate alpha/beta because the roles of "our best" and
    // "their best" flip at every level.
    const val = -search(state, depth - 1, -beta, -alpha, ply + 1);
    unmakeMove(state, undo); // always undo, whether or not we keep this move

    // --- ALPHA-BETA PRUNING happens in these three lines ---
    // 1. Remember the best score we've found at this node so far.
    if (val > best) best = val;
    // 2. alpha = "the best score I've already GUARANTEED myself". Raise it
    //    whenever a move beats it.
    if (best > alpha) alpha = best;
    // 3. THE PRUNE. beta = "the best the opponent will allow me" (handed down
    //    from the parent). If our best has reached or passed that ceiling, we've
    //    found a move so good the opponent would never let us reach this
    //    position — they'd choose their better option higher up the tree. So
    //    there's no point checking the moves still left in `moves`: `break`
    //    exits the loop early and SKIPS them, along with the entire deep subtree
    //    of replies under each one. That skipped work is what pruning saves.
    //    (It gives the SAME answer as checking them all — just far faster. And
    //    because we sorted best-move-first above, this usually fires early, so
    //    most of the list gets skipped.)
    if (alpha >= beta) break; // beta cutoff
  }
  return best;
}

/* Find the best move for the side to move, searching `depth` plies ahead.
   ("Ply" = one player's move; so depth 5 = 5 half-moves, roughly 2-3
   full moves each for White and Black.) This is almost the same loop as
   inside `search`, but here we also remember WHICH move produced the
   best score, instead of only the score itself — because this is the
   move we're actually going to play. */
function findBestMove(state, depth) {               // the ROOT search: returns the actual MOVE to play (not just a score)
  const moves = generateLegalMoves(state);          // every legal move for the side to move
  if (moves.length === 0) return null; // no legal moves = game already over

  let best = -Infinity;                             // best score found so far (any real move beats -Infinity)
  let bestMoves = []; // collect ALL moves that tie for the best score
  let alpha = -Infinity;                            // best score we've secured so far (climbs as we find good moves)
  const beta = Infinity; // beta never changes at the root, so it can be `const`
    //“alpha = best I’ve secured so far (starts -∞, nothing secured); beta = best the opponent will allow me (starts +∞, no limit yet). The window starts wide open and tightens as we learn.”
  for (const m of moves) {                          // try each candidate move in turn
    const undo = makeMove(state, m);                // play it on the board; keep an `undo` record to reverse it
    const val = -search(state, depth - 1, -beta, -alpha, 1);  // score it by searching the opponent's replies (negated: child is from their view)
    unmakeMove(state, undo);                         // undo the move, board back to how it was
    if (val > best) {                               // is this move strictly BETTER than anything seen so far?
      best = val;                                   // yes: record its score as the new best
      bestMoves = [m]; // strictly better move found: start a fresh list with just this one
    } else if (val === best) {                      // else, is it exactly TIED with the current best?
      bestMoves.push(m); // exactly tied with the best: keep it as an option too
    }
    if (best > alpha) alpha = best;                 // raise alpha so the deeper searches can prune against our best
  }
  // Randomly pick among any equally-best moves, so the bot doesn't always play the same line in identical positions.
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];  // hand back one of the tied-best moves, chosen at random
}

/* Figure out the overall game state in plain words, for the UI to display. */
function gameStatus(state) {
  const moves = generateLegalMoves(state);
  const checked = inCheck(state, state.turn);
    if (moves.length === 0) {

    // Ternary again: no legal moves + currently in check = checkmate;
    // no legal moves + NOT in check = stalemate (a draw).
    return checked ? 'checkmate' : 'stalemate';
  }
  return checked ? 'check' : 'ongoing';
}

/* ---------- Expose everything the HTML page needs ----------
   Everything above this point is a local variable/function inside THIS
   file and isn't visible from chessHTML.html on its own. `window` is the
   global object every script on the page shares, so attaching an object
   here (`window.Chess = {...}`) is how we hand a curated set of
   functions over to the UI code in the <script> tag at the bottom of
   the HTML file. The shorthand `{ startState, generateLegalMoves, ... }`
   means "make a property with this exact name, using the
   already-existing variable/function of the same name as its value" —
   equivalent to writing `{ startState: startState, ... }` but shorter. */
window.Chess = {
  startState, generateLegalMoves, makeMove, unmakeMove,
  findBestMove, gameStatus, inCheck, rc, idx, colorOf, isWhite, isBlack,
};
//Perspective is node - relative and flips every ply. (Your N2 miss, then N9 fix.) Anchor: “making a move flips the turn, so the child is the opponent to move; -search(...) flips its score back to me.” This is THE negamax idea.
//What each function returns — the recurring theme across both quizzes:
//evaluate → a score for one static position(from the mover’s POV).
//    search → the best score of a subtree(a number — no move).
//        findBestMove → the best move(picks among ties).
//            Base -case returns: depth 0 → evaluate; no moves → -MATE + ply(checkmate) vs 0(stalemate).
//Name the concepts: negamax = one max rule + negate(not pruning); alpha - beta = the pruning; evaluate must be symmetric / side - to - move relative; alpha / beta = a window(my floor / opponent’s ceiling) that narrows until alpha ≥ beta cuts off.




































//The 30 - second version(say this first)

//“The bot picks its move by looking ahead.It imagines every legal move it could make, then every reply the opponent could make, and so on — 5 half - moves deep.At the bottom it scores each resulting position,//
//assumes both sides play their best, and then picks the move that leads
//to the best guaranteed outcome.The algorithm is called minimax, written in the negamax form, with alpha - beta pruning to make it fast.”

//That alone shows you get it.Then expand as they ask:

//If they ask “how does it score a position ?”

//“That’s the evaluate function. It adds up material — each piece has a value, pawn 100, knight 320, up to queen 900 — plus small positional bonuses from piece - square tables,
// like knights being worth more in the center.Positive means good for White, negative good for Black.”

//If they ask “what do you mean ‘assumes both sides play their best’?”

//“That’s minimax.On my turn I want the highest score; on the opponent’s turn they’ll pick the move that’s worst for me.
//So I don’t just hope they blunder — I assume they’ll make their best reply, and I pick the move that still comes out best against that.
//We code it as negamax: every level just maximizes from its own side’s point of view, and we flip the sign each level — because a position that’s good for my opponent is bad for me.”

//If they ask “what’s alpha - beta pruning ?”

//“It’s a speed optimization.While searching, if I find a move so good that the opponent would never let me reach that position —
// because they already have a better option elsewhere — I can stop checking the rest of that branch.It gives the exact same answer as searching everything, 
//just by examining far fewer positions.To make it cut more, I order moves so promising ones, like captures, are tried first.↨