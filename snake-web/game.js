const BOARD_SIZE = 18;
const STORAGE_KEY = 'snake-legacy-save';
const LEADERBOARD_KEY = 'snake-legacy-leaderboard';
const DEFAULT_NAME = 'Player';

const levelPresets = [
  {
    name: 'Classic Grid',
    speed: 420,
    accent: '#6ef7a2',
    background: '#0b1d14',
    wallChance: 0,
    foodColor: '#f5d76d'
  },
  {
    name: 'Night Forest',
    speed: 210,
    accent: '#9affb0',
    background: '#0f1a13',
    wallChance: 2,
    foodColor: '#f7d86d'
  },
  {
    name: 'Retro Maze',
    speed: 180,
    accent: '#c3ff99',
    background: '#142216',
    wallChance: 5,
    foodColor: '#f7d86d'
  },
  {
    name: 'Signal Rush',
    speed: 155,
    accent: '#d7ffd1',
    background: '#0b1e1c',
    wallChance: 7,
    foodColor: '#f0d972'
  }
];

const gameState = {
  snake: [],
  direction: { x: 1, y: 0 },
  nextDirection: { x: 1, y: 0 },
  food: null,
  level: 1,
  score: 0,
  bestScore: 0,
  lives: 3,
  nameConfirmed: false,
  running: false,
  paused: false,
  gameOver: false,
  lastTime: 0,
  tickDelay: 170,
  audioEnabled: true,
  board: null,
  walls: [],
  leaderboard: []
};

const boardEl = document.getElementById('gameBoard');
const playerNameEl = document.getElementById('playerName');
const confirmNameBtn = document.getElementById('confirmNameBtn');
const levelValueEl = document.getElementById('levelValue');
const scoreValueEl = document.getElementById('scoreValue');
const bestValueEl = document.getElementById('bestValue');
const livesValueEl = document.getElementById('livesValue');
const levelNameEl = document.getElementById('levelName');
const statusBadgeEl = document.getElementById('statusBadge');
const leaderboardListEl = document.getElementById('leaderboardList');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const audioToggleBtn = document.getElementById('audioToggle');
let pointerStart = null;
let audioContext = null;
let musicTimer = null;
let musicStep = 0;

const musicNotes = [
  392, 440, 494, 440, 392, 330, 349, 392,
  440, 392, 349, 330, 294, 330, 349, 392
];

function buildBoardCells() {
  const cells = [];
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    boardEl.appendChild(cell);
    cells.push(cell);
  }
  gameState.board = cells;
}

function getCellIndex(x, y) {
  return y * BOARD_SIZE + x;
}

function saveProgress() {
  const save = {
    level: gameState.level,
    score: gameState.score,
    bestScore: gameState.bestScore,
    lives: gameState.lives,
    direction: gameState.direction,
    nextDirection: gameState.nextDirection,
    snake: gameState.snake,
    food: gameState.food,
    walls: gameState.walls,
    playerName: playerNameEl.value.trim(),
    audioEnabled: gameState.audioEnabled
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
}

function loadProgress() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;

  try {
    const save = JSON.parse(raw);
    if (!save || !Array.isArray(save.snake) || save.snake.length === 0) return false;

    gameState.level = save.level || 1;
    gameState.score = save.score || 0;
    gameState.bestScore = save.bestScore || 0;
    gameState.lives = Number.isInteger(save.lives) && save.lives > 0 ? Math.min(3, save.lives) : 3;
    gameState.direction = save.direction || { x: 1, y: 0 };
    gameState.nextDirection = save.nextDirection || { ...gameState.direction };
    gameState.snake = save.snake.map(segment => ({ ...segment }));
    gameState.food = save.food ? { ...save.food } : null;
    gameState.walls = Array.isArray(save.walls) ? save.walls.map(wall => ({ ...wall })) : [];
    gameState.audioEnabled = save.audioEnabled !== false;
    gameState.nameConfirmed = false;
    playerNameEl.value = save.playerName || DEFAULT_NAME;
    updateNameConfirmation();
    updateAudioButton();
    return true;
  } catch (error) {
    console.warn('Save invalid, resetting...', error);
    return false;
  }
}

function loadLeaderboard() {
  const stored = localStorage.getItem(LEADERBOARD_KEY);
  gameState.leaderboard = stored ? JSON.parse(stored) : [];
  renderLeaderboard();
}

function saveLeaderboard() {
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(gameState.leaderboard));
  renderLeaderboard();
}

