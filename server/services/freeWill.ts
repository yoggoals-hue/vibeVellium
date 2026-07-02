// VibeVellium Phase 2: Free Will (dice-roll interventions) + Body State (subtle meters)
// All interventions are GROUNDED — they tell the model to consider the scene/character,
// but they do NOT re-append the character card JSON (it's already in the system prompt).

import { db, newId, now } from "../db.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FreeWillTier = "no_op" | "biological" | "mood" | "scene" | "weird" | "critical";
export type FreeWillFrequency = "every_turn" | "every_3" | "every_5" | "random_1_in_5";

export interface FreeWillConfig {
  chatId: string;
  enabled: boolean;
  intensity: number; // 0..100 — probability that a roll fires an event
  frequency: FreeWillFrequency;
  autoPause: boolean; // force an event if 3 turns pass without one
  tiers: Record<FreeWillTier, boolean>;
  updatedAt: string;
}

export interface FreeWillRoll {
  id: string;
  chatId: string;
  turn: number;
  rollValue: number; // 1..100
  tier: FreeWillTier;
  prompt: string;
  skipped: boolean;
  createdAt: string;
}

export interface BodyStateConfig {
  chatId: string;
  enabled: boolean;
  decayRate: number; // 0..20, default 5
  meters: { hunger: boolean; fatigue: boolean; arousal: boolean };
  injectThresholdLow: number; // default 30
  injectThresholdHigh: number; // default 70
  updatedAt: string;
}

