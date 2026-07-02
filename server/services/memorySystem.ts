// VibeVellium memory system: Action Tree + Future Guides
// Server-side helpers shared by routes and chatOrchestrator.

import { db, newId, now, roughTokenCount } from "../db.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActionTreeNode {
  id: string;
  chatId: string;
  branchId: string | null;
  turn: number;
  character: string;
  actions: string[];
  dialogue: string;
  outcome: "pending" | "success" | "partial" | "failed";
  notes: string;
  manual: boolean;
  tags: string[];
  relationships: Array<{ source: string; target: string; word: string }>;
  createdAt: string;
}

export interface ActionTreeConfig {
  chatId: string;
  enabled: boolean;
  format: "inline" | "second_call";
  modelId: string | null;
  injectionCount: number;
  updatedAt: string;
}

export interface FutureGuide {
  id: string;
  chatId: string;
  title: string;
  guidance: string;
  keyActions: string[];
  targetTurn: number;
  strength: number; // 0..1, user-set
  status: "active" | "reached" | "abandoned";
  createdAt: string;
  reachedAt: string | null;
}

// ---------------------------------------------------------------------------
// Row parsing helpers
// ---------------------------------------------------------------------------

interface ActionTreeNodeRow {
  id: string;
  chat_id: string;
  branch_id: string | null;
  turn: number;
  character: string;
  actions_json: string;
  dialogue: string;
  outcome: string;
  notes: string;
  manual: number;
  tags_json: string;
  relationships_json: string;
  created_at: string;
}

interface FutureGuideRow {
  id: string;
  chat_id: string;
  title: string;
  guidance: string;
  key_actions_json: string;
  target_turn: number;
  strength: number;
  status: string;
  created_at: string;
  reached_at: string | null;
}

function parseNodeRow(row: ActionTreeNodeRow): ActionTreeNode {
  let actions: string[] = [];
  try {
    const parsed = JSON.parse(row.actions_json || "[]");
    if (Array.isArray(parsed)) {
      actions = parsed.flatMap((item) => typeof item === "string" ? [item] : []);
    }
  } catch {
    actions = [];
  }
  let tags: string[] = [];
  try {
    const parsedTags = JSON.parse(row.tags_json || "[]");
    if (Array.isArray(parsedTags)) {
      tags = parsedTags.flatMap((item) => typeof item === "string" ? [item.trim()].filter(Boolean) : []);
    }
  } catch {
    tags = [];
  }
  let relationships: Array<{ source: string; target: string; word: string }> = [];
  try {
    const parsedRels = JSON.parse(row.relationships_json || "[]");
    if (Array.isArray(parsedRels)) {
      relationships = parsedRels.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const r = item as Record<string, unknown>;
        const source = typeof r.source === "string" ? r.source : "";
        const target = typeof r.target === "string" ? r.target : "";
        const word = typeof r.word === "string" ? r.word : "";
        return source && target && word ? [{ source, target, word }] : [];
      });
    }
  } catch {
    relationships = [];
  }
  return {
    id: row.id,
    chatId: row.chat_id,
    branchId: row.branch_id,
    turn: row.turn,
    character: row.character || "",
    actions,
    dialogue: row.dialogue || "",
    outcome: (["pending", "success", "partial", "failed"].includes(row.outcome) ? row.outcome : "pending") as ActionTreeNode["outcome"],
    notes: row.notes || "",
    manual: row.manual === 1,
    tags,
    relationships,
    createdAt: row.created_at
  };
}

function parseGuideRow(row: FutureGuideRow): FutureGuide {
  let keyActions: string[] = [];
  try {
    const parsed = JSON.parse(row.key_actions_json || "[]");
    if (Array.isArray(parsed)) {
      keyActions = parsed.flatMap((item) => typeof item === "string" ? [item] : []);
    }
  } catch {
    keyActions = [];
  }
  return {
    id: row.id,
    chatId: row.chat_id,
    title: row.title || "",
    guidance: row.guidance || "",
    keyActions,
    targetTurn: row.target_turn,
    strength: Number.isFinite(row.strength) ? row.strength : 0.5,
    status: (["active", "reached", "abandoned"].includes(row.status) ? row.status : "active") as FutureGuide["status"],
    createdAt: row.created_at,
    reachedAt: row.reached_at
  };
}

