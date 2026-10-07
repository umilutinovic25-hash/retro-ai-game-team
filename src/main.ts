import "./styles.css";
import { gameClient, GameApiError, connectGameEvents } from "./api/gameClient.ts";
import { getTickMs } from "./game/snakeConfig.ts";
import { validateGameSnapshot, type GameSnapshot } from "./game/gameProtocol.ts";
import { isOpposite, type Direction } from "./game/snakeEngine.ts";
import { createRenderer, type Renderer } from "./rendering/canvasRenderer.ts";
import { createSnapshotAdapter, type RenderEvent } from "./rendering/snapshotAdapter.ts";
import { createSoundPlayer } from "./audio/sound.ts";
import { DIFFICULTY_CONFIGS, isDifficulty, type Difficulty } from "./ui/difficulty.ts";
import { addEntry, loadRecords, qualifies, recordGame, sanitizeName, saveRecords, type Records } from "./ui/records.ts";
import { SETTING_KEYS, bestKey, readBest, readSetting, writeSetting } from "./ui/settings.ts";
import { createInputBuffer } from "./ui/inputBuffer.ts";
import { createCountdown } from "./ui/countdown.ts";
import { swipeDirection } from "./ui/swipe.ts";

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Snake UI nije kompletno inicijalizovan: #${id}`);
  return element as T;
}

const gameBoard = byId<HTMLCanvasElement>("board");
const boardFrameElement = document.querySelector<HTMLElement>(".board-frame");
if (!boardFrameElement) throw new Error("Snake UI nije kompletno inicijalizovan: .board-frame");
const boardFrame: HTMLElement = boardFrameElement;
const score = byId("score");
const bestScore = byId("best-score");
const status = byId("status");
const pace = byId("pace");
const connection = byId("server-connection");
const pause = byId<HTMLButtonElement>("pause");
const restartButton = byId<HTMLButtonElement>("restart");
const gameOverlay = byId("game-overlay");
const gameOverlayTitle = byId("overlay-title");
const gameOverlayMessage = byId("overlay-message");
const gameOverlayActionButton = byId<HTMLButtonElement>("overlay-action");
const countdownElement = byId("countdown");
const nameForm = byId<HTMLFormElement>("name-form");
const nameInput = byId<HTMLInputElement>("name-input");
const nameRank = byId("name-rank");
const askAdvice = byId<HTMLButtonElement>("shop-advice-button");
const adviceMessage = byId("shop-advice-output");
const askAgent = byId<HTMLButtonElement>("shop-agent-button");
const agentMessage = byId("shop-agent-output");
const runXpValue = byId("xp-value");
const runLevelValue = byId("level-value");
const runPerkPointsValue = byId("perk-points-value");
const runExtraXpValue = byId("extra-xp-value");
const runLuckValue = byId("luck-value");
const runLifeValue = byId("life-value");
const runExtraXpCubes = byId("extra-xp-cubes");
const runLuckCubes = byId("luck-cubes");
const runLifeCubes = byId("life-cubes");
const toggleShopButton = byId<HTMLButtonElement>("shop-toggle");
const shopPanel = byId("perk-shop");
const shopXpNumeric = byId("shop-xp");
const shopLevelNumeric = byId("shop-level");
const availableShopPoints = byId("shop-points");
const shopXpValue = byId("shop-extra-xp-value");
const shopLuckyValue = byId("shop-luck-value");
const shopChargesValue = byId("shop-life-value");
const shopXpCubes = byId("shop-extra-xp-cubes");
const shopLuckyCubes = byId("shop-luck-cubes");
const shopChargesCubes = byId("shop-life-cubes");
const purchaseExtraXpButton = byId<HTMLButtonElement>("buy-extra-xp");
const purchaseExtraLifeButton = byId<HTMLButtonElement>("buy-extra-life");
const purchaseLuckButton = byId<HTMLButtonElement>("buy-luck");
const closeShopButton = byId<HTMLButtonElement>("shop-close");
const shopStatusMessage = byId("shop-message");
const muteButton = byId<HTMLButtonElement>("mute");
const colorblindButton = byId<HTMLButtonElement>("colorblind");
const recordsButton = byId<HTMLButtonElement>("records-open");
const recordsDialog = byId<HTMLDialogElement>("records-dialog");
const recordsList = byId("records-list");
const recordsEmpty = byId("records-empty");
const statGames = byId("stat-games");
const statFood = byId("stat-food");
const statLength = byId("stat-length");
const statCombo = byId("stat-combo");
const difficultyButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-difficulty]")];