function renderLeaderboard() {
  const items = gameState.leaderboard.slice(0, 5);
  leaderboardListEl.innerHTML = items.length
    ? items.map((entry, index) => `
        <li>
          <strong>#${index + 1} ${entry.name}</strong>
          <span>${entry.score}</span>
        </li>
      `).join('')
    : '<li><strong>Nessun record</strong><span>0</span></li>';
}

function addLeaderboardEntry(name, score) {
  const entry = { name: name || DEFAULT_NAME, score };
  const next = [...gameState.leaderboard, entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  gameState.leaderboard = next;
  saveLeaderboard();
}

function updateStats() {
  levelValueEl.textContent = String(gameState.level);
  scoreValueEl.textContent = String(gameState.score);
  bestValueEl.textContent = String(gameState.bestScore);
  livesValueEl.textContent = String(gameState.lives);

  const preset = levelPresets[(gameState.level - 1) % levelPresets.length];
  levelNameEl.textContent = `Livello ${gameState.level} · ${preset.name}`;

  const root = document.documentElement;
  root.style.setProperty('--accent', preset.accent);
  root.style.setProperty('--board', preset.background);
}

function setStatus(text, tone = 'neutral') {
  statusBadgeEl.textContent = text;
  const colors = {
    neutral: 'rgba(126, 247, 164, 0.14)',
    danger: 'rgba(255, 123, 114, 0.14)',
    warn: 'rgba(251, 198, 88, 0.14)'
  };
  statusBadgeEl.style.background = colors[tone] || colors.neutral;
  statusBadgeEl.style.borderColor = tone === 'danger' ? 'rgba(255, 123, 114, 0.32)' : 'rgba(255,255,255,0.15)';
  statusBadgeEl.style.color = tone === 'danger' ? '#ffc3be' : '#dff9ff';
}

function generateWalls(levelIndex) {
  const walls = [];
  const preset = levelPresets[levelIndex % levelPresets.length];
  const wallCount = preset.wallChance || 0;

  if (wallCount <= 0) return walls;

  for (let i = 0; i < wallCount * 4; i += 1) {
    const x = Math.floor(Math.random() * BOARD_SIZE);
    const y = Math.floor(Math.random() * BOARD_SIZE);

    if ((x === 0 && y === 0) || (x === 1 && y === 0)) continue;
    walls.push({ x, y });
  }

  return walls.filter((wall, index, arr) => arr.findIndex(next => next.x === wall.x && next.y === wall.y) === index);
}

function createInitialState(levelNumber = 1, preserveScore = false) {
  const preset = levelPresets[(levelNumber - 1) % levelPresets.length];
  const startX = 8;
  const startY = 8;
  const snake = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY }
  ];

  gameState.snake = snake;
  gameState.direction = { x: 1, y: 0 };
  gameState.nextDirection = { x: 1, y: 0 };
  gameState.level = levelNumber;
  if (!preserveScore) {
    gameState.score = 0;
  }
  gameState.running = false;
  gameState.paused = false;
  gameState.gameOver = false;
  gameState.tickDelay = Math.max(120, 420 - (levelNumber - 1) * 35);
  gameState.walls = generateWalls(levelNumber - 1);
  spawnFood();
  updateStats();
  render();
}

function spawnFood() {
  const occupied = new Set(gameState.snake.map(segment => `${segment.x},${segment.y}`));
  gameState.walls.forEach(wall => occupied.add(`${wall.x},${wall.y}`));

  const freeCells = [];
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const key = `${x},${y}`;
      if (!occupied.has(key)) freeCells.push({ x, y });
    }
  }

  if (freeCells.length === 0) {
    gameState.food = null;
    return;
  }

  const nextFood = freeCells[Math.floor(Math.random() * freeCells.length)];
  gameState.food = nextFood;
}

function setDirection(next) {
  const current = gameState.direction;
  const isOpposite = current.x + next.x === 0 && current.y + next.y === 0;
  if (!isOpposite) {
    gameState.nextDirection = next;
  }
}

