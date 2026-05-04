// =========================================================
// Softball Scorebook
// =========================================================

const POSITIONS = {
  1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B',
  6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF'
};

const STORAGE_KEY = 'softball.scorebook.v1';
const HISTORY_KEY = 'softball.scorebook.history.v1';

// ---------- State ----------
let state = null;

function freshState() {
  return {
    teams: {
      away: { name: 'Away', players: [] },
      home: { name: 'Home', players: [] }
    },
    inning: 1,
    half: 'top',                       // 'top' or 'bottom'
    outs: 0,
    bases: { 1: null, 2: null, 3: null },
    battingIndex: { away: 0, home: 0 },
    innings: [{ away: 0, home: 0 }],
    teamStats: {
      away: { R: 0, H: 0, E: 0, LOB: 0 },
      home: { R: 0, H: 0, E: 0, LOB: 0 }
    },
    playerStats: {},                   // playerId -> {AB,R,H,RBI,BB,SO,...}
    log: [],
    setupComplete: false,
    gameOver: false
  };
}

// ---------- Persistence ----------
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { console.warn('save failed', e); }
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) { return []; }
}
function saveHistory(arr) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr)); }
  catch (e) { console.warn('history save failed', e); }
}
function archiveCurrentGame() {
  if (!state.log.length) return false;
  const arr = loadHistory();
  arr.unshift({
    id: 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    endedAt: new Date().toISOString(),
    awayName: state.teams.away.name,
    homeName: state.teams.home.name,
    awayR: state.teamStats.away.R,
    homeR: state.teamStats.home.R,
    state: JSON.parse(JSON.stringify(state))
  });
  saveHistory(arr);
  return true;
}

// ---------- Helpers ----------
function battingTeam() { return state.half === 'top' ? 'away' : 'home'; }
function fieldingTeam() { return state.half === 'top' ? 'home' : 'away'; }

function getPlayer(id) {
  if (!id) return null;
  for (const t of ['away', 'home']) {
    const p = state.teams[t].players.find(p => p.id === id);
    if (p) return p;
  }
  return null;
}

function ensurePlayerStats(id) {
  if (!state.playerStats[id]) {
    state.playerStats[id] = {
      PA: 0, AB: 0, R: 0, H: 0, RBI: 0, BB: 0, SO: 0,
      doubles: 0, triples: 0, HR: 0, SB: 0, SF: 0, HBP: 0
    };
  }
  return state.playerStats[id];
}

function currentBatter() {
  // No auto-cycling. If we've gone past the end of the lineup,
  // return null so the UI prompts to add a new batter or pick
  // an existing one to continue the cycle.
  const team = battingTeam();
  const players = state.teams[team].players;
  if (!players.length) return null;
  const idx = state.battingIndex[team];
  if (idx >= players.length) return null;
  return players[idx];
}

function advanceBatter() {
  const team = battingTeam();
  state.battingIndex[team]++;
}

function makeId() {
  return 'p_' + Math.random().toString(36).slice(2, 9);
}

// =========================================================
// Setup screen
// =========================================================
function initSetupUI() {
  document.querySelectorAll('.team-setup').forEach(card => {
    const team = card.dataset.team;
    const nameInput = card.querySelector('.team-name');
    const numInput = card.querySelector('.new-player-num');
    const playerInput = card.querySelector('.new-player-name');
    const addBtn = card.querySelector('.add-player');

    nameInput.value = state.teams[team].name === 'Away' || state.teams[team].name === 'Home'
      ? '' : state.teams[team].name;

    nameInput.addEventListener('input', () => {
      state.teams[team].name = nameInput.value.trim() ||
        (team === 'away' ? 'Away' : 'Home');
      save();
    });

    addBtn.addEventListener('click', () => addPlayer(team, numInput, playerInput));
    playerInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') addPlayer(team, numInput, playerInput);
    });

    renderRoster(team);
  });

  document.getElementById('startGameBtn').addEventListener('click', startGame);
  document.getElementById('loadGameBtn').addEventListener('click', resumeGame);
}

function addPlayer(team, numInput, nameInput) {
  const num = numInput.value.trim();
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  state.teams[team].players.push({
    id: makeId(),
    num: num || '',
    name: name
  });
  numInput.value = '';
  nameInput.value = '';
  nameInput.focus();
  save();
  renderRoster(team);
}

function renderRoster(team) {
  const card = document.querySelector(`.team-setup[data-team="${team}"]`);
  const rosterDiv = card.querySelector('.roster');
  rosterDiv.innerHTML = '';
  state.teams[team].players.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'roster-row';
    row.innerHTML = `
      <span class="num">${p.num || '–'}</span>
      <span><span class="order">${i + 1}</span> ${escapeHtml(p.name)}</span>
      <button data-action="up">↑</button>
      <button data-action="del">✕</button>
    `;
    row.querySelector('[data-action="up"]').addEventListener('click', () => {
      if (i > 0) {
        [state.teams[team].players[i-1], state.teams[team].players[i]] =
          [state.teams[team].players[i], state.teams[team].players[i-1]];
        save();
        renderRoster(team);
      }
    });
    row.querySelector('[data-action="del"]').addEventListener('click', () => {
      state.teams[team].players.splice(i, 1);
      save();
      renderRoster(team);
    });
    rosterDiv.appendChild(row);
  });
}

function startGame() {
  state.setupComplete = true;
  save();
  showScreen('game');
  renderGame();
}

function resumeGame() {
  const saved = load();
  if (saved && saved.setupComplete) {
    state = saved;
    showScreen('game');
    renderGame();
  } else {
    alert('No saved game in progress. Finish setup and tap Start Game.');
  }
}

// =========================================================
// Screens
// =========================================================
function showScreen(name) {
  document.getElementById('setup').classList.toggle('hidden', name !== 'setup');
  document.getElementById('game').classList.toggle('hidden', name !== 'game');
}

// =========================================================
// Game UI
// =========================================================
function renderGame() {
  renderScoreboard();
  renderStatus();
  renderBatter();
  renderBases();
}

function renderScoreboard() {
  document.getElementById('sbAwayName').textContent = state.teams.away.name;
  document.getElementById('sbHomeName').textContent = state.teams.home.name;

  // Show only innings that have been started; the scoreboard grows as the game does.
  const inningsCount = Math.max(state.innings.length, state.inning);
  const buildInnings = (team) => {
    let html = '';
    for (let i = 0; i < inningsCount; i++) {
      const inn = state.innings[i];
      const val = inn ? inn[team] : null;
      const isCurrent = (i + 1 === state.inning) &&
        ((team === 'away' && state.half === 'top') ||
         (team === 'home' && state.half === 'bottom'));
      // For the "away" column in a bottom-half inning, the half is complete.
      // For the "home" column in a top-half inning, that side hasn't batted yet.
      let display;
      if (val === null || val === undefined) {
        display = '·';
      } else if (team === 'home' && (i + 1) === state.inning && state.half === 'top') {
        display = '·';  // home hasn't batted in the current inning yet
      } else {
        display = val;
      }
      html += `<span class="${isCurrent ? 'current' : ''}">${display}</span>`;
    }
    return html;
  };
  document.getElementById('sbAwayInnings').innerHTML = buildInnings('away');
  document.getElementById('sbHomeInnings').innerHTML = buildInnings('home');

  document.getElementById('sbAwayR').textContent = state.teamStats.away.R;
  document.getElementById('sbAwayH').textContent = state.teamStats.away.H;
  document.getElementById('sbAwayE').textContent = state.teamStats.away.E;
  document.getElementById('sbHomeR').textContent = state.teamStats.home.R;
  document.getElementById('sbHomeH').textContent = state.teamStats.home.H;
  document.getElementById('sbHomeE').textContent = state.teamStats.home.E;
}