const COUNT_MS = 550;
const SWIPE_MIN_PX = 24;
const ADVICE_IDLE = "ASK WHETHER TO BUY A PERK OR WAIT.";
const AGENT_IDLE = "PLAN YOUR NEXT PERK PURCHASES WITH AI.";

const adapter = createSnapshotAdapter();
const sound = createSoundPlayer();
let renderer: Renderer | null = null;
let game: GameSnapshot | null = null;
let displayedScore = 0;
let best = 0;
const savedDifficulty = readSetting(SETTING_KEYS.difficulty);
let difficulty: Difficulty = isDifficulty(savedDifficulty) ? savedDifficulty : "normal";
let colorblind = readSetting(SETTING_KEYS.colorblind) === "1";
let records: Records = loadRecords();
let gameFood = 0;
let pendingRecord: { score: number } | null = null;
let startDirection: Direction | null = null;
let disconnectEvents: (() => void) | undefined;
let shopVisible = false;
let adviceAbort: AbortController | null = null;
let agentAbort: AbortController | null = null;

function clearAdvice(message = ADVICE_IDLE): void {
  adviceAbort?.abort();
  adviceAbort = null;
  adviceMessage.textContent = message;
  agentAbort?.abort();
  agentAbort = null;
  agentMessage.textContent = AGENT_IDLE;
}