// ---------------------------------------------------------------------------
// Action Tree: CRUD
// ---------------------------------------------------------------------------

export function listActionTreeNodes(chatId: string): ActionTreeNode[] {
  const rows = db.prepare(
    "SELECT * FROM action_tree_nodes WHERE chat_id = ? ORDER BY turn ASC, created_at ASC"
  ).all(chatId) as ActionTreeNodeRow[];
  return rows.map(parseNodeRow);
}

export function getActionTreeConfig(chatId: string): ActionTreeConfig {
  const row = db.prepare(
    "SELECT * FROM action_tree_config WHERE chat_id = ?"
  ).get(chatId) as
    | {
        chat_id: string;
        enabled: number;
        format: string;
        model_id: string | null;
        injection_count: number;
        updated_at: string;
      }
    | undefined;
  if (!row) {
    return {
      chatId,
      enabled: false,
      format: "inline",
      modelId: null,
      injectionCount: 15,
      updatedAt: now()
    };
  }
  return {
    chatId,
    enabled: row.enabled === 1,
    format: row.format === "second_call" ? "second_call" : "inline",
    modelId: row.model_id,
    injectionCount: Number.isFinite(row.injection_count) ? row.injection_count : 15,
    updatedAt: row.updated_at
  };
}

export function setActionTreeConfig(
  chatId: string,
  patch: Partial<Pick<ActionTreeConfig, "enabled" | "format" | "modelId" | "injectionCount">>
): ActionTreeConfig {
  const current = getActionTreeConfig(chatId);
  const next: ActionTreeConfig = {
    ...current,
    ...patch,
    updatedAt: now()
  };
  db.prepare(
    `INSERT INTO action_tree_config (chat_id, enabled, format, model_id, injection_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET
       enabled = excluded.enabled,
       format = excluded.format,
       model_id = excluded.model_id,
       injection_count = excluded.injection_count,
       updated_at = excluded.updated_at`
  ).run(
    chatId,
    next.enabled ? 1 : 0,
    next.format,
    next.modelId ?? null,
    Math.max(1, Math.min(50, next.injectionCount)),
    next.updatedAt
  );
  return next;
}