function setDirectionFromPosition(clientX, clientY) {
  const boardRect = boardEl.getBoundingClientRect();
  const centerX = boardRect.left + boardRect.width / 2;
  const centerY = boardRect.top + boardRect.height / 2;
  const deltaX = clientX - centerX;
  const deltaY = clientY - centerY;

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    setDirection(deltaX > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
  } else {
    setDirection(deltaY > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
  }
}

function advanceGame() {
  if (!gameState.running || gameState.paused) return;

  gameState.direction = { ...gameState.nextDirection };
  const head = gameState.snake[0];
  const nextHead = {
    x: head.x + gameState.direction.x,
    y: head.y + gameState.direction.y
  };

  const outOfBounds = nextHead.x < 0 || nextHead.x >= BOARD_SIZE || nextHead.y < 0 || nextHead.y >= BOARD_SIZE;
  const wallHit = gameState.walls.some(wall => wall.x === nextHead.x && wall.y === nextHead.y);
  const bodyHit = gameState.snake.some(segment => segment.x === nextHead.x && segment.y === nextHead.y);

  if (outOfBounds || wallHit || bodyHit) {
    loseLife();
    return;
  }

  gameState.snake.unshift(nextHead);

  if (gameState.food && nextHead.x === gameState.food.x && nextHead.y === gameState.food.y) {
    gameState.score += 10;
    gameState.bestScore = Math.max(gameState.bestScore, gameState.score);
    playTone('eat');
    spawnFood();
    if (gameState.score > 0 && gameState.score % 50 === 0) {
      completeLevel();
      return;
    }
  } else {
    gameState.snake.pop();
  }

  if (gameState.score > gameState.bestScore) {
    gameState.bestScore = gameState.score;
  }

  updateStats();
  saveProgress();
  render();
}

function completeLevel() {
  const levelNumber = gameState.level + 1;
  const playerName = playerNameEl.value.trim() || DEFAULT_NAME;
  gameState.score += 25;
  gameState.bestScore = Math.max(gameState.bestScore, gameState.score);
  addLeaderboardEntry(playerName, gameState.score);
  setStatus('Livello OK', 'warn');
  playTone('level');
  createInitialState(levelNumber, true);
  saveProgress();
  render();
}

function finishGame() {
  const playerName = playerNameEl.value.trim() || DEFAULT_NAME;
  gameState.running = false;
  gameState.paused = false;
  gameState.gameOver = true;
  stopMusic();
  addLeaderboardEntry(playerName, gameState.score);
  setStatus('Game Over', 'danger');
  playTone('gameover');
  render();
}

function loseLife() {
  gameState.lives -= 1;
  if (gameState.lives <= 0) {
    finishGame();
    return;
  }

  stopMusic();
  playTone('gameover');
  createInitialState(gameState.level, true);
  gameState.running = true;
  gameState.lastTime = performance.now();
  setStatus(`Vita persa · ${gameState.lives} rimaste`, 'warn');
  startMusic();
  saveProgress();
}

function resetGame() {
  stopMusic();
  gameState.score = 0;
  gameState.level = 1;
  gameState.running = false;
  gameState.paused = false;
  createInitialState(1, false);
  setStatus('Pronto');
  saveProgress();
}

function loadGame() {
  const hadSave = loadProgress();
  if (hadSave) {
    gameState.running = false;
    gameState.paused = false;
    updateStats();
    setStatus('Salvato');
  } else {
    resetGame();
  }
  render();
  loadLeaderboard();
}

function render() {
  for (const cell of gameState.board) {
    cell.className = 'cell';
  }

  gameState.walls.forEach(wall => {
    const index = getCellIndex(wall.x, wall.y);
    if (gameState.board[index]) gameState.board[index].classList.add('wall');
  });

  gameState.snake.forEach((segment, index) => {
    const cell = gameState.board[getCellIndex(segment.x, segment.y)];
    if (cell) {
      cell.classList.add('snake');
      if (index === 0) cell.style.borderRadius = '5px';
    }
  });

  if (gameState.food) {
    const foodCell = gameState.board[getCellIndex(gameState.food.x, gameState.food.y)];
    if (foodCell) foodCell.classList.add('food');
  }

  updateStats();
}

function startGame() {
  const name = playerNameEl.value.trim();
  if (!name || !gameState.nameConfirmed) {
    setStatus(name ? 'Conferma il nome' : 'Inserisci il nome', 'warn');
    playerNameEl.focus();
    return;
  }
  playerNameEl.value = name;
  if (gameState.gameOver) {
    createInitialState(1, false);
    gameState.lives = 3;
    updateStats();
  }
  if (!gameState.running) {
    gameState.running = true;
    gameState.paused = false;
    gameState.lastTime = performance.now();
    setStatus('Gioco attivo');
    playTone('start');
    startMusic();
  }
}

function togglePause() {
  if (!gameState.running) return;
  gameState.paused = !gameState.paused;
  if (gameState.paused) {
    stopMusic();
  } else {
    startMusic();
  }
  setStatus(gameState.paused ? 'Pausa' : 'Gioco attivo');
}

function updateLoop(timestamp) {
  const delta = timestamp - gameState.lastTime;
  if (gameState.running && !gameState.paused && delta >= gameState.tickDelay) {
    advanceGame();
    gameState.lastTime = timestamp;
  }
  requestAnimationFrame(updateLoop);
}

function getAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioContext) audioContext = new AudioCtx();
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