export interface BodyStateMeter {
  id: string;
  chatId: string;
  characterId: string;
  meter: "hunger" | "fatigue" | "arousal";
  value: number; // 0..100
  locked: boolean;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Free Will: config CRUD
// ---------------------------------------------------------------------------

interface FreeWillConfigRow {
  chat_id: string;
  enabled: number;
  intensity: number;
  frequency: string;
  auto_pause: number;
  tier_no_op: number;
  tier_biological: number;
  tier_mood: number;
  tier_scene: number;
  tier_weird: number;
  tier_critical: number;
  updated_at: string;
}

function parseConfigRow(row: FreeWillConfigRow): FreeWillConfig {
  return {
    chatId: row.chat_id,
    enabled: row.enabled === 1,
    intensity: Math.max(0, Math.min(100, row.intensity)),
    frequency: (["every_turn", "every_3", "every_5", "random_1_in_5"].includes(row.frequency) ? row.frequency : "every_3") as FreeWillFrequency,
    autoPause: row.auto_pause === 1,
    tiers: {
      no_op: row.tier_no_op === 1,
      biological: row.tier_biological === 1,
      mood: row.tier_mood === 1,
      scene: row.tier_scene === 1,
      weird: row.tier_weird === 1,
      critical: row.tier_critical === 1
    },
    updatedAt: row.updated_at
  };
}

export function getFreeWillConfig(chatId: string): FreeWillConfig {
  const row = db.prepare("SELECT * FROM free_will_config WHERE chat_id = ?").get(chatId) as FreeWillConfigRow | undefined;
  if (!row) {
    return {
      chatId,
      enabled: false,
      intensity: 30,
      frequency: "every_3",
      autoPause: true,
      tiers: { no_op: true, biological: true, mood: true, scene: true, weird: true, critical: true },
      updatedAt: now()
    };
  }
  return parseConfigRow(row);
}

export function setFreeWillConfig(chatId: string, patch: Partial<Omit<FreeWillConfig, "chatId" | "updatedAt">>): FreeWillConfig {
  const current = getFreeWillConfig(chatId);
  const next: FreeWillConfig = {
    ...current,
    ...patch,
    tiers: { ...current.tiers, ...(patch.tiers ?? {}) },
    updatedAt: now()
  };
  db.prepare(
    `INSERT INTO free_will_config
      (chat_id, enabled, intensity, frequency, auto_pause, tier_no_op, tier_biological, tier_mood, tier_scene, tier_weird, tier_critical, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET
       enabled = excluded.enabled,
       intensity = excluded.intensity,
       frequency = excluded.frequency,
       auto_pause = excluded.auto_pause,
       tier_no_op = excluded.tier_no_op,
       tier_biological = excluded.tier_biological,
       tier_mood = excluded.tier_mood,
       tier_scene = excluded.tier_scene,
       tier_weird = excluded.tier_weird,
       tier_critical = excluded.tier_critical,
       updated_at = excluded.updated_at`
  ).run(
    chatId,
    next.enabled ? 1 : 0,
    Math.max(0, Math.min(100, next.intensity)),
    next.frequency,
    next.autoPause ? 1 : 0,
    next.tiers.no_op ? 1 : 0,
    next.tiers.biological ? 1 : 0,
    next.tiers.mood ? 1 : 0,
    next.tiers.scene ? 1 : 0,
    next.tiers.weird ? 1 : 0,
    next.tiers.critical ? 1 : 0,
    next.updatedAt
  );
  return next;
}

// ---------------------------------------------------------------------------
// Free Will: rolls log
// ---------------------------------------------------------------------------

interface FreeWillRollRow {
  id: string;
  chat_id: string;
  turn: number;
  roll_value: number;
  tier: string;
  prompt: string;
  skipped: number;
  created_at: string;
}

function parseRollRow(row: FreeWillRollRow): FreeWillRoll {
  return {
    id: row.id,
    chatId: row.chat_id,
    turn: row.turn,
    rollValue: row.roll_value,
    tier: (["no_op", "biological", "mood", "scene", "weird", "critical"].includes(row.tier) ? row.tier : "no_op") as FreeWillTier,
    prompt: row.prompt || "",
    skipped: row.skipped === 1,
    createdAt: row.created_at
  };
}

export function listFreeWillRolls(chatId: string, limit = 20): FreeWillRoll[] {
  const rows = db.prepare(
    "SELECT * FROM free_will_rolls WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?"
  ).all(chatId, Math.max(1, Math.min(100, limit))) as FreeWillRollRow[];
  return rows.map(parseRollRow);
}

function insertFreeWillRoll(chatId: string, turn: number, rollValue: number, tier: FreeWillTier, prompt: string, skipped: boolean): FreeWillRoll {
  const id = newId();
  const createdAt = now();
  db.prepare(
    "INSERT INTO free_will_rolls (id, chat_id, turn, roll_value, tier, prompt, skipped, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, chatId, turn, rollValue, tier, prompt, skipped ? 1 : 0, createdAt);
  return { id, chatId, turn, rollValue, tier, prompt, skipped, createdAt };
}

// ---------------------------------------------------------------------------
// Free Will: tier prompt builders
// IMPORTANT: prompts tell the model to ground in scene+character, but DO NOT
// re-append the character card JSON (already in system prompt). Trust the model.
// ---------------------------------------------------------------------------

const TIER_PROMPTS: Record<FreeWillTier, string> = {
  no_op: "",
  biological: `[FREE WILL EVENT — Biological]
Roll: {ROLL}/100. Your character must address a sudden biological need (hunger, thirst, fatigue, restroom, or temperature discomfort).
Ground this naturally in the current scene and your character's personality — do not break character or the scene.
Weave it into the next reply without making it the main focus unless the scene allows.`,
  mood: `[FREE WILL EVENT — Mood shift]
Roll: {ROLL}/100. Your character experiences a mood shift (becomes bored, curious, irritated, melancholic, restless, or unexpectedly cheerful).
Stay grounded in your character and the current scene — show this shift through behavior, tone, and word choice rather than narrating it explicitly.
Do not break character. Let the mood naturally color your next reply.`,
  scene: `[FREE WILL EVENT — Scene disruption]
Roll: {ROLL}/100. Your character wants to change something about the scene — shift location, end the current activity, redirect the topic, or introduce a new element.
This must feel motivated by your character's personality and the current scene context — not random.
Stay in character and weave the change naturally into your next reply.`,
  weird: `[FREE WILL EVENT — Unexpected (in-character)]
Roll: {ROLL}/100. Do something unexpected but consistent with your character's personality and the current scene.
This should surprise the user while remaining believable for who your character is — not random for the sake of randomness.
Stay grounded in scene history; do not contradict established facts.`,
  critical: `[FREE WILL EVENT — Critical pivot]
Roll: {ROLL}/100. Your character experiences a major emotional pivot or wants to leave the conversation entirely.
This must be motivated by something in the scene history or your character's深层 motivations — never arbitrary.
Stay in character. If your character would leave, have them do so naturally (the user can call them back).`
};

export function buildTierPrompt(tier: FreeWillTier, rollValue: number): string {
  const template = TIER_PROMPTS[tier];
  if (!template) return "";
  return template.replace(/\{ROLL\}/g, String(rollValue));
}

// ---------------------------------------------------------------------------
// Free Will: roll logic — called by chatOrchestrator each eligible turn
// ---------------------------------------------------------------------------

function isEligibleTurn(turn: number, frequency: FreeWillFrequency): boolean {
  switch (frequency) {
    case "every_turn": return true;
    case "every_3": return turn % 3 === 0;
    case "every_5": return turn % 5 === 0;
    case "random_1_in_5": return Math.random() < 0.2;
    default: return turn % 3 === 0;
  }
}

function pickTierFromRoll(roll: number, enabledTiers: Record<FreeWillTier, boolean>): FreeWillTier {
  // Tier ranges (no subtle — those were dropped per spec)
  // 0-20   no_op
  // 21-40  biological
  // 41-60  mood
  // 61-80  scene
  // 81-95  weird
  // 96-100 critical
  let tier: FreeWillTier;
  if (roll <= 20) tier = "no_op";
  else if (roll <= 40) tier = "biological";
  else if (roll <= 60) tier = "mood";
  else if (roll <= 80) tier = "scene";
  else if (roll <= 95) tier = "weird";
  else tier = "critical";

  // If picked tier is disabled, fall back to no_op (don't escalate to a higher tier unilaterally)
  if (!enabledTiers[tier]) return "no_op";
  return tier;
}

function turnsSinceLastEvent(chatId: string): number {
  const row = db.prepare(
    "SELECT turn FROM free_will_rolls WHERE chat_id = ? AND skipped = 0 ORDER BY created_at DESC LIMIT 1"
  ).get(chatId) as { turn: number } | undefined;
  if (!row) return 999;
  const currentTurnRow = db.prepare("SELECT current_turn FROM chats WHERE id = ?").get(chatId) as { current_turn: number } | undefined;
  const currentTurn = currentTurnRow?.current_turn || 0;
  return Math.max(0, currentTurn - row.turn);
}

export interface FreeWillRollResult {
  rolled: boolean;
  rollValue: number;
  tier: FreeWillTier;
  prompt: string;
  skipped: boolean;
  reason?: string;
}

/**
 * Decide whether to roll the dice this turn and return the prompt to inject (if any).
 * Called by chatOrchestrator BEFORE generation. The roll is persisted to the log.
 */
export function rollFreeWillForTurn(chatId: string, currentTurn: number): FreeWillRollResult {
  const config = getFreeWillConfig(chatId);
  if (!config.enabled) {
    return { rolled: false, rollValue: 0, tier: "no_op", prompt: "", skipped: true, reason: "disabled" };
  }

  // Auto-pause: if 3+ turns since last event, force a roll regardless of frequency
  const eligibleByFreq = isEligibleTurn(currentTurn, config.frequency);
  const droughtTriggered = config.autoPause && turnsSinceLastEvent(chatId) >= 3;
  if (!eligibleByFreq && !droughtTriggered) {
    return { rolled: false, rollValue: 0, tier: "no_op", prompt: "", skipped: true, reason: "not_eligible" };
  }

  const rollValue = Math.floor(Math.random() * 100) + 1; // 1..100
  const intensityCheck = Math.random() * 100;
  const passesIntensity = intensityCheck <= config.intensity;

  if (!passesIntensity) {
    // Rolled but below intensity threshold — log as skipped
    insertFreeWillRoll(chatId, currentTurn, rollValue, "no_op", "", true);
    return { rolled: true, rollValue, tier: "no_op", prompt: "", skipped: true, reason: "below_intensity" };
  }

  const tier = pickTierFromRoll(rollValue, config.tiers);
  const prompt = buildTierPrompt(tier, rollValue);

  // If tier is no_op (or disabled), log as skipped — no injection
  const skipped = tier === "no_op" || !prompt;
  insertFreeWillRoll(chatId, currentTurn, rollValue, tier, prompt, skipped);

  return { rolled: true, rollValue, tier, prompt, skipped, reason: skipped ? "no_op_tier" : "fired" };
}

/**
 * Force-roll an event for the current turn (manual trigger from inspector).
 * Bypasses frequency + intensity checks. Still respects tier toggles.
 */
export function forceRollFreeWill(chatId: string): FreeWillRollResult {
  const config = getFreeWillConfig(chatId);
  const currentTurnRow = db.prepare("SELECT current_turn FROM chats WHERE id = ?").get(chatId) as { current_turn: number } | undefined;
  const currentTurn = (currentTurnRow?.current_turn || 0) + 1;

  const rollValue = Math.floor(Math.random() * 100) + 1;
  // Force a non-no_op tier: re-roll until we get a tier that's enabled and not no_op
  let tier: FreeWillTier = "no_op";
  let attempts = 0;
  while (tier === "no_op" && attempts < 10) {
    const candidate = pickTierFromRoll(rollValue + attempts * 7, config.tiers);
    if (candidate !== "no_op") {
      tier = candidate;
      break;
    }
    attempts++;
  }
  // Fallback: pick the first enabled non-no_op tier
  if (tier === "no_op") {
    const fallbackOrder: FreeWillTier[] = ["biological", "mood", "scene", "weird", "critical"];
    tier = fallbackOrder.find((t) => config.tiers[t]) || "biological";
  }

  const prompt = buildTierPrompt(tier, rollValue);
  insertFreeWillRoll(chatId, currentTurn, rollValue, tier, prompt, false);
  return { rolled: true, rollValue, tier, prompt, skipped: false, reason: "forced" };
}

// ---------------------------------------------------------------------------
// Body State: config CRUD
// ---------------------------------------------------------------------------

interface BodyStateConfigRow {
  chat_id: string;
  enabled: number;
  decay_rate: number;
  meter_hunger: number;
  meter_fatigue: number;
  meter_arousal: number;
  inject_threshold_low: number;
  inject_threshold_high: number;
  updated_at: string;
}

export function getBodyStateConfig(chatId: string): BodyStateConfig {
  const row = db.prepare("SELECT * FROM body_state_config WHERE chat_id = ?").get(chatId) as BodyStateConfigRow | undefined;
  if (!row) {
    return {
      chatId,
      enabled: false,
      decayRate: 5,
      meters: { hunger: true, fatigue: true, arousal: false },
      injectThresholdLow: 30,
      injectThresholdHigh: 70,
      updatedAt: now()
    };
  }
  return {
    chatId: row.chat_id,
    enabled: row.enabled === 1,
    decayRate: Math.max(0, Math.min(20, row.decay_rate)),
    meters: {
      hunger: row.meter_hunger === 1,
      fatigue: row.meter_fatigue === 1,
      arousal: row.meter_arousal === 1
    },
    injectThresholdLow: Math.max(0, Math.min(50, row.inject_threshold_low)),
    injectThresholdHigh: Math.max(50, Math.min(100, row.inject_threshold_high)),
    updatedAt: row.updated_at
  };
}

export function setBodyStateConfig(chatId: string, patch: Partial<Omit<BodyStateConfig, "chatId" | "updatedAt">>): BodyStateConfig {
  const current = getBodyStateConfig(chatId);
  const next: BodyStateConfig = {
    ...current,
    ...patch,
    meters: { ...current.meters, ...(patch.meters ?? {}) },
    updatedAt: now()
  };
  db.prepare(
    `INSERT INTO body_state_config
      (chat_id, enabled, decay_rate, meter_hunger, meter_fatigue, meter_arousal, inject_threshold_low, inject_threshold_high, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET
       enabled = excluded.enabled,
       decay_rate = excluded.decay_rate,
       meter_hunger = excluded.meter_hunger,
       meter_fatigue = excluded.meter_fatigue,
       meter_arousal = excluded.meter_arousal,
       inject_threshold_low = excluded.inject_threshold_low,
       inject_threshold_high = excluded.inject_threshold_high,
       updated_at = excluded.updated_at`
  ).run(
    chatId,
    next.enabled ? 1 : 0,
    next.decayRate,
    next.meters.hunger ? 1 : 0,
    next.meters.fatigue ? 1 : 0,
    next.meters.arousal ? 1 : 0,
    next.injectThresholdLow,
    next.injectThresholdHigh,
    next.updatedAt
  );
  return next;
}

// ---------------------------------------------------------------------------
// Body State: meters CRUD
// ---------------------------------------------------------------------------

interface BodyStateMeterRow {
  id: string;
  chat_id: string;
  character_id: string;
  meter: string;
  value: number;
  locked: number;
  updated_at: string;
}

function parseMeterRow(row: BodyStateMeterRow): BodyStateMeter {
  return {
    id: row.id,
    chatId: row.chat_id,
    characterId: row.character_id,
    meter: (["hunger", "fatigue", "arousal"].includes(row.meter) ? row.meter : "hunger") as BodyStateMeter["meter"],
    value: Math.max(0, Math.min(100, row.value)),
    locked: row.locked === 1,
    updatedAt: row.updated_at
  };
}

export function listBodyStateMeters(chatId: string): BodyStateMeter[] {
  const rows = db.prepare(
    "SELECT * FROM body_state_meters WHERE chat_id = ? ORDER BY character_id, meter"
  ).all(chatId) as BodyStateMeterRow[];
  return rows.map(parseMeterRow);
}

export function listBodyStateMetersForCharacter(chatId: string, characterId: string): BodyStateMeter[] {
  const rows = db.prepare(
    "SELECT * FROM body_state_meters WHERE chat_id = ? AND character_id = ? ORDER BY meter"
  ).all(chatId, characterId) as BodyStateMeterRow[];
  return rows.map(parseMeterRow);
}

export function setBodyStateMeter(chatId: string, characterId: string, meter: BodyStateMeter["meter"], value: number, locked?: boolean): BodyStateMeter | null {
  const clamped = Math.max(0, Math.min(100, Math.floor(value)));
  const existing = db.prepare(
    "SELECT * FROM body_state_meters WHERE chat_id = ? AND character_id = ? AND meter = ?"
  ).get(chatId, characterId, meter) as BodyStateMeterRow | undefined;

  if (existing) {
    const nextLocked = typeof locked === "boolean" ? locked : existing.locked === 1;
    db.prepare(
      "UPDATE body_state_meters SET value = ?, locked = ?, updated_at = ? WHERE id = ?"
    ).run(clamped, nextLocked ? 1 : 0, now(), existing.id);
    return parseMeterRow({ ...existing, value: clamped, locked: nextLocked ? 1 : 0, updated_at: now() });
  }

  const id = newId();
  const createdAt = now();
  db.prepare(
    "INSERT INTO body_state_meters (id, chat_id, character_id, meter, value, locked, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, chatId, characterId, meter, clamped, typeof locked === "boolean" && locked ? 1 : 0, createdAt);
  return {
    id,
    chatId,
    characterId,
    meter,
    value: clamped,
    locked: typeof locked === "boolean" ? locked : false,
    updatedAt: createdAt
  };
}

/**
 * Decay all unlocked meters for a chat by the configured rate. Called after each turn.
 * Hunger/fatigue DECREASE (more hungry/tired over time).
 * Arousal can go either way depending on intensity — we decay toward 50 (neutral).
 */
export function decayBodyStateMeters(chatId: string): void {
  const config = getBodyStateConfig(chatId);
  if (!config.enabled || config.decayRate <= 0) return;
  const meters = listBodyStateMeters(chatId);
  for (const m of meters) {
    if (m.locked) continue;
    let nextValue: number;
    if (m.meter === "arousal") {
      // Decay toward 50 (neutral)
      if (m.value > 50) nextValue = Math.max(50, m.value - config.decayRate);
      else nextValue = Math.min(50, m.value + config.decayRate);
    } else {
      // Hunger/fatigue decay downward (character gets hungrier/more tired)
      nextValue = Math.max(0, m.value - config.decayRate);
    }
    db.prepare("UPDATE body_state_meters SET value = ?, updated_at = ? WHERE id = ?")
      .run(nextValue, now(), m.id);
  }
}

/**
 * Build the body state injection for the model — ONLY if any meter is out of balance.
 * Stays subtle: just states the facts, lets the model decide how to weave it in.
 */
export function buildBodyStateInjection(chatId: string, characterId: string | null): string {
  const config = getBodyStateConfig(chatId);
  if (!config.enabled) return "";
  const meters = characterId ? listBodyStateMetersForCharacter(chatId, characterId) : listBodyStateMeters(chatId);
  if (meters.length === 0) return "";

  const outOfBalance: string[] = [];
  for (const m of meters) {
    if (!config.meters[m.meter]) continue;
    if (m.value <= config.injectThresholdLow) {
      const label = m.meter === "hunger" ? "hungry" : m.meter === "fatigue" ? "tired" : "understimulated";
      outOfBalance.push(`${m.meter}: ${m.value}/100 (${label})`);
    } else if (m.value >= config.injectThresholdHigh) {
      const label = m.meter === "hunger" ? "completely full" : m.meter === "fatigue" ? "well-rested" : "highly stimulated";
      outOfBalance.push(`${m.meter}: ${m.value}/100 (${label})`);
    }
  }

  if (outOfBalance.length === 0) return "";
  return `[BODY STATE — subtle character context, ground naturally in scene]\n${outOfBalance.join("\n")}\nWeave these physical states into your reply subtly — they should color your character's behavior without becoming the main focus unless the user engages with them.`;
}

/**
 * Initialize default meter rows (value 50) for a character when they're added to a chat.
 */
export function ensureBodyStateMetersForCharacter(chatId: string, characterId: string): void {
  const config = getBodyStateConfig(chatId);
  if (!config.enabled) return;
  const meterTypes: BodyStateMeter["meter"][] = ["hunger", "fatigue", "arousal"];
  for (const meter of meterTypes) {
    if (!config.meters[meter]) continue;
    const existing = db.prepare(
      "SELECT id FROM body_state_meters WHERE chat_id = ? AND character_id = ? AND meter = ?"
    ).get(chatId, characterId, meter);
    if (!existing) {
      setBodyStateMeter(chatId, characterId, meter, 50, false);
    }
  }
}