export function insertActionTreeNode(
  chatId: string,
  data: {
    branchId?: string | null;
    turn?: number;
    character?: string;
    actions?: string[];
    dialogue?: string;
    outcome?: ActionTreeNode["outcome"];
    notes?: string;
    manual?: boolean;
    tags?: string[];
    relationships?: Array<{ source: string; target: string; word: string }>;
  }
): ActionTreeNode {
  // Auto-pick turn = max(turn)+1 if not provided
  let turn = data.turn;
  if (typeof turn !== "number" || !Number.isFinite(turn)) {
    const maxRow = db.prepare(
      "SELECT MAX(turn) AS max_turn FROM action_tree_nodes WHERE chat_id = ?"
    ).get(chatId) as { max_turn: number | null } | undefined;
    turn = (maxRow?.max_turn ?? 0) + 1;
  }
  const id = newId();
  const createdAt = now();
  db.prepare(
    `INSERT INTO action_tree_nodes (id, chat_id, branch_id, turn, character, actions_json, dialogue, outcome, notes, manual, tags_json, relationships_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    chatId,
    data.branchId ?? null,
    turn,
    data.character || "",
    JSON.stringify(data.actions ?? []),
    data.dialogue || "",
    data.outcome || "pending",
    data.notes || "",
    data.manual ? 1 : 0,
    JSON.stringify(data.tags ?? []),
    JSON.stringify(data.relationships ?? []),
    createdAt
  );

  // Persist tags to message_tags table for searchability
  if (data.tags && data.tags.length > 0) {
    const insertTag = db.prepare(
      "INSERT INTO message_tags (id, chat_id, message_id, tag, turn, created_at) VALUES (?, ?, NULL, ?, ?, ?)"
    );
    for (const tag of data.tags.slice(0, 10)) {
      const trimmed = tag.trim().toLowerCase();
      if (!trimmed) continue;
      insertTag.run(newId(), chatId, trimmed, turn, createdAt);
    }
  }

  // Persist relationships to character_relationships table
  if (data.relationships && data.relationships.length > 0) {
    const insertRel = db.prepare(
      "INSERT INTO character_relationships (id, chat_id, source_character, target_character, word, turn, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    for (const rel of data.relationships) {
      insertRel.run(newId(), chatId, rel.source, rel.target, rel.word, turn, createdAt);
    }
  }

  return {
    id,
    chatId,
    branchId: data.branchId ?? null,
    turn,
    character: data.character || "",
    actions: data.actions ?? [],
    dialogue: data.dialogue || "",
    outcome: data.outcome || "pending",
    notes: data.notes || "",
    manual: data.manual === true,
    tags: data.tags ?? [],
    relationships: data.relationships ?? [],
    createdAt
  };
}

export function updateActionTreeNode(
  nodeId: string,
  patch: Partial<Pick<ActionTreeNode, "character" | "actions" | "dialogue" | "outcome" | "notes" | "turn" | "tags" | "relationships">>
): ActionTreeNode | null {
  const existing = db.prepare("SELECT * FROM action_tree_nodes WHERE id = ?").get(nodeId) as
    | ActionTreeNodeRow
    | undefined;
  if (!existing) return null;
  const merged: ActionTreeNodeRow = {
    ...existing,
    character: patch.character ?? existing.character,
    actions_json: patch.actions ? JSON.stringify(patch.actions) : existing.actions_json,
    dialogue: patch.dialogue ?? existing.dialogue,
    outcome: patch.outcome ?? existing.outcome,
    notes: patch.notes ?? existing.notes,
    turn: typeof patch.turn === "number" && Number.isFinite(patch.turn) ? patch.turn : existing.turn,
    tags_json: patch.tags ? JSON.stringify(patch.tags) : existing.tags_json,
    relationships_json: patch.relationships ? JSON.stringify(patch.relationships) : existing.relationships_json
  };
  db.prepare(
    `UPDATE action_tree_nodes
     SET character = ?, actions_json = ?, dialogue = ?, outcome = ?, notes = ?, turn = ?, tags_json = ?, relationships_json = ?
     WHERE id = ?`
  ).run(
    merged.character,
    merged.actions_json,
    merged.dialogue,
    merged.outcome,
    merged.notes,
    merged.turn,
    merged.tags_json,
    merged.relationships_json,
    nodeId
  );
  return parseNodeRow(merged);
}

export function deleteActionTreeNode(nodeId: string): boolean {
  const result = db.prepare("DELETE FROM action_tree_nodes WHERE id = ?").run(nodeId);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Action Tree: parsing <action_tree>...</action_tree> blocks from assistant replies
// ---------------------------------------------------------------------------

const ACTION_TREE_BLOCK_REGEX = /<action_tree>\s*([\s\S]*?)\s*<\/action_tree>/i;

interface ParsedActionTreeBlock {
  actions: string[];
  dialogue: string;
  outcome: ActionTreeNode["outcome"];
  tags: string[];
  relationships: Array<{ source: string; target: string; word: string }>;
}

export function extractActionTreeBlock(content: string): { cleanedContent: string; block: ParsedActionTreeBlock | null } {
  const match = content.match(ACTION_TREE_BLOCK_REGEX);
  if (!match) return { cleanedContent: content, block: null };
  const rawJson = match[1].trim();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    // Try to locate the first {...} substring
    const firstBrace = rawJson.indexOf("{");
    const lastBrace = rawJson.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(rawJson.slice(firstBrace, lastBrace + 1));
      } catch {
        parsed = null;
      }
    }
  }
  let block: ParsedActionTreeBlock | null = null;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    const actionsRaw = obj.actions ?? obj.action ?? obj.a;
    const actions: string[] = Array.isArray(actionsRaw)
      ? actionsRaw.flatMap((item) => (typeof item === "string" ? [item] : typeof item === "object" && item !== null && "description" in item && typeof (item as Record<string, unknown>).description === "string" ? [(item as Record<string, unknown>).description as string] : []))
      : typeof actionsRaw === "string"
        ? [actionsRaw]
        : [];
    const dialogue = typeof obj.dialogue === "string"
      ? obj.dialogue
      : typeof obj.line === "string"
        ? obj.line
        : "";
    const outcomeRaw = typeof obj.outcome === "string" ? obj.outcome.toLowerCase() : "pending";
    const outcome: ActionTreeNode["outcome"] = ["success", "partial", "failed", "pending"].includes(outcomeRaw)
      ? (outcomeRaw as ActionTreeNode["outcome"])
      : "pending";

    // Tags: array of short strings, e.g. ["tense", "betrayal", "romantic"]
    const tagsRaw = obj.tags ?? obj.tags_list ?? obj.t;
    const tags: string[] = Array.isArray(tagsRaw)
      ? tagsRaw.flatMap((item) => (typeof item === "string" ? [item.trim()].filter(Boolean) : []))
      : typeof tagsRaw === "string"
        ? [tagsRaw.trim()].filter(Boolean)
        : [];

    // Relationships: model can emit either an object map { "Aria→Victor": "mistrustful" }
    // or an array of { source, target, word }. We accept both.
    const relsRaw = obj.relationships ?? obj.rels ?? obj.r;
    const relationships: Array<{ source: string; target: string; word: string }> = [];
    if (Array.isArray(relsRaw)) {
      for (const item of relsRaw) {
        if (!item || typeof item !== "object") continue;
        const r = item as Record<string, unknown>;
        const source = typeof r.source === "string" ? r.source : typeof r.from === "string" ? r.from : "";
        const target = typeof r.target === "string" ? r.target : typeof r.to === "string" ? r.to : "";
        const word = typeof r.word === "string" ? r.word : typeof r.label === "string" ? r.label : "";
        if (source && target && word) {
          relationships.push({ source, target, word: word.slice(0, 60) });
        }
      }
    } else if (relsRaw && typeof relsRaw === "object") {
      for (const [key, value] of Object.entries(relsRaw as Record<string, unknown>)) {
        if (typeof value !== "string") continue;
        // Key can be "Aria→Victor" or "Aria->Victor" or "Aria:Victor"
        const parts = key.split(/[→\->:]/).map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          relationships.push({ source: parts[0], target: parts[1], word: value.slice(0, 60) });
        }
      }
    }

    block = { actions, dialogue, outcome, tags, relationships };
  }
  const cleanedContent = content.replace(ACTION_TREE_BLOCK_REGEX, "").replace(/\n{3,}/g, "\n\n").trim();
  return { cleanedContent, block };
}

// ---------------------------------------------------------------------------
// Action Tree: inject as compact context block
// ---------------------------------------------------------------------------

export function buildActionTreeInjection(chatId: string, maxNodes: number): string {
  const nodes = listActionTreeNodes(chatId).slice(-Math.max(1, maxNodes));
  if (nodes.length === 0) return "";
  const lines = nodes.map((node) => {
    const actionStr = node.actions.length > 0 ? node.actions.join("; ") : "—";
    const outcomeIcon = node.outcome === "success" ? "✓" : node.outcome === "failed" ? "✗" : node.outcome === "partial" ? "~" : "·";
    const dialogueStr = node.dialogue ? ` "${node.dialogue}"` : "";
    const notesStr = node.notes ? ` // ${node.notes}` : "";
    return `T${node.turn} ${node.character || "?"} ${outcomeIcon} ${actionStr}${dialogueStr}${notesStr}`;
  });
  return `[ACTION TREE — recent trajectory]\n${lines.join("\n")}\nUse this compressed trajectory for continuity. Stay consistent with prior actions and outcomes; do not contradict or repeat completed actions.`;
}