function haptic(pattern: number | number[]): void {
  if (!sound.isMuted() && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
}

function replayAnimation(element: HTMLElement, className: string): void {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function renderCubes(element: HTMLElement, filled: number, total: number): void {
  element.replaceChildren();
  for (let index = 0; index < total; index += 1) {
    const cube = document.createElement("span");
    cube.className = index < filled ? "perk-cube filled" : "perk-cube";
    element.append(cube);
  }
}

const countdown = createCountdown({
  stepMs: COUNT_MS,
  onLabel: (label) => {
    countdownElement.hidden = false;
    countdownElement.textContent = label;
    countdownElement.dataset.go = String(label === "GO!");
    replayAnimation(countdownElement, "count-pop");
    sound.play(label === "GO!" ? "go" : "count");
    haptic(label === "GO!" ? 40 : 15);
  },
  onHide: () => { countdownElement.hidden = true; },
});

function cancelCountdown(): void {
  startDirection = null;
  countdown.cancel();
  if (game) render(game);
}

function runCountdown(onDone: () => void): void {
  countdown.start(() => {
    onDone();
    if (game) render(game);
  });
  if (game) render(game);
}

function sendMove(direction: Direction): void {
  if (game) void runAction(() => gameClient.move(game!.id, direction));
}
const inputs = createInputBuffer(sendMove);

function handleEvents(events: RenderEvent[], next: GameSnapshot, before: GameSnapshot | null): void {
  for (const event of events) {
    if (event.kind === "ate") {
      gameFood += 1;
      sound.play("eat");
      haptic(12);
    } else if (event.kind === "lucky") {
      sound.play("gold");
      haptic([12, 30, 12]);
    } else if (event.kind === "levelUp") {
      sound.play("speedup");
      renderer?.banner("LEVEL UP!", "#2ee6a0");
    } else if (event.kind === "purchase") {
      sound.play("gem");
    } else if (event.kind === "died") {
      sound.play("death");
      haptic([60, 40, 120]);
      finishGame(next);
    } else if (event.kind === "won") {
      sound.play("record");
      finishGame(next);
    }
  }
  const from = before?.state.status;
  const to = next.state.status;
  if (from === "ready" && to === "playing") sound.play("start");
  else if (from === "playing" && to === "paused") sound.play("pause");
  else if (from === "paused" && to === "playing") sound.play("resume");
}

function finishGame(final: GameSnapshot): void {
  const finalScore = final.players[0].score;
  records = recordGame(records, { food: gameFood, length: final.players[0].snake.length, combo: 0 });
  saveRecords(records);
  if (qualifies(records, finalScore)) {
    pendingRecord = { score: finalScore };
    const rank = records.top.filter((entry) => entry.score >= finalScore).length + 1;
    nameRank.textContent = `NEW HIGH SCORE — #${rank}`;
    nameForm.hidden = false;
    nameInput.value = "";
    window.setTimeout(() => nameInput.focus(), 350);
    window.setTimeout(() => sound.play("record"), 600);
  }
}

function applySnapshot(value: unknown): void {
  const next = validateGameSnapshot(value);
  if (!next || (game && next.id !== game.id) || (game && next.revision < game.revision)) return;
  if (game && (next.revision !== game.revision || next.state.status !== "paused")) clearAdvice();
  if (!renderer) {
    renderer = createRenderer(gameBoard, { gridSize: next.config.gridSize, maxComboMultiplier: 4 });
    renderer.setColorblind(colorblind);
  }
  const adapted = adapter.adapt(next);
  renderer.update(adapted.state, adapted.moved, getTickMs(next.config, next.players[0].score));
  if (adapted.moved) inputs.tick();
  if (next.state.status !== "playing") inputs.reset();
  const before = game;
  game = next;
  handleEvents(adapted.events, next, before);
  render(next);
}

function render(next: GameSnapshot): void {
  const player = next.players[0];
  const { progression, perks } = player;
  const { config } = next;
  const state = { status: next.state.status, score: player.score };
  const counting = countdown.isRunning();

  if (state.score !== displayedScore) {
    if (state.score > displayedScore) replayAnimation(score, "score-bump");
    displayedScore = state.score;
  }
  score.textContent = String(state.score);
  if (state.score > best) {
    best = state.score;
    writeSetting(bestKey(difficulty), String(best));
    replayAnimation(bestScore, "best-bump");
  }
  bestScore.textContent = String(best);

  const tickMs = getTickMs(config, state.score);
  pace.textContent = `${(config.startingSpeedMs / tickMs).toFixed(1)}×`;
  const statusText = counting ? "GET READY"
    : next.configError && state.status === "playing" ? "CONFIG FALLBACK"
      : state.status === "game_over" ? "GAME OVER"
        : state.status === "won" ? "BOARD CLEAR"
          : state.status === "paused" ? "PAUSED"
            : state.status === "ready" ? "READY" : "PLAYING";
  status.textContent = statusText;
  status.dataset.state = counting ? "ready" : state.status;

  runXpValue.textContent = String(progression.xp);
  runLevelValue.textContent = String(progression.level);
  runPerkPointsValue.textContent = String(progression.perkPoints);
  runExtraXpValue.textContent = `${perks.extraXp.level} / 5`;
  runLuckValue.textContent = `${perks.luck.level} / 5`;
  runLifeValue.textContent = `${perks.extraLife.charges} / 2`;
  renderCubes(runExtraXpCubes, perks.extraXp.level, 5);
  renderCubes(runLuckCubes, perks.luck.level, 5);
  renderCubes(runLifeCubes, perks.extraLife.charges, 2);
  availableShopPoints.textContent = String(progression.perkPoints);
  shopXpNumeric.textContent = String(progression.xp);
  shopLevelNumeric.textContent = String(progression.level);
  shopXpValue.textContent = `${perks.extraXp.level} / 5`;
  shopLuckyValue.textContent = `${perks.luck.level} / 5`;
  shopChargesValue.textContent = `${perks.extraLife.charges} / 2`;
  renderCubes(shopXpCubes, perks.extraXp.level, 5);
  renderCubes(shopLuckyCubes, perks.luck.level, 5);
  renderCubes(shopChargesCubes, perks.extraLife.charges, 2);
  const isPaused = state.status === "paused";
  const extraXpCost = perks.extraXp.nextCost;
  const extraLifeCost = perks.extraLife.nextCost;
  const luckCost = perks.luck.nextCost;
  purchaseExtraXpButton.textContent = extraXpCost === null ? "MAX LEVEL" : `BUY · ${extraXpCost} PT`;
  purchaseExtraLifeButton.textContent = extraLifeCost === null ? "MAX CHARGES" : `BUY · ${extraLifeCost} PT`;
  purchaseLuckButton.textContent = luckCost === null ? "MAX LEVEL" : `BUY · ${luckCost} PT`;
  purchaseExtraXpButton.disabled = !isPaused || extraXpCost === null || progression.perkPoints < extraXpCost;
  purchaseExtraLifeButton.disabled = !isPaused || extraLifeCost === null || progression.perkPoints < extraLifeCost;
  purchaseLuckButton.disabled = !isPaused || luckCost === null || progression.perkPoints < luckCost;
  toggleShopButton.disabled = state.status !== "playing" && state.status !== "paused";
  toggleShopButton.textContent = isPaused && shopVisible ? "CLOSE SHOP" : "SHOP";
  shopPanel.hidden = !isPaused || !shopVisible;

  gameOverlay.hidden = state.status === "playing" || (isPaused && shopVisible) || counting;
  gameOverlay.dataset.state = state.status;
  gameOverlayActionButton.hidden = state.status === "ready";
  pause.textContent = state.status === "paused" ? "RESUME" : "PAUSE";
  pause.disabled = state.status === "ready" || state.status === "game_over" || state.status === "won";
  askAdvice.disabled = state.status !== "paused" || !shopVisible || adviceAbort !== null;
  askAgent.disabled = state.status !== "paused" || !shopVisible || agentAbort !== null;
  const locked = state.status === "playing" || state.status === "paused" || counting;
  difficultyButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.difficulty === difficulty));
    button.disabled = locked;
  });

  if (state.status === "ready") {
    gameOverlayTitle.textContent = "READY?";
    gameOverlayMessage.textContent = "PRESS AN ARROW KEY OR TAP A DIRECTION TO START";
  } else if (state.status === "paused") {
    gameOverlayTitle.textContent = "PAUSED";
    gameOverlayMessage.textContent = "PRESS P, SPACE OR RESUME TO CONTINUE";
    gameOverlayActionButton.textContent = "RESUME";
  } else if (state.status === "game_over") {
    gameOverlayTitle.textContent = "GAME OVER";
    gameOverlayMessage.textContent = `FINAL SCORE: ${state.score} // PRESS R TO RESTART`;
    gameOverlayActionButton.textContent = "PLAY AGAIN";
  } else if (state.status === "won") {
    gameOverlayTitle.textContent = "BOARD CLEAR";
    gameOverlayMessage.textContent = `FINAL SCORE: ${state.score} // PERFECT RUN`;
    gameOverlayActionButton.textContent = "NEW GAME";
  }
  if (state.status !== "game_over" && state.status !== "won") {
    nameForm.hidden = true;
    pendingRecord = null;
  }
}