function renderStatus() {
  const halfLabel = state.half === 'top' ? 'Top' : 'Bot';
  document.getElementById('halfInning').textContent = `${halfLabel} ${state.inning}`;
  document.getElementById('outsDisplay').textContent =
    `${state.outs} out${state.outs === 1 ? '' : 's'}`;
}

function renderBatter() {
  const b = currentBatter();
  const team = battingTeam();
  const teamName = state.teams[team].name;
  const addRow = document.getElementById('batterAddRow');
  const toggle = document.getElementById('newBatterToggle');
  const pickRow = document.getElementById('batterPickRow');
  const pickButtons = document.getElementById('batterPickButtons');

  if (!b) {
    document.getElementById('batterName').textContent = 'Who’s up?';
    document.getElementById('batterTeam').textContent = teamName;
    addRow.classList.remove('hidden');
    toggle.classList.add('hidden');

    const players = state.teams[team].players;
    if (players.length > 0) {
      pickRow.classList.remove('hidden');
      pickButtons.innerHTML = '';
      const isOnBase = (p) => [1,2,3].some(b => state.bases[b] === p.id);

      // Suggest the next eligible (not on-base) player in cycle order.
      const startIdx = state.battingIndex[team] % players.length;
      let suggestedIdx = -1;
      for (let i = 0; i < players.length; i++) {
        const idx = (startIdx + i) % players.length;
        if (!isOnBase(players[idx])) { suggestedIdx = idx; break; }
      }

      players.forEach((p, i) => {
        const onBase = isOnBase(p);
        const btn = document.createElement('button');
        btn.className = 'pick-btn' + (i === suggestedIdx ? ' suggested' : '');
        btn.textContent = `${i + 1}. ${p.num ? '#' + p.num + ' ' : ''}${p.name}` +
          (onBase ? ' (on base)' : '');
        btn.disabled = onBase;
        btn.addEventListener('click', () => {
          if (onBase) return;
          state.battingIndex[team] = i;
          save();
          renderGame();
        });
        pickButtons.appendChild(btn);
      });
    } else {
      pickRow.classList.add('hidden');
    }
    return;
  }

  pickRow.classList.add('hidden');
  const order = state.battingIndex[team] + 1;
  document.getElementById('batterName').textContent =
    `${order}. ${b.num ? '#' + b.num + ' ' : ''}${b.name}`;
  document.getElementById('batterTeam').textContent = teamName;
  addRow.classList.add('hidden');
  toggle.classList.remove('hidden');
}

function addBatterInline() {
  const team = battingTeam();
  const numInput = document.getElementById('newBatterNum');
  const nameInput = document.getElementById('newBatterName');
  const num = numInput.value.trim();
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  state.teams[team].players.push({
    id: makeId(),
    num: num || '',
    name: name
  });
  // Make this newly-added player the current batter.
  state.battingIndex[team] = state.teams[team].players.length - 1;
  numInput.value = '';
  nameInput.value = '';
  document.getElementById('batterAddRow').classList.add('hidden');
  save();
  renderGame();
}

function renderBases() {
  document.querySelectorAll('.base[data-base]').forEach(el => {
    const base = parseInt(el.dataset.base, 10);
    if (base === 0) return;
    const playerId = state.bases[base];
    const occupied = !!playerId;
    el.classList.toggle('occupied', occupied);
    const runnerEl = el.querySelector('.runner');
    if (runnerEl) {
      const p = getPlayer(playerId);
      runnerEl.textContent = p ? (p.num ? '#' + p.num : p.name.split(' ')[0]) : '';
    }
  });
}

// =========================================================
// Play handling
// =========================================================
function handlePlay(playType) {
  if (state.gameOver) {
    alert('Game is over.');
    return;
  }
  const batter = currentBatter();
  if (!batter) {
    // Highlight the inline add-batter form; user must add the batter first.
    const addRow = document.getElementById('batterAddRow');
    addRow.classList.remove('hidden');
    document.getElementById('newBatterName').focus();
    return;
  }

  // For plays that need fielder selection
  const needsFielder = ['GO', 'FO', 'LO', 'PO', 'FOUL', 'SF', 'SAC', 'DP', 'E', 'FC'].includes(playType);

  if (needsFielder) {
    openFielderPicker(playType, (fielders) => {
      processPlay(playType, batter, fielders);
    });
  } else {
    processPlay(playType, batter, []);
  }
}

function processPlay(playType, batter, fielders) {
  // Take a snapshot for undo BEFORE any mutation happens.
  const snapshot = JSON.stringify(state);

  const ctx = {
    playType,
    batter,
    fielders,
    runsScored: 0,
    rbi: 0,
    notation: '',
    description: '',
    isHit: false,
    isAB: true,
    isOutOnPlay: 0,  // outs added by this play
    snapshot                    // available immediately for synchronous handlers
  };

  switch (playType) {
    case '1B': singleHit(ctx, 1); break;
    case '2B': singleHit(ctx, 2); break;
    case '3B': singleHit(ctx, 3); break;
    case 'HR': singleHit(ctx, 4); break;
    case 'BB': walk(ctx, false); break;
    case 'HBP': walk(ctx, true); break;
    case 'E':  reachOnError(ctx); break;
    case 'FC': fieldersChoice(ctx); break;
    case 'K':  strikeout(ctx); break;
    case 'GO': groundout(ctx); break;
    case 'FO':
    case 'LO':
    case 'PO':
    case 'FOUL': flyout(ctx, playType); break;
    case 'SF':  sacFly(ctx); break;
    case 'SAC': sacBunt(ctx); break;
    case 'DP':  doublePlay(ctx); break;
    default:
      alert('Unknown play: ' + playType);
      return;
  }
}

// ---------- Specific plays ----------

function singleHit(ctx, basesAdvance) {
  ctx.isHit = true;
  state.teamStats[battingTeam()].H++;
  const stats = ensurePlayerStats(ctx.batter.id);
  stats.PA++; stats.AB++; stats.H++;
  if (basesAdvance === 2) stats.doubles++;
  else if (basesAdvance === 3) stats.triples++;
  else if (basesAdvance === 4) stats.HR++;

  if (basesAdvance === 4) {
    // HR: everyone scores
    const onBase = collectRunners();
    onBase.forEach(r => scoreRun(r.playerId, ctx));
    scoreRun(ctx.batter.id, ctx, true);
    clearBases();
    ctx.notation = 'HR';
    ctx.description = `Home run by ${batterDisplay(ctx.batter)}` +
      (onBase.length ? ` (${onBase.length + 1}-run)` : '');
    finishHalfAdvance(ctx);
  } else {
    // Show runner advance modal with smart defaults
    const placement = { batter: basesAdvance };  // batter ends on this base
    const defaultMoves = computeDefaultRunnerMoves(basesAdvance, false);
    openRunnerModal(ctx, placement, defaultMoves, () => {
      ctx.notation = basesAdvance === 1 ? '1B'
                    : basesAdvance === 2 ? '2B'
                    : '3B';
      ctx.description = `${batterDisplay(ctx.batter)} ${
        basesAdvance === 1 ? 'singles' :
        basesAdvance === 2 ? 'doubles' : 'triples'
      }${ctx.runsScored ? ` (${ctx.runsScored} run${ctx.runsScored>1?'s':''} scored)` : ''}`;
      finishHalfAdvance(ctx);
    });
  }
}