// ---------------------------------------------------------------------------
// Future Guides: CRUD
// ---------------------------------------------------------------------------

export function listFutureGuides(chatId: string): FutureGuide[] {
  const rows = db.prepare(
    "SELECT * FROM future_guides WHERE chat_id = ? ORDER BY target_turn ASC, created_at ASC"
  ).all(chatId) as FutureGuideRow[];
  return rows.map(parseGuideRow);
}

export function listActiveFutureGuides(chatId: string): FutureGuide[] {
  return listFutureGuides(chatId).filter((guide) => guide.status === "active");
}

export function insertFutureGuide(
  chatId: string,
  data: {
    title: string;
    guidance?: string;
    keyActions?: string[];
    targetTurn: number;
    strength?: number;
  }
): FutureGuide {
  const id = newId();
  const createdAt = now();
  const strength = Number.isFinite(data.strength) ? Math.max(0, Math.min(1, data.strength as number)) : 0.5;
  db.prepare(
    `INSERT INTO future_guides (id, chat_id, title, guidance, key_actions_json, target_turn, strength, status, created_at, reached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL)`
  ).run(
    id,
    chatId,
    data.title,
    data.guidance || "",
    JSON.stringify(data.keyActions ?? []),
    Math.max(1, Math.floor(data.targetTurn)),
    strength,
    createdAt
  );
  return {
    id,
    chatId,
    title: data.title,
    guidance: data.guidance || "",
    keyActions: data.keyActions ?? [],
    targetTurn: Math.max(1, Math.floor(data.targetTurn)),
    strength,
    status: "active",
    createdAt,
    reachedAt: null
  };
}