function reportError(error: unknown): void {
  const message = error instanceof GameApiError ? error.message : "GAME SERVER REQUEST FAILED.";
  connection.textContent = "SERVER OFFLINE";
  connection.dataset.connection = "offline";
  status.textContent = "SERVER OFFLINE";
  status.dataset.state = "offline";
  if (!game) {
    gameOverlay.hidden = false;
    gameOverlayTitle.textContent = "SERVER UNAVAILABLE";
    gameOverlayMessage.textContent = `${message} START THE SERVER AND RELOAD.`;
    gameOverlayActionButton.hidden = true;
  }
}

async function runAction(action: () => Promise<GameSnapshot>): Promise<boolean> {
  try {
    applySnapshot(await action());
    return true;
  } catch (error) {
    reportError(error);
    return false;
  }
}

async function restart(): Promise<void> {
  if (!game) {
    await initializeGame();
    return;
  }
  cancelCountdown();
  inputs.reset();
  displayedScore = 0;
  gameFood = 0;
  shopVisible = false;
  clearAdvice();
  await runAction(() => gameClient.restart(game!.id));
}

function handleDirection(direction: Direction): void {
  if (!game) return;
  const current = game.state.status;
  if (current === "ready") {
    if (isOpposite(direction, game.players[0].direction)) return;
    startDirection = direction;
    if (!countdown.isRunning()) {
      runCountdown(() => {
        const heading = startDirection;
        startDirection = null;
        if (heading && game?.state.status === "ready") sendMove(heading);
      });
    }
    return;
  }
  if (current === "playing" && !countdown.isRunning()) inputs.press(direction, game.players[0].direction);
}