function walk(ctx, hbp) {
  ctx.isAB = false;
  const stats = ensurePlayerStats(ctx.batter.id);
  stats.PA++;
  if (hbp) stats.HBP++; else stats.BB++;
  // Force advance only
  const movements = forceAdvanceForWalk();
  applyRunnerMovements(movements, ctx, /*placeBatter*/ 1);
  ctx.notation = hbp ? 'HBP' : 'BB';
  ctx.description = `${batterDisplay(ctx.batter)} ${hbp ? 'hit by pitch' : 'walks'}`;
  finishHalfAdvance(ctx);
}

function reachOnError(ctx) {
  ctx.isAB = true;
  const stats = ensurePlayerStats(ctx.batter.id);
  stats.PA++; stats.AB++;
  state.teamStats[fieldingTeam()].E++;
  const placement = { batter: 1 };
  const defaultMoves = computeDefaultRunnerMoves(1, false);
  openRunnerModal(ctx, placement, defaultMoves, () => {
    ctx.notation = 'E' + (ctx.fielders[0] || '');
    ctx.description = `${batterDisplay(ctx.batter)} reaches on error` +
      (ctx.fielders[0] ? ` by ${POSITIONS[ctx.fielders[0]]}` : '');
    finishHalfAdvance(ctx);
  });
}

function fieldersChoice(ctx) {
  ctx.isAB = true;
  const stats = ensurePlayerStats(ctx.batter.id);
  stats.PA++; stats.AB++;
  // Batter to 1, user picks who's out among the runners
  const placement = { batter: 1 };
  const defaultMoves = computeDefaultRunnerMoves(1, false);
  openRunnerModal(ctx, placement, defaultMoves, () => {
    ctx.notation = 'FC' + (ctx.fielders.length ? ' ' + ctx.fielders.join('-') : '');
    ctx.description = `${batterDisplay(ctx.batter)} reaches on fielder's choice`;
    finishHalfAdvance(ctx);
  });
}

function strikeout(ctx) {
  ctx.isAB = true;
  ctx.isOutOnPlay = 1;
  const stats = ensurePlayerStats(ctx.batter.id);
  stats.PA++; stats.AB++; stats.SO++;
  ctx.notation = 'K';
  ctx.description = `${batterDisplay(ctx.batter)} strikes out`;
  state.outs++;
  finishHalfAdvance(ctx);
}

function groundout(ctx) {
  ctx.isAB = true;
  ctx.isOutOnPlay = 1;
  const stats = ensurePlayerStats(ctx.batter.id);
  stats.PA++; stats.AB++;
  state.outs++;
  // Allow runners to advance if user wants
  const defaultMoves = computeDefaultRunnerMoves(0, true /*isOut*/);
  openRunnerModal(ctx, /*placement*/ null, defaultMoves, () => {
    const f = ctx.fielders.join('-') || '?';
    ctx.notation = f;
    ctx.description = `${batterDisplay(ctx.batter)} grounds out, ${f}`;
    finishHalfAdvance(ctx);
  });
}

function flyout(ctx, type) {
  ctx.isAB = true;
  ctx.isOutOnPlay = 1;
  const stats = ensurePlayerStats(ctx.batter.id);
  stats.PA++; stats.AB++;
  state.outs++;
  const f = ctx.fielders[0] || '?';
  let prefix = type === 'FO' ? 'F' : type === 'LO' ? 'L' : type === 'PO' ? 'P' : 'foul';
  ctx.notation = (type === 'FOUL' ? 'foul ' : prefix) + f;
  const typeLabel = type === 'FO' ? 'flies out'
                  : type === 'LO' ? 'lines out'
                  : type === 'PO' ? 'pops out'
                  : 'fouls out';
  ctx.description = `${batterDisplay(ctx.batter)} ${typeLabel} to ${POSITIONS[f] || '?'}`;
  // Tagging up possible — let user advance runners
  const defaultMoves = computeDefaultRunnerMoves(0, true);
  openRunnerModal(ctx, null, defaultMoves, () => {
    finishHalfAdvance(ctx);
  });
}

function sacFly(ctx) {
  ctx.isAB = false;
  ctx.isOutOnPlay = 1;
  const stats = ensurePlayerStats(ctx.batter.id);
  stats.PA++; stats.SF++;
  state.outs++;
  const f = ctx.fielders[0] || '?';
  ctx.notation = 'SF' + f;
  // Default: R3 scores
  const defaultMoves = {};
  if (state.bases[3]) defaultMoves[3] = 'home';
  openRunnerModal(ctx, null, defaultMoves, () => {
    ctx.description = `${batterDisplay(ctx.batter)} sac fly to ${POSITIONS[f] || '?'}` +
      (ctx.runsScored ? ` (${ctx.runsScored} scored)` : '');
    finishHalfAdvance(ctx);
  });
}

function sacBunt(ctx) {
  ctx.isAB = false;
  ctx.isOutOnPlay = 1;
  const stats = ensurePlayerStats(ctx.batter.id);
  stats.PA++;
  state.outs++;
  const f = ctx.fielders.join('-') || '?';
  ctx.notation = 'SH ' + f;
  // Default: each runner advances one base
  const defaultMoves = {};
  if (state.bases[3]) defaultMoves[3] = 'home';
  if (state.bases[2]) defaultMoves[2] = 3;
  if (state.bases[1]) defaultMoves[1] = 2;
  openRunnerModal(ctx, null, defaultMoves, () => {
    ctx.description = `${batterDisplay(ctx.batter)} sacrifice bunt, ${f}`;
    finishHalfAdvance(ctx);
  });
}

function doublePlay(ctx) {
  ctx.isAB = true;
  ctx.isOutOnPlay = 2;
  const stats = ensurePlayerStats(ctx.batter.id);
  stats.PA++; stats.AB++;
  state.outs += 2;
  const f = ctx.fielders.join('-') || '?';
  ctx.notation = f + ' DP';
  ctx.description = `${batterDisplay(ctx.batter)} into double play, ${f}`;
  // Most common DP: batter out at 1, runner on 1 forced at 2.
  // Auto-remove the runner on first if present; else let user decide via modal.
  if (state.bases[1]) {
    state.bases[1] = null;
  }
  // Allow user to override remaining runners
  const defaultMoves = {};
  if (state.bases[3]) defaultMoves[3] = 3; // hold by default
  if (state.bases[2]) defaultMoves[2] = 2;
  openRunnerModal(ctx, null, defaultMoves, () => {
    finishHalfAdvance(ctx);
  });
}

// ---------- Helpers for plays ----------

function collectRunners() {
  const runners = [];
  for (const b of [3, 2, 1]) {
    if (state.bases[b]) runners.push({ base: b, playerId: state.bases[b] });
  }
  return runners;
}

function clearBases() {
  state.bases[1] = null;
  state.bases[2] = null;
  state.bases[3] = null;
}

function scoreRun(playerId, ctx, isBatter = false) {
  const team = battingTeam();
  state.teamStats[team].R++;
  while (state.innings.length < state.inning) {
    state.innings.push({ away: 0, home: 0 });
  }
  state.innings[state.inning - 1][team]++;
  ctx.runsScored++;
  ctx.rbi++;
  const stats = ensurePlayerStats(playerId);
  stats.R++;
  // Credit RBI to the batter
  const bStats = ensurePlayerStats(ctx.batter.id);
  bStats.RBI++;
}

function batterDisplay(batter) {
  return batter.num ? `#${batter.num} ${batter.name}` : batter.name;
}