export function updateFutureGuide(
  guideId: string,
  patch: Partial<Pick<FutureGuide, "title" | "guidance" | "keyActions" | "targetTurn" | "strength" | "status">>
): FutureGuide | null {
  const existing = db.prepare("SELECT * FROM future_guides WHERE id = ?").get(guideId) as FutureGuideRow | undefined;
  if (!existing) return null;
  const merged: FutureGuideRow = {
    ...existing,
    title: patch.title ?? existing.title,
    guidance: patch.guidance ?? existing.guidance,
    key_actions_json: patch.keyActions ? JSON.stringify(patch.keyActions) : existing.key_actions_json,
    target_turn: typeof patch.targetTurn === "number" && Number.isFinite(patch.targetTurn) ? Math.max(1, Math.floor(patch.targetTurn)) : existing.target_turn,
    strength: typeof patch.strength === "number" && Number.isFinite(patch.strength) ? Math.max(0, Math.min(1, patch.strength)) : existing.strength,
    status: patch.status ?? existing.status,
    reached_at: patch.status === "reached" ? (existing.reached_at || now()) : patch.status === "abandoned" ? null : existing.reached_at
  };
  db.prepare(
    `UPDATE future_guides
     SET title = ?, guidance = ?, key_actions_json = ?, target_turn = ?, strength = ?, status = ?, reached_at = ?
     WHERE id = ?`
  ).run(
    merged.title,
    merged.guidance,
    merged.key_actions_json,
    merged.target_turn,
    merged.strength,
    merged.status,
    merged.reached_at,
    guideId
  );
  return parseGuideRow(merged);
}