function resumeWithCountdown(): void {
  clearAdvice();
  shopVisible = false;
  if (game) render(game);
  runCountdown(() => {
    if (game?.state.status === "paused") void runAction(() => gameClient.resume(game!.id));
  });
}

async function togglePause(): Promise<void> {
  if (!game) return;
  if (countdown.isRunning()) {
    cancelCountdown();
    return;
  }
  if (game.state.status === "playing") {
    shopVisible = false;
    clearAdvice();
    inputs.reset();
    await runAction(() => gameClient.pause(game!.id));
  } else if (game.state.status === "paused") {
    resumeWithCountdown();
  }
}

async function toggleShop(): Promise<void> {
  if (!game) return;
  if (countdown.isRunning()) {
    cancelCountdown();
    return;
  }
  if (game.state.status === "playing") {
    inputs.reset();
    if (await runAction(() => gameClient.pause(game!.id))) {
      shopVisible = true;
      clearAdvice();
      if (game) render(game);
    }
  } else if (game.state.status === "paused") {
    if (shopVisible) {
      resumeWithCountdown();
    } else {
      shopVisible = true;
      clearAdvice();
      render(game);
    }
  }
}

async function purchasePerk(perk: "extra_xp" | "extra_life" | "luck"): Promise<void> {
  if (!game || game.state.status !== "paused") return;
  clearAdvice();
  shopStatusMessage.textContent = "";
  try {
    applySnapshot(await gameClient.purchasePerk(game.id, perk));
    shopStatusMessage.textContent = "PURCHASE APPLIED.";
  } catch (error) {
    shopStatusMessage.textContent = error instanceof GameApiError ? error.message : "PURCHASE FAILED.";
  }
}

async function setDifficulty(next: Difficulty): Promise<void> {
  const current = game?.state.status;
  if (!game || countdown.isRunning() || (current !== "ready" && current !== "game_over" && current !== "won")) return;
  difficulty = next;
  writeSetting(SETTING_KEYS.difficulty, next);
  await initializeGame();
}

function toggleMute(): void {
  const muted = sound.toggleMuted();
  muteButton.textContent = muted ? "♪ OFF" : "♪ ON";
  muteButton.setAttribute("aria-pressed", String(!muted));
}

function applyColorblind(): void {
  renderer?.setColorblind(colorblind);
  document.body.dataset.palette = colorblind ? "colorblind" : "normal";
  colorblindButton.setAttribute("aria-pressed", String(colorblind));
  colorblindButton.textContent = colorblind ? "◐ COLORBLIND ON" : "◐ COLORBLIND";
}

function toggleColorblind(): void {
  colorblind = !colorblind;
  writeSetting(SETTING_KEYS.colorblind, colorblind ? "1" : "0");
  applyColorblind();
}