function forceAdvanceForWalk() {
  // Returns map: { 1: 2, 2: 3, 3: 'home' } only for forced runners.
  const moves = {};
  if (state.bases[1]) {
    if (state.bases[2]) {
      if (state.bases[3]) moves[3] = 'home';
      moves[2] = 3;
    }
    moves[1] = 2;
  }
  return moves;
}

function computeDefaultRunnerMoves(batterEndsBase, isOut) {
  // For hits/errors/fc: typical advancement
  const moves = {};
  if (batterEndsBase === 1) {
    // single: R3 scores, R2 to 3, R1 to 2
    if (state.bases[3]) moves[3] = 'home';
    if (state.bases[2]) moves[2] = 3;
    if (state.bases[1]) moves[1] = 2;
  } else if (batterEndsBase === 2) {
    if (state.bases[3]) moves[3] = 'home';
    if (state.bases[2]) moves[2] = 'home';
    if (state.bases[1]) moves[1] = 3;
  } else if (batterEndsBase === 3) {
    if (state.bases[3]) moves[3] = 'home';
    if (state.bases[2]) moves[2] = 'home';
    if (state.bases[1]) moves[1] = 'home';
  } else if (isOut) {
    // groundout/flyout: hold by default
    if (state.bases[3]) moves[3] = 3;
    if (state.bases[2]) moves[2] = 2;
    if (state.bases[1]) moves[1] = 1;
  }
  return moves;
}

function applyRunnerMovements(moves, ctx, batterEndsBase) {
  // moves: { fromBase: toBase|'home'|'out' }
  // Process from 3 -> 1 to avoid conflicts when shifting
  const newBases = { 1: null, 2: null, 3: null };
  for (const fromStr of ['3','2','1']) {
    const from = parseInt(fromStr, 10);
    const playerId = state.bases[from];
    if (!playerId) continue;
    const dest = moves[from];
    if (dest === 'home') {
      scoreRun(playerId, ctx);
    } else if (dest === 'out') {
      // runner out on the play (no run, no base)
    } else if (dest === undefined || dest === null) {
      newBases[from] = playerId;  // stays
    } else if (dest === from) {
      newBases[from] = playerId;
    } else {
      newBases[dest] = playerId;
    }
  }
  state.bases = newBases;
  if (batterEndsBase) {
    if (batterEndsBase === 'home') {
      scoreRun(ctx.batter.id, ctx, true);
    } else {
      // If something else is on that base (rare/edge), bump occupant home — should not happen with valid input
      state.bases[batterEndsBase] = ctx.batter.id;
    }
  }
}

// =========================================================
// Fielder picker modal
// =========================================================
let fielderPickerCb = null;
let fielderSequence = [];
let fielderPlayType = null;

function openFielderPicker(playType, cb) {
  fielderPlayType = playType;
  fielderPickerCb = cb;
  fielderSequence = [];

  // Single-fielder plays (just tap one)
  const singleFielder = ['FO', 'LO', 'PO', 'FOUL', 'SF', 'E'].includes(playType);
  const playLabel = {
    GO: 'Groundout', FO: 'Flyout', LO: 'Lineout', PO: 'Popout',
    FOUL: 'Foul Out', SF: 'Sac Fly', SAC: 'Sac Bunt',
    DP: 'Double Play', E: 'Reach on Error', FC: "Fielder's Choice"
  }[playType] || playType;

  document.getElementById('fielderTitle').textContent = playLabel + ' — Who fielded it?';
  document.getElementById('fielderHint').textContent = singleFielder
    ? 'Tap the fielder.'
    : 'Tap fielders in the order they touched the ball. Last tap = who recorded the out.';

  document.querySelectorAll('.pos-btn').forEach(b => {
    b.classList.remove('selected');
    const old = b.querySelector('.order-badge');
    if (old) old.remove();
  });
  updateFielderSequenceDisplay();
  document.getElementById('fielderModal').classList.remove('hidden');
}

function updateFielderSequenceDisplay() {
  const el = document.getElementById('fielderSequence');
  if (!fielderSequence.length) el.textContent = '—';
  else {
    const labels = fielderSequence.map(p => POSITIONS[p]).join(' → ');
    const code = fielderSequence.join('-');
    el.textContent = `${labels}   (${code})`;
  }
}

function setupFielderModal() {
  document.querySelectorAll('.pos-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pos = parseInt(btn.dataset.pos, 10);
      const singleFielder = ['FO', 'LO', 'PO', 'FOUL', 'SF', 'E'].includes(fielderPlayType);
      if (singleFielder) {
        document.querySelectorAll('.pos-btn').forEach(b => {
          b.classList.remove('selected');
          const old = b.querySelector('.order-badge');
          if (old) old.remove();
        });
        fielderSequence = [pos];
        btn.classList.add('selected');
      } else {
        fielderSequence.push(pos);
        btn.classList.add('selected');
        // Add order badge
        const existing = btn.querySelector('.order-badge');
        if (existing) existing.remove();
        const badge = document.createElement('span');
        badge.className = 'order-badge';
        badge.textContent = fielderSequence.length;
        btn.appendChild(badge);
      }
      updateFielderSequenceDisplay();
    });
  });

  document.getElementById('fielderClear').addEventListener('click', () => {
    fielderSequence = [];
    document.querySelectorAll('.pos-btn').forEach(b => {
      b.classList.remove('selected');
      const old = b.querySelector('.order-badge');
      if (old) old.remove();
    });
    updateFielderSequenceDisplay();
  });

  document.getElementById('fielderCancel').addEventListener('click', () => {
    document.getElementById('fielderModal').classList.add('hidden');
    fielderPickerCb = null;
  });

  document.getElementById('fielderConfirm').addEventListener('click', () => {
    if (!fielderSequence.length) {
      alert('Select at least one fielder.');
      return;
    }
    document.getElementById('fielderModal').classList.add('hidden');
    if (fielderPickerCb) {
      const cb = fielderPickerCb;
      fielderPickerCb = null;
      cb(fielderSequence.slice());
    }
  });
}

// =========================================================
// Runner advance modal
// =========================================================
let runnerCb = null;
let runnerCurrentMoves = {};
let runnerCurrentPlacement = null;
let runnerCurrentCtx = null;

function openRunnerModal(ctx, placement, defaultMoves, cb) {
  runnerCurrentMoves = Object.assign({}, defaultMoves);
  runnerCurrentPlacement = placement;
  runnerCurrentCtx = ctx;
  runnerCb = cb;

  const hasRunners = [1,2,3].some(b => state.bases[b]);
  const hasPlacement = placement && placement.batter;

  // If nothing to ask, just apply and continue immediately.
  if (!hasRunners && !hasPlacement) {
    applyRunnerMovements({}, ctx, null);
    runnerCb = null;
    cb();
    return;
  }

  const list = document.getElementById('runnerList');
  list.innerHTML = '';

  for (const b of [3, 2, 1]) {
    const playerId = state.bases[b];
    if (!playerId) continue;
    const p = getPlayer(playerId);
    list.appendChild(buildRunnerRow(b, p, defaultMoves[b]));
  }

  if (hasPlacement) {
    const row = document.createElement('div');
    row.className = 'runner-row';
    row.innerHTML = `<div class="runner-info">${escapeHtml(batterDisplay(ctx.batter))} <small>(batter → ${baseLabel(placement.batter)})</small></div>`;
    list.appendChild(row);
  }

  document.getElementById('runnerModal').classList.remove('hidden');
}