export function deleteFutureGuide(guideId: string): boolean {
  const result = db.prepare("DELETE FROM future_guides WHERE id = ?").run(guideId);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Future Guides: injection + auto-reached detection
// ---------------------------------------------------------------------------

export function buildFutureGuidanceInjection(chatId: string, currentTurn: number): string {
  const active = listActiveFutureGuides(chatId);
  if (active.length === 0) return "";
  const sorted = active
    .map((guide) => {
      const turnsRemaining = Math.max(0, guide.targetTurn - currentTurn);
      const progress = guide.targetTurn > 0 ? Math.min(1, currentTurn / guide.targetTurn) : 1;
      const urgency = progress * guide.strength;
      return { guide, turnsRemaining, urgency };
    })
    .sort((a, b) => b.urgency - a.urgency);
  const lines = sorted.map(({ guide, turnsRemaining, urgency }) => {
    const keyActionsStr = guide.keyActions.length > 0 ? ` Key actions: ${guide.keyActions.join(", ")}.` : "";
    const urgencyLabel = urgency > 0.75 ? "URGENT" : urgency > 0.5 ? "rising" : "low";
    return `• In ~${turnsRemaining} turn(s): ${guide.title} (strength ${guide.strength.toFixed(2)}, ${urgencyLabel}).${keyActionsStr} Guidance: ${guide.guidance}`;
  });
  return `[FUTURE GUIDANCE — subtly steer toward these targets, naturally not forcibly]\n${lines.join("\n")}`;
}

/**
 * Auto-mark guides as 'reached' when all key_actions appear in recent action tree
 * node action strings, OR when currentTurn >= target_turn + 3 (overshoot).
 */
export function autoReachFutureGuides(chatId: string, currentTurn: number): void {
  const active = listActiveFutureGuides(chatId);
  if (active.length === 0) return;
  const recentNodes = listActionTreeNodes(chatId).slice(-20);
  const recentActionsText = recentNodes
    .flatMap((node) => [...node.actions, node.dialogue])
    .join(" ")
    .toLowerCase();
  for (const guide of active) {
    if (currentTurn >= guide.targetTurn + 3) {
      updateFutureGuide(guide.id, { status: "reached" });
      continue;
    }
    if (guide.keyActions.length === 0) continue;
    const allPresent = guide.keyActions.every((action) =>
      recentActionsText.includes(action.toLowerCase().trim())
    );
    if (allPresent && currentTurn >= guide.targetTurn - 2) {
      updateFutureGuide(guide.id, { status: "reached" });
    }
  }
}

// ---------------------------------------------------------------------------
// Chat turn tracking + summary metadata
// ---------------------------------------------------------------------------

export function incrementChatTurn(chatId: string): number {
  const row = db.prepare("SELECT current_turn FROM chats WHERE id = ?").get(chatId) as
    | { current_turn: number }
    | undefined;
  if (!row) return 0;
  const next = (row.current_turn || 0) + 1;
  db.prepare("UPDATE chats SET current_turn = ? WHERE id = ?").run(next, chatId);
  return next;
}

export function getChatTurn(chatId: string): number {
  const row = db.prepare("SELECT current_turn FROM chats WHERE id = ?").get(chatId) as
    | { current_turn: number }
    | undefined;
  return row?.current_turn || 0;
}

export function getChatSummary(chatId: string): { summary: string; updatedAt: string | null } {
  const row = db.prepare("SELECT context_summary, context_summary_updated_at FROM chats WHERE id = ?").get(chatId) as
    | { context_summary: string | null; context_summary_updated_at: string | null }
    | undefined;
  if (!row) return { summary: "", updatedAt: null };
  return {
    summary: row.context_summary || "",
    updatedAt: row.context_summary_updated_at
  };
}

export function setChatSummary(chatId: string, summary: string): void {
  const trimmed = String(summary || "").slice(0, 16_000);
  db.prepare("UPDATE chats SET context_summary = ?, context_summary_updated_at = ? WHERE id = ?")
    .run(trimmed, now(), chatId);
}

// ---------------------------------------------------------------------------
// Combined injection helper used by chatOrchestrator
// ---------------------------------------------------------------------------

export interface MemoryInjectionResult {
  actionTreeBlock: string;
  futureGuidanceBlock: string;
  tokenEstimate: number;
}

export function buildMemoryInjection(chatId: string, currentTurn: number): MemoryInjectionResult {
  const config = getActionTreeConfig(chatId);
  let actionTreeBlock = "";
  if (config.enabled) {
    actionTreeBlock = buildActionTreeInjection(chatId, config.injectionCount);
  }
  const futureGuidanceBlock = buildFutureGuidanceInjection(chatId, currentTurn);
  const tokenEstimate =
    roughTokenCount(actionTreeBlock) + roughTokenCount(futureGuidanceBlock);
  return { actionTreeBlock, futureGuidanceBlock, tokenEstimate };
}

// ---------------------------------------------------------------------------
// Relationships: list + latest word per (source, target) pair
// ---------------------------------------------------------------------------

export interface RelationshipRow {
  id: string;
  chatId: string;
  source: string;
  target: string;
  word: string;
  turn: number;
  createdAt: string;
}

export function listRelationships(chatId: string): RelationshipRow[] {
  const rows = db.prepare(
    "SELECT * FROM character_relationships WHERE chat_id = ? ORDER BY turn DESC, created_at DESC"
  ).all(chatId) as Array<{
    id: string;
    chat_id: string;
    source_character: string;
    target_character: string;
    word: string;
    turn: number;
    created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    chatId: r.chat_id,
    source: r.source_character,
    target: r.target_character,
    word: r.word,
    turn: r.turn,
    createdAt: r.created_at
  }));
}