function renderRecords(highlight = -1): void {
  recordsList.replaceChildren();
  recordsEmpty.hidden = records.top.length > 0;
  records.top.forEach((entry, index) => {
    const row = document.createElement("li");
    if (index === highlight) row.className = "highlight";
    const rank = document.createElement("span");
    rank.textContent = String(index + 1).padStart(2, "0");
    const name = document.createElement("strong");
    name.textContent = entry.name;
    const level = document.createElement("em");
    level.textContent = entry.difficulty.toUpperCase();
    const points = document.createElement("b");
    points.textContent = String(entry.score);
    row.append(rank, name, level, points);
    recordsList.append(row);
  });
  statGames.textContent = String(records.stats.games);
  statFood.textContent = String(records.stats.totalFood);
  statLength.textContent = String(records.stats.longestSnake);
  statCombo.textContent = records.stats.bestCombo > 0 ? `×${records.stats.bestCombo}` : "—";
}

function openRecords(highlight = -1): void {
  if (game?.state.status === "playing") void togglePause();
  renderRecords(highlight);
  if (!recordsDialog.open) recordsDialog.showModal();
}

nameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!pendingRecord) return;
  const entry = { name: sanitizeName(nameInput.value), score: pendingRecord.score, difficulty, date: new Date().toISOString().slice(0, 10) };
  const result = addEntry(records, entry);
  records = result.records;
  saveRecords(records);
  pendingRecord = null;
  nameForm.hidden = true;
  nameInput.blur();
  openRecords(result.rank);
});
nameInput.addEventListener("input", () => {
  nameInput.value = nameInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
});

const keyDirections: Record<string, Direction> = {
  arrowup: "up",
  arrowright: "right",
  arrowdown: "down",
  arrowleft: "left",
};

window.addEventListener("keydown", (event) => {
  if (event.repeat || recordsDialog.open || event.target instanceof HTMLInputElement) return;
  const key = event.key.toLowerCase();
  if (key === "r") {
    event.preventDefault();
    void restart();
  } else if (key === "p" || event.code === "Space") {
    event.preventDefault();
    void togglePause();
  } else if (key === "s") {
    event.preventDefault();
    void toggleShop();
  } else if (key === "m") {
    event.preventDefault();
    toggleMute();
  } else if (key === "c") {
    event.preventDefault();
    toggleColorblind();
  } else if (keyDirections[key]) {
    event.preventDefault();
    handleDirection(keyDirections[key]);
  }
});

restartButton.addEventListener("click", () => { void restart(); });
pause.addEventListener("click", () => { void togglePause(); });
toggleShopButton.addEventListener("click", () => { void toggleShop(); });
closeShopButton.addEventListener("click", () => { void togglePause(); });
purchaseExtraXpButton.addEventListener("click", () => { void purchasePerk("extra_xp"); });
purchaseExtraLifeButton.addEventListener("click", () => { void purchasePerk("extra_life"); });
purchaseLuckButton.addEventListener("click", () => { void purchasePerk("luck"); });
muteButton.addEventListener("click", toggleMute);
colorblindButton.addEventListener("click", toggleColorblind);
recordsButton.addEventListener("click", () => openRecords());
recordsDialog.addEventListener("click", (event) => { if (event.target === recordsDialog) recordsDialog.close(); });
difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const next = button.dataset.difficulty;
    if (isDifficulty(next)) void setDifficulty(next);
  });
});
gameOverlayActionButton.addEventListener("click", () => {
  if (game?.state.status === "paused") void togglePause();
  else void restart();
});

askAdvice.addEventListener("click", async () => {
  if (!game || game.state.status !== "paused" || !shopVisible || adviceAbort) return;
  const gameId = game.id;
  const revision = game.revision;
  const controller = new AbortController();
  adviceAbort = controller;
  askAdvice.disabled = true;
  adviceMessage.textContent = "CHECKING YOUR CURRENT SHOP OPTIONS…";
  try {
    const result = await gameClient.shopAdvice(gameId, controller.signal);
    if (controller.signal.aborted || !game || game.id !== gameId || game.revision !== revision || !shopVisible
      || game.state.status !== "paused" || result.revision !== revision) return;
    adviceMessage.textContent = result.status === "advice"
      ? `${result.message} · ${result.model === "gemini-3.8-flash" ? "GEMINI FLASH" : result.model === "gemini-3.5-flash-lite" ? "GEMINI FLASH-LITE" : "GEMMA 4"}`
      : result.message;
  } catch {
    if (!controller.signal.aborted && game?.id === gameId && game.revision === revision && shopVisible) {
      adviceMessage.textContent = "SHOP ADVICE IS UNAVAILABLE. NO PURCHASE WAS MADE.";
    }
  } finally {
    if (adviceAbort === controller) {
      adviceAbort = null;
      if (game) render(game);
    }
  }
});