function buildRunnerRow(fromBase, player, defaultDest) {
  const row = document.createElement('div');
  row.className = 'runner-row';
  const info = document.createElement('div');
  info.className = 'runner-info';
  info.innerHTML = `${escapeHtml(batterDisplay(player))} <small>on ${baseLabel(fromBase)}</small>`;
  row.appendChild(info);

  const choices = document.createElement('div');
  choices.className = 'runner-choices';

  const opts = [];
  // Hold
  opts.push({ label: baseLabel(fromBase), value: fromBase });
  for (let b = fromBase + 1; b <= 3; b++) {
    opts.push({ label: baseLabel(b), value: b });
  }
  opts.push({ label: 'Home', value: 'home' });
  opts.push({ label: 'OUT', value: 'out', isOut: true });

  opts.forEach(o => {
    const btn = document.createElement('button');
    btn.className = 'runner-choice' + (o.isOut ? ' out' : '');
    btn.textContent = o.label;
    if (o.value === defaultDest || (defaultDest === undefined && o.value === fromBase)) {
      btn.classList.add('selected');
      runnerCurrentMoves[fromBase] = o.value;
    }
    btn.addEventListener('click', () => {
      // unselect siblings
      choices.querySelectorAll('.runner-choice').forEach(c => c.classList.remove('selected'));
      btn.classList.add('selected');
      runnerCurrentMoves[fromBase] = o.value;
    });
    choices.appendChild(btn);
  });

  row.appendChild(choices);
  return row;
}

function baseLabel(base) {
  return base === 1 ? '1B' : base === 2 ? '2B' : base === 3 ? '3B' : 'Home';
}

function setupRunnerModal() {
  document.getElementById('runnerCancel').addEventListener('click', () => {
    document.getElementById('runnerModal').classList.add('hidden');
    runnerCb = null;
  });
  document.getElementById('runnerConfirm').addEventListener('click', () => {
    document.getElementById('runnerModal').classList.add('hidden');
    // Apply movements
    // Count outs from runner OUT selections
    let extraOuts = 0;
    for (const k of Object.keys(runnerCurrentMoves)) {
      if (runnerCurrentMoves[k] === 'out') extraOuts++;
    }
    state.outs += extraOuts;
    runnerCurrentCtx.isOutOnPlay += extraOuts;
    applyRunnerMovements(
      runnerCurrentMoves,
      runnerCurrentCtx,
      runnerCurrentPlacement ? runnerCurrentPlacement.batter : null
    );
    if (runnerCb) {
      const cb = runnerCb;
      runnerCb = null;
      cb();
    }
  });
}

// =========================================================
// Finalization, log, half-inning advance
// =========================================================
function finishHalfAdvance(ctx) {
  // Add to log
  state.log.push({
    inning: state.inning,
    half: state.half,
    batterId: ctx.batter.id,
    batterName: ctx.batter.name,
    batterNum: ctx.batter.num,
    code: ctx.notation,
    text: ctx.description,
    runs: ctx.runsScored,
    snapshot: ctx.snapshot,
    outsAfter: state.outs
  });

  // Advance batter (always, after a PA completes)
  advanceBatter();

  // Check if half-inning ended
  if (state.outs >= 3) {
    // Add LOB
    const lob = (state.bases[1] ? 1 : 0) + (state.bases[2] ? 1 : 0) + (state.bases[3] ? 1 : 0);
    state.teamStats[battingTeam()].LOB += lob;
    endHalfInning();
  }

  save();
  renderGame();
}

function endHalfInning() {
  state.outs = 0;
  clearBases();
  if (state.half === 'top') {
    state.half = 'bottom';
  } else {
    state.half = 'top';
    state.inning++;
    state.innings.push({ away: 0, home: 0 });
  }
  state.log.push({
    inning: state.inning,
    half: state.half,
    isInningMarker: true
  });
}

// =========================================================
// Undo
// =========================================================
function undoLastPlay() {
  // Find most recent log entry that has snapshot (skip inning markers)
  for (let i = state.log.length - 1; i >= 0; i--) {
    const entry = state.log[i];
    if (entry.snapshot) {
      const snap = JSON.parse(entry.snapshot);
      state = snap;
      save();
      renderGame();
      return;
    }
  }
  alert('Nothing to undo.');
}

// =========================================================
// Stolen base / wild pitch / passed ball
// =========================================================
function openBasePlayPicker(kind) {
  // kind: 'SB', 'CS', 'WP', 'PB'
  const titleMap = { SB: 'Stolen Base', CS: 'Caught Stealing', WP: 'Wild Pitch', PB: 'Passed Ball' };
  document.getElementById('basePlayTitle').textContent = titleMap[kind];
  const choices = document.getElementById('basePlayChoices');
  choices.innerHTML = '';

  const runners = collectRunners().reverse();  // 1, 2, 3 order
  if (!runners.length) {
    choices.innerHTML = '<p class="hint">No runners on base.</p>';
  }
  runners.forEach(r => {
    const p = getPlayer(r.playerId);
    if (kind === 'SB' || kind === 'WP' || kind === 'PB') {
      // Advance one base (or score from 3)
      const dest = r.base === 3 ? 'home' : r.base + 1;
      const btn = document.createElement('button');
      btn.className = 'base-play-choice';
      btn.textContent = `${batterDisplay(p)}: ${baseLabel(r.base)} → ${baseLabel(dest)}`;
      btn.addEventListener('click', () => {
        const snapshot = JSON.stringify(state);
        const ctx = { batter: p, runsScored: 0, rbi: 0, snapshot };
        // For SB, we need to credit the SB stat to the runner, not give RBI to a "batter"
        if (dest === 'home') {
          state.teamStats[battingTeam()].R++;
          while (state.innings.length < state.inning) state.innings.push({ away: 0, home: 0 });
          state.innings[state.inning - 1][battingTeam()]++;
          ensurePlayerStats(r.playerId).R++;
        }
        if (dest === 'home') state.bases[r.base] = null;
        else {
          state.bases[dest] = r.playerId;
          state.bases[r.base] = null;
        }
        if (kind === 'SB') ensurePlayerStats(r.playerId).SB++;
        const code = kind === 'SB' ? `SB ${baseLabel(dest)}`
                    : kind === 'WP' ? 'WP'
                    : 'PB';
        state.log.push({
          inning: state.inning, half: state.half,
          batterId: r.playerId, batterName: p.name, batterNum: p.num,
          code, text: `${batterDisplay(p)} ${kind === 'SB' ? 'steals' : (kind === 'WP' ? 'advances on wild pitch' : 'advances on passed ball')} to ${baseLabel(dest)}`,
          runs: dest === 'home' ? 1 : 0,
          snapshot,
          outsAfter: state.outs,
          isBaseRunningPlay: true
        });
        document.getElementById('basePlayModal').classList.add('hidden');
        save();
        renderGame();
      });
      choices.appendChild(btn);
    } else if (kind === 'CS') {
      const dest = r.base === 3 ? 'home' : r.base + 1;
      const btn = document.createElement('button');
      btn.className = 'base-play-choice';
      btn.textContent = `${batterDisplay(p)}: caught stealing ${baseLabel(dest)}`;
      btn.addEventListener('click', () => {
        const snapshot = JSON.stringify(state);
        state.bases[r.base] = null;
        state.outs++;
        state.log.push({
          inning: state.inning, half: state.half,
          batterId: r.playerId, batterName: p.name, batterNum: p.num,
          code: `CS ${baseLabel(dest)}`,
          text: `${batterDisplay(p)} caught stealing ${baseLabel(dest)}`,
          runs: 0,
          snapshot,
          outsAfter: state.outs,
          isBaseRunningPlay: true
        });
        if (state.outs >= 3) {
          const lob = (state.bases[1] ? 1 : 0) + (state.bases[2] ? 1 : 0) + (state.bases[3] ? 1 : 0);
          state.teamStats[battingTeam()].LOB += lob;
          endHalfInning();
        }
        document.getElementById('basePlayModal').classList.add('hidden');
        save();
        renderGame();
      });
      choices.appendChild(btn);
    }
  });

  document.getElementById('basePlayModal').classList.remove('hidden');
}