export function listLatestRelationships(chatId: string): RelationshipRow[] {
  // For each (source, target) pair, return only the most recent entry
  const all = listRelationships(chatId);
  const seen = new Set<string>();
  const out: RelationshipRow[] = [];
  for (const row of all) {
    const key = `${row.source}→${row.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tags: list + search
// ---------------------------------------------------------------------------

export interface TagRow {
  tag: string;
  count: number;
  lastTurn: number | null;
}

export function listTagsForChat(chatId: string): TagRow[] {
  const rows = db.prepare(
    "SELECT tag, COUNT(*) AS count, MAX(turn) AS last_turn FROM message_tags WHERE chat_id = ? GROUP BY tag ORDER BY count DESC, tag ASC LIMIT 100"
  ).all(chatId) as Array<{ tag: string; count: number; last_turn: number | null }>;
  return rows.map((r) => ({
    tag: r.tag,
    count: r.count,
    lastTurn: r.last_turn
  }));
}

export function listAllTags(): TagRow[] {
  const rows = db.prepare(
    "SELECT tag, COUNT(*) AS count, MAX(turn) AS last_turn FROM message_tags GROUP BY tag ORDER BY count DESC, tag ASC LIMIT 200"
  ).all() as Array<{ tag: string; count: number; last_turn: number | null }>;
  return rows.map((r) => ({
    tag: r.tag,
    count: r.count,
    lastTurn: r.last_turn
  }));
}

export interface ChatSearchResult {
  chatId: string;
  chatTitle: string;
  matchType: "title" | "tag";
  preview: string;
  turn: number | null;
  createdAt: string;
}

/**
 * Search across all chats by title or tag.
 */
export function searchChats(query: string): ChatSearchResult[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const results: ChatSearchResult[] = [];

  // Title matches
  const titleRows = db.prepare(
    "SELECT id, title FROM chats WHERE LOWER(title) LIKE ? ORDER BY created_at DESC LIMIT 30"
  ).all(`%${trimmed}%`) as Array<{ id: string; title: string }>;
  for (const row of titleRows) {
    results.push({
      chatId: row.id,
      chatTitle: row.title,
      matchType: "title",
      preview: row.title,
      turn: null,
      createdAt: ""
    });
  }

  // Tag matches
  const tagRows = db.prepare(
    `SELECT mt.chat_id, mt.tag, mt.turn, mt.created_at, c.title
     FROM message_tags mt
     JOIN chats c ON c.id = mt.chat_id
     WHERE mt.tag LIKE ?
     ORDER BY mt.created_at DESC
     LIMIT 50`
  ).all(`%${trimmed}%`) as Array<{
    chat_id: string;
    tag: string;
    turn: number | null;
    created_at: string;
    title: string;
  }>;
  for (const row of tagRows) {
    results.push({
      chatId: row.chat_id,
      chatTitle: row.title,
      matchType: "tag",
      preview: `#${row.tag}`,
      turn: row.turn,
      createdAt: row.created_at
    });
  }

  // Message content matches (LIKE search across messages table)
  const msgRows = db.prepare(
    `SELECT m.chat_id, m.content, m.created_at, c.title
     FROM messages m
     JOIN chats c ON c.id = m.chat_id
     WHERE m.deleted = 0 AND LOWER(m.content) LIKE ?
     ORDER BY m.created_at DESC
     LIMIT 30`
  ).all(`%${trimmed}%`) as Array<{
    chat_id: string;
    content: string;
    created_at: string;
    title: string;
  }>;
  for (const row of msgRows) {
    const contentLower = row.content.toLowerCase();
    const idx = contentLower.indexOf(trimmed);
    const start = Math.max(0, idx - 40);
    const end = Math.min(row.content.length, idx + trimmed.length + 60);
    const preview = (start > 0 ? "…" : "") + row.content.slice(start, end) + (end < row.content.length ? "…" : "");
    results.push({
      chatId: row.chat_id,
      chatTitle: row.title,
      matchType: "tag",
      preview,
      turn: null,
      createdAt: row.created_at
    });
  }

  // Dedupe by chatId (keep first occurrence per chat)
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.chatId)) return false;
    seen.add(r.chatId);
    return true;
  }).slice(0, 50);
}