askAgent.addEventListener("click", async () => {
  if (!game || game.state.status !== "paused" || !shopVisible || agentAbort) return;
  const gameId = game.id;
  const revision = game.revision;
  const controller = new AbortController();
  agentAbort = controller;
  askAgent.disabled = true;
  agentMessage.textContent = "AI ANALYSIS IN PROGRESS…";
  try {
    const run = await gameClient.shopAgent(gameId, controller.signal);
    if (controller.signal.aborted || !game || game.id !== gameId || game.revision !== revision || !shopVisible
      || game.state.status !== "paused" || run.revision !== revision) return;
    agentMessage.textContent = run.status === "completed"
      ? [run.message, run.result.summary, ...run.result.evidence.map((item) => `· ${item.finding}`)].join("\n")
      : run.message;
  } catch {
    if (!controller.signal.aborted && game?.id === gameId && game.revision === revision && shopVisible) {
      agentMessage.textContent = "SHOP STRATEGIST IS UNAVAILABLE. NO PURCHASE WAS MADE.";
    }
  } finally {
    if (agentAbort === controller) {
      agentAbort = null;
      if (game) render(game);
    }
  }
});

document.querySelectorAll<HTMLButtonElement>("[data-direction]").forEach((button) => {
  button.addEventListener("click", () => {
    const direction = button.dataset.direction;
    if (direction === "up" || direction === "right" || direction === "down" || direction === "left") handleDirection(direction);
  });
});

function pauseOnFocusLoss(): void {
  if (countdown.isRunning()) {
    cancelCountdown();
    return;
  }
  if (game?.state.status === "playing") void togglePause();
}
document.addEventListener("visibilitychange", () => { if (document.hidden) pauseOnFocusLoss(); });
window.addEventListener("blur", pauseOnFocusLoss);

let swipeStart: { x: number; y: number } | null = null;
boardFrame.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "mouse") swipeStart = { x: event.clientX, y: event.clientY };
});
boardFrame.addEventListener("pointerup", (event) => {
  if (!swipeStart) return;
  const direction = swipeDirection(event.clientX - swipeStart.x, event.clientY - swipeStart.y, SWIPE_MIN_PX);
  swipeStart = null;
  if (direction) handleDirection(direction);
});
boardFrame.addEventListener("pointercancel", () => { swipeStart = null; });

async function initializeGame(): Promise<void> {
  disconnectEvents?.();
  disconnectEvents = undefined;
  game = null;
  adapter.reset();
  inputs.reset();
  startDirection = null;
  countdown.cancel();
  displayedScore = 0;
  gameFood = 0;
  pendingRecord = null;
  nameForm.hidden = true;
  shopVisible = false;
  clearAdvice();
  best = readBest(difficulty);
  connection.textContent = "CONNECTING";
  connection.dataset.connection = "connecting";
  try {
    const initial = await gameClient.create(DIFFICULTY_CONFIGS[difficulty]);
    applySnapshot(initial);
    disconnectEvents = connectGameEvents(initial.id, applySnapshot, (connected) => {
      connection.textContent = connected ? "SERVER ONLINE" : "RECONNECTING";
      connection.dataset.connection = connected ? "online" : "reconnecting";
    });
    const fresh = await gameClient.get(initial.id);
    applySnapshot(fresh);
  } catch (error) {
    reportError(error);
  }
}

window.addEventListener("beforeunload", () => disconnectEvents?.());
muteButton.textContent = sound.isMuted() ? "♪ OFF" : "♪ ON";
muteButton.setAttribute("aria-pressed", String(!sound.isMuted()));
applyColorblind();
renderRecords();
void initializeGame();