// =========================================================
// Play log modal
// =========================================================
function renderPlayLog() {
  const container = document.getElementById('playLog');
  container.innerHTML = '';
  let lastInningHalf = '';
  let counter = 0;
  state.log.forEach(entry => {
    if (entry.isInningMarker) return;
    const ih = `${entry.half === 'top' ? 'Top' : 'Bot'} ${entry.inning}`;
    if (ih !== lastInningHalf) {
      const h = document.createElement('div');
      h.className = 'log-inning';
      h.textContent = ih;
      container.appendChild(h);
      lastInningHalf = ih;
      counter = 0;
    }
    counter++;
    const row = document.createElement('div');
    row.className = 'log-entry';
    row.innerHTML = `
      <span class="log-num">${counter}</span>
      <span>${escapeHtml(entry.text)}${entry.runs ? ` <b>(${entry.runs} R)</b>` : ''}</span>
      <span class="log-code">${escapeHtml(entry.code)}</span>
    `;
    container.appendChild(row);
  });
  if (!state.log.length) {
    container.innerHTML = '<p class="hint">No plays yet.</p>';
  }
}

// =========================================================
// Box score
// =========================================================
function renderBoxScore() {
  const container = document.getElementById('boxScoreContent');
  container.innerHTML = '';
  for (const team of ['away', 'home']) {
    const div = document.createElement('div');
    div.className = 'box-team';
    let html = `<h4>${escapeHtml(state.teams[team].name)}</h4>`;
    html += `<table class="box-table"><thead><tr>
      <th>#</th><th>Player</th><th>PA</th><th>AB</th><th>R</th><th>H</th>
      <th>RBI</th><th>BB</th><th>SO</th><th>SB</th>
    </tr></thead><tbody>`;
    state.teams[team].players.forEach(p => {
      const s = state.playerStats[p.id] || {};
      html += `<tr>
        <td>${p.num || '–'}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${s.PA||0}</td>
        <td>${s.AB||0}</td>
        <td>${s.R||0}</td>
        <td>${s.H||0}</td>
        <td>${s.RBI||0}</td>
        <td>${s.BB||0}</td>
        <td>${s.SO||0}</td>
        <td>${s.SB||0}</td>
      </tr>`;
    });
    const t = state.teamStats[team];
    html += `<tr><td></td><td><b>Totals</b></td>
      <td></td><td></td><td><b>${t.R}</b></td><td><b>${t.H}</b></td>
      <td></td><td></td><td></td><td></td></tr>`;
    html += `</tbody></table>`;
    html += `<p class="hint">Errors: ${t.E} · Left on base: ${t.LOB}</p>`;
    div.innerHTML = html;
    container.appendChild(div);
  }
}

// =========================================================
// Past Games (history)
// =========================================================
function renderHistoryList() {
  const container = document.getElementById('historyContent');
  const list = loadHistory();
  if (!list.length) {
    container.innerHTML = '<p class="hint">No completed games saved yet. Tap End Game in a game to save it here.</p>';
    return;
  }
  container.innerHTML = '';
  list.forEach(g => {
    const row = document.createElement('div');
    row.className = 'hist-row';
    const date = new Date(g.endedAt);
    const dateStr = date.toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
    const teamA = g.awayName || (g.state && g.state.teams.away.name) || 'Away';
    const teamH = g.homeName || (g.state && g.state.teams.home.name) || 'Home';
    const aR = g.awayR != null ? g.awayR : (g.state && g.state.teamStats.away.R) || 0;
    const hR = g.homeR != null ? g.homeR : (g.state && g.state.teamStats.home.R) || 0;
    const info = document.createElement('div');
    info.className = 'hist-info';
    info.innerHTML = `
      <div class="hist-teams">${escapeHtml(teamA)} <b>${aR}</b> @ ${escapeHtml(teamH)} <b>${hR}</b></div>
      <div class="hist-date">${escapeHtml(dateStr)}</div>
    `;
    const actions = document.createElement('div');
    actions.className = 'hist-actions';
    const viewBtn = document.createElement('button');
    viewBtn.className = 'primary';
    viewBtn.textContent = 'View';
    viewBtn.addEventListener('click', () => {
      renderArchivedDetail(g);
      document.getElementById('historyModal').classList.add('hidden');
      document.getElementById('historyDetailModal').classList.remove('hidden');
    });
    const delBtn = document.createElement('button');
    delBtn.className = 'hist-del';
    delBtn.textContent = '✕';
    delBtn.title = 'Delete from history';
    delBtn.addEventListener('click', () => {
      if (!confirm('Delete this game from history? This cannot be undone.')) return;
      const arr = loadHistory();
      const idx = arr.findIndex(x => x.id === g.id);
      if (idx >= 0) {
        arr.splice(idx, 1);
        saveHistory(arr);
        renderHistoryList();
      }
    });
    actions.appendChild(viewBtn);
    actions.appendChild(delBtn);
    row.appendChild(info);
    row.appendChild(actions);
    container.appendChild(row);
  });
}