function playTone(type) {
  if (!gameState.audioEnabled) return;

  const ctx = getAudioContext();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  const settings = {
    eat: { freq: 620, duration: 0.08, gain: 0.04 },
    level: { freq: 820, duration: 0.14, gain: 0.05 },
    gameover: { freq: 180, duration: 0.24, gain: 0.06 },
    start: { freq: 440, duration: 0.09, gain: 0.04 }
  };

  const config = settings[type] || settings.eat;
  oscillator.type = 'square';
  oscillator.frequency.value = config.freq;
  gain.gain.value = config.gain;

  oscillator.start();
  setTimeout(() => {
    oscillator.stop();
  }, config.duration * 1000);
}

function playMusicNote() {
  const ctx = getAudioContext();
  if (!ctx || !gameState.audioEnabled || gameState.paused || !gameState.running) return;

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const now = ctx.currentTime;

  oscillator.type = 'square';
  oscillator.frequency.value = musicNotes[musicStep % musicNotes.length];
  gain.gain.setValueAtTime(0.045, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.19);
  musicStep += 1;
}

function startMusic() {
  if (!gameState.audioEnabled || musicTimer || !gameState.running || gameState.paused) return;
  getAudioContext();
  playMusicNote();
  musicTimer = setInterval(playMusicNote, 210);
}

function stopMusic() {
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

function toggleAudio() {
  gameState.audioEnabled = !gameState.audioEnabled;
  if (gameState.audioEnabled && gameState.running && !gameState.paused) {
    startMusic();
  } else if (!gameState.audioEnabled) {
    stopMusic();
  }
  updateAudioButton();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'), audioEnabled: gameState.audioEnabled }));
}

function updateAudioButton() {
  audioToggleBtn.textContent = gameState.audioEnabled ? '🔊' : '🔇';
}

document.addEventListener('keydown', (event) => {
  const moveMap = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    w: { x: 0, y: -1 },
    s: { x: 0, y: 1 },
    a: { x: -1, y: 0 },
    d: { x: 1, y: 0 }
  };

  const next = moveMap[event.key] || moveMap[event.key.toLowerCase()];
  if (next) {
    event.preventDefault();
    setDirection(next);
  }
});

document.querySelectorAll('[data-direction]').forEach(button => {
  button.addEventListener('click', () => {
    const map = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 }
    };
    setDirection(map[button.dataset.direction]);
  });
});

boardEl.addEventListener('pointerdown', (event) => {
  pointerStart = { x: event.clientX, y: event.clientY };
});

boardEl.addEventListener('pointerup', (event) => {
  if (!pointerStart) return;

  const deltaX = event.clientX - pointerStart.x;
  const deltaY = event.clientY - pointerStart.y;
  pointerStart = null;

  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 24) {
    setDirectionFromPosition(event.clientX, event.clientY);
  } else if (Math.abs(deltaX) > Math.abs(deltaY)) {
    setDirection(deltaX > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
  } else {
    setDirection(deltaY > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
  }
});

boardEl.addEventListener('pointercancel', () => {
  pointerStart = null;
});

function updateNameConfirmation() {
  startBtn.disabled = !gameState.nameConfirmed;
  confirmNameBtn.classList.toggle('confirmed', gameState.nameConfirmed);
  confirmNameBtn.setAttribute('aria-pressed', String(gameState.nameConfirmed));
}

confirmNameBtn.addEventListener('click', () => {
  const name = playerNameEl.value.trim();
  if (!name) {
    setStatus('Inserisci il nome', 'warn');
    playerNameEl.focus();
    return;
  }

  playerNameEl.value = name;
  gameState.nameConfirmed = true;
  updateNameConfirmation();
  saveProgress();
  startGame();
});

playerNameEl.addEventListener('input', () => {
  gameState.nameConfirmed = false;
  updateNameConfirmation();
});

startBtn.addEventListener('click', startGame);
pauseBtn.addEventListener('click', togglePause);
audioToggleBtn.addEventListener('click', toggleAudio);

buildBoardCells();
loadLeaderboard();
loadGame();
requestAnimationFrame(updateLoop);