function renderArchivedDetail(entry) {
  const snap = entry.state;
  const container = document.getElementById('historyDetailContent');

  const date = new Date(entry.endedAt);
  const aR = snap.teamStats.away.R, hR = snap.teamStats.home.R;
  const aName = snap.teams.away.name, hName = snap.teams.home.name;

  let result;
  if (aR === hR) result = `Tied ${aR}-${hR}`;
  else if (aR > hR) result = `${aName} won ${aR}-${hR}`;
  else result = `${hName} won ${hR}-${aR}`;

  document.getElementById('historyDetailTitle').textContent = result;

  let html = `<div class="hist-title">${escapeHtml(date.toLocaleString())}</div>`;

  // Final score panel
  html += `<div class="hist-final">
    <div>${escapeHtml(aName)}<br><b>${aR}</b></div>
    <div>${escapeHtml(hName)}<br><b>${hR}</b></div>
  </div>`;

  // Inning-by-inning line score
  html += '<table class="hist-line"><thead><tr><th></th>';
  for (let i = 0; i < snap.innings.length; i++) html += `<th>${i+1}</th>`;
  html += '<th>R</th><th>H</th><th>E</th></tr></thead><tbody>';
  for (const team of ['away', 'home']) {
    html += `<tr><td>${escapeHtml(snap.teams[team].name)}</td>`;
    snap.innings.forEach(inn => {
      const v = inn[team];
      html += `<td>${v != null ? v : '·'}</td>`;
    });
    const t = snap.teamStats[team];
    html += `<td><b>${t.R}</b></td><td>${t.H}</td><td>${t.E}</td></tr>`;
  }
  html += '</tbody></table>';

  // Box score per team
  for (const team of ['away', 'home']) {
    html += `<div class="box-team"><h4>${escapeHtml(snap.teams[team].name)}</h4>`;
    html += `<table class="box-table"><thead><tr>
      <th>#</th><th>Player</th><th>PA</th><th>AB</th><th>R</th><th>H</th>
      <th>RBI</th><th>BB</th><th>SO</th><th>SB</th>
    </tr></thead><tbody>`;
    snap.teams[team].players.forEach(p => {
      const s = (snap.playerStats && snap.playerStats[p.id]) || {};
      html += `<tr>
        <td>${escapeHtml(p.num || '–')}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${s.PA||0}</td><td>${s.AB||0}</td>
        <td>${s.R||0}</td><td>${s.H||0}</td>
        <td>${s.RBI||0}</td><td>${s.BB||0}</td>
        <td>${s.SO||0}</td><td>${s.SB||0}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  }

  // Play log
  html += '<h4>Play-by-Play</h4><div class="play-log">';
  let lastInningHalf = '';
  let counter = 0;
  (snap.log || []).forEach(e => {
    if (e.isInningMarker) return;
    const ih = `${e.half === 'top' ? 'Top' : 'Bot'} ${e.inning}`;
    if (ih !== lastInningHalf) {
      html += `<div class="log-inning">${escapeHtml(ih)}</div>`;
      lastInningHalf = ih;
      counter = 0;
    }
    counter++;
    html += `<div class="log-entry">
      <span class="log-num">${counter}</span>
      <span>${escapeHtml(e.text || '')}${e.runs ? ` <b>(${e.runs} R)</b>` : ''}</span>
      <span class="log-code">${escapeHtml(e.code || '')}</span>
    </div>`;
  });
  html += '</div>';

  container.innerHTML = html;
}

// =========================================================
// Roster edit modal
// =========================================================
function renderRosterModal() {
  const container = document.getElementById('rosterContent');
  container.innerHTML = '';

  for (const team of ['away', 'home']) {
    const div = document.createElement('div');
    div.className = 'roster-team';

    // Team name editable header
    const h4 = document.createElement('h4');
    const teamNameInput = document.createElement('input');
    teamNameInput.className = 'team-name-edit';
    teamNameInput.type = 'text';
    teamNameInput.value = state.teams[team].name;
    teamNameInput.placeholder = team === 'away' ? 'Away' : 'Home';
    teamNameInput.addEventListener('input', () => {
      state.teams[team].name = teamNameInput.value.trim() || (team === 'away' ? 'Away' : 'Home');
      save();
      renderScoreboard();
      renderBatter();
    });
    h4.appendChild(teamNameInput);
    div.appendChild(h4);

    // Players list
    const list = document.createElement('div');
    state.teams[team].players.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'roster-edit-row';

      const orderSpan = document.createElement('span');
      orderSpan.className = 'order-num';
      orderSpan.textContent = (i + 1) + '.';
      row.appendChild(orderSpan);

      const numIn = document.createElement('input');
      numIn.type = 'text';
      numIn.className = 'ed-num';
      numIn.placeholder = '#';
      numIn.maxLength = 3;
      numIn.value = p.num || '';
      numIn.addEventListener('input', () => {
        p.num = numIn.value.trim();
        save();
        renderBatter();
      });
      row.appendChild(numIn);

      const nameIn = document.createElement('input');
      nameIn.type = 'text';
      nameIn.className = 'ed-name';
      nameIn.placeholder = 'Name';
      nameIn.value = p.name;
      nameIn.addEventListener('input', () => {
        const v = nameIn.value.trim();
        if (v) p.name = v;
        save();
        renderBatter();
        renderBases();
      });
      row.appendChild(nameIn);

      const upBtn = document.createElement('button');
      upBtn.className = 'ed-btn';
      upBtn.textContent = '↑';
      upBtn.title = 'Move up in lineup';
      upBtn.addEventListener('click', () => {
        if (i === 0) return;
        const arr = state.teams[team].players;
        [arr[i-1], arr[i]] = [arr[i], arr[i-1]];
        save();
        renderRosterModal();
        renderGame();
      });
      row.appendChild(upBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'ed-btn del';
      delBtn.textContent = '✕';
      delBtn.title = 'Remove from roster';
      delBtn.addEventListener('click', () => {
        const onBase = [1,2,3].some(b => state.bases[b] === p.id);
        if (onBase) { alert('Player is currently on base. Resolve their play first.'); return; }
        if (!confirm(`Remove ${p.name} from the roster? Their stats will be kept in the box score.`)) return;
        state.teams[team].players.splice(i, 1);
        // Rebuild battingIndex if needed
        if (state.battingIndex[team] > state.teams[team].players.length) {
          state.battingIndex[team] = state.teams[team].players.length;
        }
        save();
        renderRosterModal();
        renderGame();
      });
      row.appendChild(delBtn);

      list.appendChild(row);
    });
    div.appendChild(list);

    // Add new player row
    const addRow = document.createElement('div');
    addRow.className = 'roster-add-row';
    const addNum = document.createElement('input');
    addNum.type = 'text';
    addNum.placeholder = '#';
    addNum.maxLength = 3;
    addRow.appendChild(addNum);
    const addName = document.createElement('input');
    addName.type = 'text';
    addName.placeholder = 'Add player';
    addRow.appendChild(addName);
    const addBtn = document.createElement('button');
    addBtn.className = 'primary';
    addBtn.textContent = 'Add';
    const doAdd = () => {
      const name = addName.value.trim();
      if (!name) { addName.focus(); return; }
      state.teams[team].players.push({
        id: makeId(),
        num: addNum.value.trim(),
        name: name
      });
      save();
      renderRosterModal();
      renderGame();
    };
    addBtn.addEventListener('click', doAdd);
    addName.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
    addRow.appendChild(addBtn);
    div.appendChild(addRow);

    container.appendChild(div);
  }
}

// =========================================================
// Wiring & init
// =========================================================
function wireGameButtons() {
  document.querySelectorAll('.play-btn').forEach(btn => {
    btn.addEventListener('click', () => handlePlay(btn.dataset.play));
  });

  document.getElementById('undoBtn').addEventListener('click', undoLastPlay);

  document.getElementById('logBtn').addEventListener('click', () => {
    renderPlayLog();
    document.getElementById('logModal').classList.remove('hidden');
  });
  document.getElementById('logClose').addEventListener('click', () => {
    document.getElementById('logModal').classList.add('hidden');
  });

  document.getElementById('menuBtn').addEventListener('click', () => {
    document.getElementById('menuModal').classList.remove('hidden');
  });
  document.getElementById('menuClose').addEventListener('click', () => {
    document.getElementById('menuModal').classList.add('hidden');
  });

  document.getElementById('menuBoxScore').addEventListener('click', () => {
    document.getElementById('menuModal').classList.add('hidden');
    renderBoxScore();
    document.getElementById('boxModal').classList.remove('hidden');
  });
  document.getElementById('boxClose').addEventListener('click', () => {
    document.getElementById('boxModal').classList.add('hidden');
  });

  document.getElementById('menuRoster').addEventListener('click', () => {
    document.getElementById('menuModal').classList.add('hidden');
    renderRosterModal();
    document.getElementById('rosterModal').classList.remove('hidden');
  });
  document.getElementById('rosterClose').addEventListener('click', () => {
    document.getElementById('rosterModal').classList.add('hidden');
  });

  // History
  const openHistory = () => {
    renderHistoryList();
    document.getElementById('menuModal').classList.add('hidden');
    document.getElementById('historyModal').classList.remove('hidden');
  };
  document.getElementById('menuHistory').addEventListener('click', openHistory);
  document.getElementById('setupHistoryBtn').addEventListener('click', openHistory);
  document.getElementById('historyClose').addEventListener('click', () => {
    document.getElementById('historyModal').classList.add('hidden');
  });
  document.getElementById('historyDetailClose').addEventListener('click', () => {
    document.getElementById('historyDetailModal').classList.add('hidden');
  });
  document.getElementById('historyDetailBack').addEventListener('click', () => {
    document.getElementById('historyDetailModal').classList.add('hidden');
    document.getElementById('historyModal').classList.remove('hidden');
  });

  document.getElementById('menuStealWP').addEventListener('click', () => {
    document.getElementById('menuModal').classList.add('hidden');
    // Sub-menu: pick kind
    document.getElementById('basePlayTitle').textContent = 'Pick a play';
    const choices = document.getElementById('basePlayChoices');
    choices.innerHTML = '';
    [
      ['SB', 'Stolen Base'],
      ['CS', 'Caught Stealing'],
      ['WP', 'Wild Pitch (advance)'],
      ['PB', 'Passed Ball (advance)']
    ].forEach(([k, label]) => {
      const b = document.createElement('button');
      b.className = 'base-play-choice';
      b.textContent = label;
      b.addEventListener('click', () => openBasePlayPicker(k));
      choices.appendChild(b);
    });
    document.getElementById('basePlayModal').classList.remove('hidden');
  });
  document.getElementById('basePlayCancel').addEventListener('click', () => {
    document.getElementById('basePlayModal').classList.add('hidden');
  });

  document.getElementById('menuSubBatter').addEventListener('click', () => {
    document.getElementById('menuModal').classList.add('hidden');
    if (confirm('Skip current batter (advance lineup without recording a PA)?')) {
      const snapshot = JSON.stringify(state);
      const b = currentBatter();
      advanceBatter();
      state.log.push({
        inning: state.inning, half: state.half,
        batterId: b ? b.id : null,
        batterName: b ? b.name : '',
        batterNum: b ? b.num : '',
        code: 'SKIP', text: `Lineup advanced past ${b ? batterDisplay(b) : ''}`,
        runs: 0, snapshot, outsAfter: state.outs,
        isBaseRunningPlay: true
      });
      save();
      renderGame();
    }
  });

  document.getElementById('menuEndHalf').addEventListener('click', () => {
    document.getElementById('menuModal').classList.add('hidden');
    if (confirm('End this half-inning now?')) {
      const snapshot = JSON.stringify(state);
      const lob = (state.bases[1] ? 1 : 0) + (state.bases[2] ? 1 : 0) + (state.bases[3] ? 1 : 0);
      state.teamStats[battingTeam()].LOB += lob;
      state.outs = 3;
      state.log.push({
        inning: state.inning, half: state.half,
        code: 'END', text: 'Half-inning ended manually',
        runs: 0, snapshot, outsAfter: 3,
        isBaseRunningPlay: true
      });
      endHalfInning();
      save();
      renderGame();
    }
  });

  document.getElementById('menuNewGame').addEventListener('click', () => {
    const hasData = state.log && state.log.length > 0;
    if (hasData) {
      const archive = confirm(
        'Save this game to Past Games before starting a new one?\n\n' +
        'OK = save & start new game\nCancel = don\'t save (you can still cancel the next prompt)'
      );
      if (archive) archiveCurrentGame();
    }
    if (!confirm('Start a new game now? Current game will be cleared.')) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });

  // Inline add-batter
  document.getElementById('addBatterBtn').addEventListener('click', addBatterInline);
  document.getElementById('newBatterName').addEventListener('keydown', e => {
    if (e.key === 'Enter') addBatterInline();
  });
  document.getElementById('newBatterToggle').addEventListener('click', () => {
    document.getElementById('batterAddRow').classList.remove('hidden');
    document.getElementById('newBatterToggle').classList.add('hidden');
    document.getElementById('newBatterName').focus();
  });

  // End game
  document.getElementById('menuEndGame').addEventListener('click', () => {
    document.getElementById('menuModal').classList.add('hidden');
    if (confirm('End the game now?')) {
      state.gameOver = true;
      const a = state.teamStats.away.R;
      const h = state.teamStats.home.R;
      let result;
      if (a === h) result = `Final: tied ${a}-${h}`;
      else if (a > h) result = `Final: ${state.teams.away.name} ${a}, ${state.teams.home.name} ${h}`;
      else result = `Final: ${state.teams.home.name} ${h}, ${state.teams.away.name} ${a}`;
      state.log.push({
        inning: state.inning, half: state.half,
        code: 'FINAL', text: result, runs: 0,
        snapshot: JSON.stringify(state),
        outsAfter: state.outs, isBaseRunningPlay: true
      });
      save();
      archiveCurrentGame();
      alert(result + '\n\nSaved to Past Games.');
      renderGame();
    }
  });

  // Click on bases to advance individual runners (quick action)
  document.querySelectorAll('.base[data-base]').forEach(el => {
    const base = parseInt(el.dataset.base, 10);
    if (base === 0) return;
    el.addEventListener('click', () => quickAdvanceRunner(base));
  });
}

function quickAdvanceRunner(fromBase) {
  if (!state.bases[fromBase]) return;
  const p = getPlayer(state.bases[fromBase]);
  // Quick menu: advance one base / score / out
  const choices = document.getElementById('basePlayChoices');
  document.getElementById('basePlayTitle').textContent = `Runner: ${batterDisplay(p)}`;
  choices.innerHTML = '';
  const opts = [];
  if (fromBase < 3) opts.push({ label: `Advance to ${baseLabel(fromBase + 1)}`, dest: fromBase + 1 });
  opts.push({ label: 'Score (Home)', dest: 'home' });
  opts.push({ label: 'OUT on play', dest: 'out' });
  opts.forEach(o => {
    const b = document.createElement('button');
    b.className = 'base-play-choice';
    b.textContent = o.label;
    b.addEventListener('click', () => {
      const snapshot = JSON.stringify(state);
      const ctx = { batter: p, runsScored: 0, rbi: 0, snapshot };
      if (o.dest === 'home') {
        state.teamStats[battingTeam()].R++;
        while (state.innings.length < state.inning) state.innings.push({ away: 0, home: 0 });
        state.innings[state.inning - 1][battingTeam()]++;
        ensurePlayerStats(state.bases[fromBase]).R++;
        state.bases[fromBase] = null;
      } else if (o.dest === 'out') {
        state.bases[fromBase] = null;
        state.outs++;
      } else {
        state.bases[o.dest] = state.bases[fromBase];
        state.bases[fromBase] = null;
      }
      state.log.push({
        inning: state.inning, half: state.half,
        batterId: p.id, batterName: p.name, batterNum: p.num,
        code: o.dest === 'out' ? 'OUT' : (o.dest === 'home' ? 'R' : 'ADV'),
        text: `${batterDisplay(p)} ${o.dest === 'home' ? 'scores' : (o.dest === 'out' ? 'out on basepath' : 'advances to ' + baseLabel(o.dest))}`,
        runs: o.dest === 'home' ? 1 : 0,
        snapshot, outsAfter: state.outs, isBaseRunningPlay: true
      });
      if (state.outs >= 3) {
        const lob = (state.bases[1] ? 1 : 0) + (state.bases[2] ? 1 : 0) + (state.bases[3] ? 1 : 0);
        state.teamStats[battingTeam()].LOB += lob;
        endHalfInning();
      }
      document.getElementById('basePlayModal').classList.add('hidden');
      save();
      renderGame();
    });
    choices.appendChild(b);
  });
  document.getElementById('basePlayModal').classList.remove('hidden');
}

// =========================================================
// Util
// =========================================================
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// =========================================================
// Boot
// =========================================================
function boot() {
  const saved = load();
  state = saved || freshState();

  initSetupUI();
  setupFielderModal();
  setupRunnerModal();
  wireGameButtons();

  if (state.setupComplete) {
    showScreen('game');
    renderGame();
  } else {
    showScreen('setup');
  }
}

document.addEventListener('DOMContentLoaded', boot);
