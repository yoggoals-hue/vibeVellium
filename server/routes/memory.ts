// VibeVellium memory system API routes
// Action Tree + Future Guides + Summary + Payload Preview
// + Free Will + Body State + Relationships + Tags + Chat Search

import { Router } from "express";
import { db, newId, now, isLocalhostUrl } from "../db.js";
import {
  deleteActionTreeNode,
  deleteFutureGuide,
  extractActionTreeBlock,
  getActionTreeConfig,
  getChatSummary,
  getChatTurn,
  incrementChatTurn,
  insertActionTreeNode,
  insertFutureGuide,
  listActionTreeNodes,
  listFutureGuides,
  listLatestRelationships,
  listRelationships,
  listTagsForChat,
  listAllTags,
  searchChats,
  setActionTreeConfig,
  setChatSummary,
  updateActionTreeNode,
  updateFutureGuide,
  type ActionTreeNode,
  type ActionTreeConfig,
  type FutureGuide
} from "../services/memorySystem.js";
import {
  forceRollFreeWill,
  getBodyStateConfig,
  getFreeWillConfig,
  listBodyStateMeters,
  listFreeWillRolls,
  setBodyStateConfig,
  setBodyStateMeter,
  setFreeWillConfig,
  ensureBodyStateMetersForCharacter,
  type BodyStateConfig,
  type BodyStateMeter,
  type FreeWillConfig,
  type FreeWillFrequency,
  type FreeWillTier
} from "../services/freeWill.js";
import { buildSystemPrompt, buildMessageArray, buildMultiCharSystemPrompt, buildMultiCharMessageArray, mergeConsecutiveRoles } from "../domain/rpEngine.js";
import { getTriggeredLoreEntries, injectLoreBlocks } from "../domain/lorebooks.js";
import { getAuthorNote, getChatSamplerConfig, getCharacterCard, getLorebookEntries, getSceneState } from "../modules/chat/promptContext.js";
import { getPromptBlocks, getSettings, getTimeline, resolveBranch, type ProviderRow, type UserPersonaPayload } from "../modules/chat/routeHelpers.js";
import { resolveLorebookIds } from "../modules/chat/attachments.js";
import { retrieveRagContext } from "../services/rag.js";

const router = Router();

// ---------------------------------------------------------------------------
// Action Tree
// ---------------------------------------------------------------------------

router.get("/:chatId/action-tree", (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const nodes = listActionTreeNodes(chatId);
  const config = getActionTreeConfig(chatId);
  res.json({ nodes, config, currentTurn: getChatTurn(chatId) });
});

router.put("/:chatId/action-tree/config", (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const body = req.body || {};
  const patch: Partial<Pick<ActionTreeConfig, "enabled" | "format" | "modelId" | "injectionCount">> = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (body.format === "inline" || body.format === "second_call") patch.format = body.format;
  if (typeof body.modelId === "string" || body.modelId === null) patch.modelId = body.modelId;
  if (typeof body.injectionCount === "number" && Number.isFinite(body.injectionCount)) {
    patch.injectionCount = Math.max(1, Math.min(50, Math.floor(body.injectionCount)));
  }
  const next = setActionTreeConfig(chatId, patch);
  res.json({ config: next });
});

router.post("/:chatId/action-tree/nodes", (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const body = req.body || {};
  const node = insertActionTreeNode(chatId, {
    branchId: typeof body.branchId === "string" ? body.branchId : null,
    turn: typeof body.turn === "number" ? body.turn : undefined,
    character: typeof body.character === "string" ? body.character : "",
    actions: Array.isArray(body.actions) ? body.actions.filter((a: unknown) => typeof a === "string") : [],
    dialogue: typeof body.dialogue === "string" ? body.dialogue : "",
    outcome: ["pending", "success", "partial", "failed"].includes(body.outcome) ? body.outcome : "pending",
    notes: typeof body.notes === "string" ? body.notes : "",
    manual: true
  });
  res.json({ node });
});

router.patch("/action-tree/nodes/:nodeId", (req, res) => {
  const nodeId = String(req.params.nodeId || "").trim();
  if (!nodeId) {
    res.status(400).json({ error: "nodeId is required" });
    return;
  }
  const body = req.body || {};
  const patch: Partial<Pick<ActionTreeNode, "character" | "actions" | "dialogue" | "outcome" | "notes" | "turn" | "tags" | "relationships">> = {};
  if (typeof body.character === "string") patch.character = body.character;
  if (Array.isArray(body.actions)) patch.actions = body.actions.filter((a: unknown) => typeof a === "string");
  if (typeof body.dialogue === "string") patch.dialogue = body.dialogue;
  if (["pending", "success", "partial", "failed"].includes(body.outcome)) patch.outcome = body.outcome;
  if (typeof body.notes === "string") patch.notes = body.notes;
  if (typeof body.turn === "number" && Number.isFinite(body.turn)) patch.turn = body.turn;
  // Forward tags + relationships to updateActionTreeNode — without these,
  // edits to tags/relationships from the Inspector were silently dropped
  // (HTTP 200 returned the unmodified node).
  if (Array.isArray(body.tags)) {
    patch.tags = body.tags
      .map((t: unknown) => (typeof t === "string" ? t.trim() : ""))
      .filter(Boolean)
      .slice(0, 20);
  }
  if (Array.isArray(body.relationships)) {
    patch.relationships = body.relationships.flatMap((r: unknown) => {
      if (!r || typeof r !== "object") return [];
      const row = r as { source?: unknown; target?: unknown; word?: unknown };
      const source = typeof row.source === "string" ? row.source.trim() : "";
      const target = typeof row.target === "string" ? row.target.trim() : "";
      const word = typeof row.word === "string" ? row.word.trim() : "";
      return source && target && word ? [{ source, target, word }] : [];
    });
  }
  const updated = updateActionTreeNode(nodeId, patch);
  if (!updated) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  res.json({ node: updated });
});

router.delete("/action-tree/nodes/:nodeId", (req, res) => {
  const nodeId = String(req.params.nodeId || "").trim();
  if (!nodeId) {
    res.status(400).json({ error: "nodeId is required" });
    return;
  }
  const ok = deleteActionTreeNode(nodeId);
  if (!ok) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Future Guides
// ---------------------------------------------------------------------------

router.get("/:chatId/future-guides", (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const guides = listFutureGuides(chatId);
  res.json({ guides, currentTurn: getChatTurn(chatId) });
});

router.post("/:chatId/future-guides", (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const body = req.body || {};
  if (typeof body.title !== "string" || !body.title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  if (typeof body.targetTurn !== "number" || !Number.isFinite(body.targetTurn) || body.targetTurn < 1) {
    res.status(400).json({ error: "targetTurn must be a positive number" });
    return;
  }
  const guide = insertFutureGuide(chatId, {
    title: body.title.trim().slice(0, 200),
    guidance: typeof body.guidance === "string" ? body.guidance.slice(0, 4000) : "",
    keyActions: Array.isArray(body.keyActions) ? body.keyActions.filter((a: unknown) => typeof a === "string").slice(0, 8) : [],
    targetTurn: Math.floor(body.targetTurn),
    strength: typeof body.strength === "number" && Number.isFinite(body.strength) ? body.strength : 0.5
  });
  res.json({ guide });
});

router.patch("/future-guides/:guideId", (req, res) => {
  const guideId = String(req.params.guideId || "").trim();
  if (!guideId) {
    res.status(400).json({ error: "guideId is required" });
    return;
  }
  const body = req.body || {};
  const patch: Partial<Pick<FutureGuide, "title" | "guidance" | "keyActions" | "targetTurn" | "strength" | "status">> = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.guidance === "string") patch.guidance = body.guidance;
  if (Array.isArray(body.keyActions)) patch.keyActions = body.keyActions.filter((a: unknown) => typeof a === "string");
  if (typeof body.targetTurn === "number" && Number.isFinite(body.targetTurn)) patch.targetTurn = Math.floor(body.targetTurn);
  if (typeof body.strength === "number" && Number.isFinite(body.strength)) patch.strength = body.strength;
  if (["active", "reached", "abandoned"].includes(body.status)) patch.status = body.status;
  const updated = updateFutureGuide(guideId, patch);
  if (!updated) {
    res.status(404).json({ error: "Guide not found" });
    return;
  }
  res.json({ guide: updated });
});

router.delete("/future-guides/:guideId", (req, res) => {
  const guideId = String(req.params.guideId || "").trim();
  if (!guideId) {
    res.status(400).json({ error: "guideId is required" });
    return;
  }
  const ok = deleteFutureGuide(guideId);
  if (!ok) {
    res.status(404).json({ error: "Guide not found" });
    return;
  }
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Chat summary
// ---------------------------------------------------------------------------

router.get("/:chatId/summary", (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const summary = getChatSummary(chatId);
  res.json({ summary: summary.summary, updatedAt: summary.updatedAt, currentTurn: getChatTurn(chatId) });
});

router.put("/:chatId/summary", (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const body = req.body || {};
  const summary = typeof body.summary === "string" ? body.summary : "";
  setChatSummary(chatId, summary);
  const result = getChatSummary(chatId);
  res.json({ summary: result.summary, updatedAt: result.updatedAt });
});

// ---------------------------------------------------------------------------
// Turn counter
// ---------------------------------------------------------------------------

router.post("/:chatId/turn/increment", (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const next = incrementChatTurn(chatId);
  res.json({ currentTurn: next });
});

// ---------------------------------------------------------------------------
// Payload preview — mirrors chatOrchestrator's prompt builder without calling LLM
// ---------------------------------------------------------------------------

router.get("/:chatId/payload-preview", async (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
  try {
    const settings = getSettings();
    const providerId = settings.activeProviderId;
    const modelId = settings.activeModel;

    const chat = db.prepare(
      "SELECT character_id, character_ids, lorebook_id, lorebook_ids, context_summary, current_turn FROM chats WHERE id = ?"
    ).get(chatId) as {
      character_id: string | null;
      character_ids: string | null;
      lorebook_id: string | null;
      lorebook_ids: string | null;
      context_summary: string | null;
      current_turn: number | null;
    } | undefined;
    if (!chat) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }

    const blocks = getPromptBlocks(settings as Record<string, unknown>);
    const sceneState = getSceneState(chatId);
    const authorNote = getAuthorNote(chatId);
    const samplerConfig = getChatSamplerConfig(chatId, settings.samplerConfig);
    const chatMode = sceneState?.chatMode || "rp";
    const pureChatMode = chatMode === "pure_chat";
    const lightRpMode = chatMode === "light_rp";
    const systemBlockContent = String(blocks.find((block) => block.kind === "system")?.content || "").trim();

    let characterIds: string[] = [];
    try {
      characterIds = JSON.parse(chat.character_ids || "[]");
    } catch {
      characterIds = [];
    }
    if (characterIds.length === 0 && chat.character_id) characterIds = [chat.character_id];

    const characterCards = characterIds
      .map((id) => getCharacterCard(id))
      .filter((card): card is NonNullable<typeof card> => card !== null);

    const timeline = getTimeline(chatId, branchId || "").filter((m) => m.role === "user" || m.role === "assistant");
    const contextSummary = chat.context_summary || "";

    const selectedLorebookIds = resolveLorebookIds(chat);
    const lorebookEntries = pureChatMode || lightRpMode ? [] : getLorebookEntries(selectedLorebookIds);
    const loreBlockEnabled = !pureChatMode && !lightRpMode && blocks.some((block) => block.kind === "lore" && block.enabled);
    const triggeredLoreEntries = loreBlockEnabled
      ? getTriggeredLoreEntries(lorebookEntries, timeline.map((item) => String(item.content || "")))
      : [];
    const effectiveBlocks = !pureChatMode && !lightRpMode && triggeredLoreEntries.length > 0
      ? injectLoreBlocks(blocks, triggeredLoreEntries)
      : blocks;

    const promptTimelineForModel = timeline.map((item) => ({
      role: item.role,
      content: String(item.content || ""),
      characterName: item.characterName,
      attachments: []
    }));

    const currentCharCard = characterCards[0] ?? null;
    const characterSystemPrompt = String(currentCharCard?.systemPrompt || "").trim();
    const resolvedBaseSystemPrompt = systemBlockContent
      || characterSystemPrompt
      || String(settings.defaultSystemPrompt || "").trim();
    const promptCharacterCard = systemBlockContent || !characterSystemPrompt
      ? currentCharCard
      : currentCharCard
        ? { ...currentCharCard, systemPrompt: "" }
        : null;

    let systemPrompt = "";
    let apiMessages: Array<{ role: string; content: unknown }> = [];
    if (pureChatMode || lightRpMode || !promptCharacterCard) {
      systemPrompt = resolvedBaseSystemPrompt
        + (contextSummary ? `\n\n[Context Summary]\n${contextSummary}` : "")
        + (authorNote ? `\n\n[Author Note]\n${authorNote}` : "")
        + (sceneState?.mood ? `\n\n[Scene] mood: ${sceneState.mood}; pacing: ${sceneState.pacing}` : "");
      apiMessages = buildMessageArray(
        systemPrompt,
        promptTimelineForModel,
        authorNote,
        contextSummary,
        promptCharacterCard?.name,
        "User",
        promptCharacterCard?.postHistoryInstructions
      );
    } else if (characterCards.length > 1) {
      systemPrompt = buildMultiCharSystemPrompt(
        {
          blocks: effectiveBlocks,
          characterCard: promptCharacterCard,
          sceneState,
          authorNote,
          intensity: sceneState?.intensity ?? 0.5,
          responseLanguage: settings.responseLanguage,
          censorshipMode: settings.censorshipMode,
          contextSummary,
          defaultSystemPrompt: resolvedBaseSystemPrompt,
          strictGrounding: true,
          userName: "User"
        },
        characterCards,
        characterCards[0]?.name || ""
      );
      apiMessages = buildMultiCharMessageArray(
        systemPrompt,
        promptTimelineForModel,
        characterCards[0]?.name || "",
        authorNote,
        contextSummary,
        "User",
        promptCharacterCard?.postHistoryInstructions
      );
    } else {
      systemPrompt = buildSystemPrompt({
        blocks: effectiveBlocks,
        characterCard: promptCharacterCard,
        sceneState,
        authorNote,
        intensity: sceneState?.intensity ?? 0.5,
        responseLanguage: settings.responseLanguage,
        censorshipMode: settings.censorshipMode,
        contextSummary,
        defaultSystemPrompt: resolvedBaseSystemPrompt,
        strictGrounding: true,
        userName: "User"
      });
      apiMessages = buildMessageArray(
        systemPrompt,
        promptTimelineForModel,
        authorNote,
        contextSummary,
        promptCharacterCard?.name,
        "User",
        promptCharacterCard?.postHistoryInstructions
      );
    }

    if (settings.mergeConsecutiveRoles) {
      apiMessages = mergeConsecutiveRoles(apiMessages as unknown as Parameters<typeof mergeConsecutiveRoles>[0]) as unknown as Array<{ role: string; content: unknown }>;
    }

    // Memory injection (action tree + future guides)
    const currentTurn = chat.current_turn || 0;
    const actionTreeConfig = getActionTreeConfig(chatId);
    let actionTreeBlock = "";
    let futureGuidanceBlock = "";
    if (actionTreeConfig.enabled) {
      // Inline import to avoid circular dependency issues at module load
      const { buildActionTreeInjection, buildFutureGuidanceInjection } = await import("../services/memorySystem.js");
      actionTreeBlock = buildActionTreeInjection(chatId, actionTreeConfig.injectionCount);
      futureGuidanceBlock = buildFutureGuidanceInjection(chatId, currentTurn);
    }

    res.json({
      meta: {
        chatId,
        branchId: branchId || null,
        providerId,
        modelId,
        providerType: (db.prepare("SELECT provider_type FROM providers WHERE id = ?").get(providerId) as { provider_type?: string } | undefined)?.provider_type || null,
        chatMode,
        currentTurn,
        generatedAt: now(),
        note: "Read-only preview. No request is fired."
      },
      promptStack: {
        blocks: effectiveBlocks.map((b: { kind: string; enabled: boolean; order: number; content: string }) => ({
          kind: b.kind,
          enabled: b.enabled,
          order: b.order,
          contentLength: (b.content || "").length,
          contentPreview: (b.content || "").slice(0, 400) + ((b.content || "").length > 400 ? "…" : "")
        })),
        systemPrompt,
        authorNote,
        contextSummary,
        triggeredLoreEntries: triggeredLoreEntries.map((entry) => ({
          id: entry.id || "",
          name: entry.name || "",
          keys: entry.keys || []
        })),
        memoryInjection: {
          actionTreeBlock,
          futureGuidanceBlock
        }
      },
      sceneState: sceneState
        ? {
            mood: sceneState.mood,
            pacing: sceneState.pacing,
            intensity: sceneState.intensity,
            chatMode: sceneState.chatMode,
            variables: sceneState.variables
          }
        : null,
      characters: characterCards.map((card) => ({
        id: card.name,
        name: card.name,
        descriptionPreview: (card.description || "").slice(0, 200),
        personalityPreview: (card.personality || "").slice(0, 200),
        scenarioPreview: (card.scenario || "").slice(0, 200),
        hasSystemPrompt: Boolean(card.systemPrompt),
        hasPostHistoryInstructions: Boolean(card.postHistoryInstructions)
      })),
      sampler: samplerConfig,
      messages: apiMessages.map((msg) => ({
        role: msg.role,
        contentPreview: typeof msg.content === "string"
          ? (msg.content.slice(0, 300) + (msg.content.length > 300 ? "…" : ""))
          : "[non-string content]"
      })),
      messageCount: apiMessages.length,
      timelineWindow: {
        total: timeline.length,
        sent: promptTimelineForModel.length,
        truncated: timeline.length > promptTimelineForModel.length
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payload preview failed";
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// Free Will: config + rolls log + force-roll
// ---------------------------------------------------------------------------

router.get("/:chatId/free-will", (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const config = getFreeWillConfig(chatId);
  const rolls = listFreeWillRolls(chatId, 10);
  res.json({ config, rolls, currentTurn: getChatTurn(chatId) });
});

router.put("/:chatId/free-will/config", (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const body = req.body || {};
  const patch: Partial<Omit<FreeWillConfig, "chatId" | "updatedAt">> = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.intensity === "number" && Number.isFinite(body.intensity)) {
    patch.intensity = Math.max(0, Math.min(100, Math.floor(body.intensity)));
  }
  if (typeof body.frequency === "string" && ["every_turn", "every_3", "every_5", "random_1_in_5"].includes(body.frequency)) {
    patch.frequency = body.frequency as FreeWillFrequency;
  }
  if (typeof body.autoPause === "boolean") patch.autoPause = body.autoPause;
  if (body.tiers && typeof body.tiers === "object") {
    const t = body.tiers as Record<string, unknown>;
    const current = getFreeWillConfig(chatId);
    patch.tiers = {
      no_op: typeof t.no_op === "boolean" ? t.no_op : current.tiers.no_op,
      biological: typeof t.biological === "boolean" ? t.biological : current.tiers.biological,
      mood: typeof t.mood === "boolean" ? t.mood : current.tiers.mood,
      scene: typeof t.scene === "boolean" ? t.scene : current.tiers.scene,
      weird: typeof t.weird === "boolean" ? t.weird : current.tiers.weird,
      critical: typeof t.critical === "boolean" ? t.critical : current.tiers.critical
    };
  }
  const next = setFreeWillConfig(chatId, patch);
  res.json({ config: next });
});

router.get("/:chatId/free-will/rolls", (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 20;
  const rolls = listFreeWillRolls(chatId, limit);
  res.json({ rolls });
});

router.post("/:chatId/free-will/force-roll", (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const result = forceRollFreeWill(chatId);
  res.json({ roll: result });
});

// ---------------------------------------------------------------------------
// Body State: config + meters
// ---------------------------------------------------------------------------

router.get("/:chatId/body-state", (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const config = getBodyStateConfig(chatId);

  // BUGFIX: previously this endpoint only returned meters that already
  // existed in the body_state_meters table. Meters are normally created
  // lazily during chat generation (via ensureBodyStateMetersForCharacter),
  // so when a user opened the inspector for a chat that hadn't generated
  // a reply since body state was enabled, the section showed "no meters"
  // even though characters were linked to the chat. We now proactively
  // ensure meters exist for every character linked to the chat whenever
  // body state is enabled — this makes the "active character" immediately
  // visible in the inspector without requiring a generation round-trip.
  //
  // We also resolve character IDs to names and mark the primary character
  // so the UI can show "Mitsuri Kanroji" instead of "a1b2c3d4".
  const chatRow = db.prepare("SELECT character_id, character_ids FROM chats WHERE id = ?").get(chatId) as {
    character_id: string | null;
    character_ids: string | null;
  } | undefined;

  const primaryCharacterId = chatRow?.character_id || null;
  let linkedCharacterIds: string[] = [];
  try {
    const parsed = JSON.parse(chatRow?.character_ids || "[]");
    if (Array.isArray(parsed)) {
      linkedCharacterIds = parsed.flatMap((x) => (typeof x === "string" && x.trim() ? [x.trim()] : []));
    }
  } catch {
    // ignore malformed JSON
  }
  if (primaryCharacterId && !linkedCharacterIds.includes(primaryCharacterId)) {
    linkedCharacterIds.unshift(primaryCharacterId);
  }

  // Auto-create default meters (value 50, unlocked) for every linked
  // character — but only when body state is enabled, so we don't
  // pollute the table for users who never turned the feature on.
  if (config.enabled) {
    for (const charId of linkedCharacterIds) {
      try {
        ensureBodyStateMetersForCharacter(chatId, charId);
      } catch {
        // best-effort — don't fail the whole request if one character fails
      }
    }
  }

  const meters = listBodyStateMeters(chatId);

  // Resolve character names for the UI. We look up each character's name
  // from the characters table so the inspector can display a human-readable
  // label instead of a truncated UUID.
  const characters = linkedCharacterIds.map((id) => {
    const nameRow = db.prepare("SELECT name FROM characters WHERE id = ?").get(id) as { name: string } | undefined;
    return {
      id,
      name: nameRow?.name || `Character ${id.slice(0, 8)}`,
      isPrimary: id === primaryCharacterId
    };
  });

  res.json({ config, meters, characters });
});

router.put("/:chatId/body-state/config", (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const body = req.body || {};
  const patch: Partial<Omit<BodyStateConfig, "chatId" | "updatedAt">> = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.decayRate === "number" && Number.isFinite(body.decayRate)) {
    patch.decayRate = Math.max(0, Math.min(20, Math.floor(body.decayRate)));
  }
  if (typeof body.injectThresholdLow === "number") {
    patch.injectThresholdLow = Math.max(0, Math.min(50, Math.floor(body.injectThresholdLow)));
  }
  if (typeof body.injectThresholdHigh === "number") {
    patch.injectThresholdHigh = Math.max(50, Math.min(100, Math.floor(body.injectThresholdHigh)));
  }
  if (body.meters && typeof body.meters === "object") {
    const m = body.meters as Record<string, unknown>;
    const current = getBodyStateConfig(chatId);
    patch.meters = {
      hunger: typeof m.hunger === "boolean" ? m.hunger : current.meters.hunger,
      fatigue: typeof m.fatigue === "boolean" ? m.fatigue : current.meters.fatigue,
      arousal: typeof m.arousal === "boolean" ? m.arousal : current.meters.arousal
    };
  }
  const next = setBodyStateConfig(chatId, patch);
  res.json({ config: next });
});

router.put("/:chatId/body-state/meters", (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const body = req.body || {};
  if (typeof body.characterId !== "string" || !body.characterId) {
    res.status(400).json({ error: "characterId is required" });
    return;
  }
  if (typeof body.meter !== "string" || !["hunger", "fatigue", "arousal"].includes(body.meter)) {
    res.status(400).json({ error: "meter must be hunger, fatigue, or arousal" });
    return;
  }
  if (typeof body.value !== "number" || !Number.isFinite(body.value)) {
    res.status(400).json({ error: "value is required" });
    return;
  }
  const meter = body.meter as BodyStateMeter["meter"];
  const meter_row = setBodyStateMeter(chatId, body.characterId, meter, body.value, typeof body.locked === "boolean" ? body.locked : undefined);
  res.json({ meter: meter_row });
});

// ---------------------------------------------------------------------------
// Relationships: list (latest word per pair)
// ---------------------------------------------------------------------------

router.get("/:chatId/relationships", (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const latest = listLatestRelationships(chatId);
  const all = listRelationships(chatId).slice(0, 50);
  res.json({ latest, recent: all });
});

// ---------------------------------------------------------------------------
// Tags: list per chat + list all + search chats
// ---------------------------------------------------------------------------

router.get("/:chatId/tags", (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const tags = listTagsForChat(chatId);
  res.json({ tags });
});

router.get("/tags/all", (_req, res) => {
  const tags = listAllTags();
  res.json({ tags });
});

router.get("/search/chats", (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q : "";
  if (!query.trim()) {
    res.json({ results: [] });
    return;
  }
  const results = searchChats(query);
  res.json({ results });
});

// ---------------------------------------------------------------------------
// Manual AI generation: send last N messages to the model, get an
// action-tree or relationships JSON back, and persist it to the chat.
//
// These endpoints exist because the only other way to populate the action
// tree / relationships tables was the auto-extraction path inside
// chatOrchestrator (which only fires when the model emits an
// <action_tree>...</action_tree> block inline, during a normal reply).
// If your model doesn't emit those blocks, the inspector stayed empty.
// With these endpoints the user can click "Generate from chat (AI)" and
// force a one-shot extraction pass over the recent conversation.
// ---------------------------------------------------------------------------

const MANUAL_GENERATE_WINDOW_DEFAULT = 15;
const MANUAL_GENERATE_WINDOW_MAX = 60;

function getRecentTimelineWindow(chatId: string, windowSize: number, branchId?: string): Array<{ role: string; content: string; characterName: string | null }> {
  // BUGFIX: previously this called getTimeline(chatId, "") with an empty
  // branch id. The messages table stores branch_id as a UUID, so the query
  // `WHERE branch_id = ""` matched ZERO rows — which is why the "Generate
  // from chat (AI)" buttons for action-tree and relationships always failed
  // with "No messages in chat to analyze" even when the chat had hundreds
  // of messages. We now resolve the chat's main branch (or use the caller-
  // supplied branchId) so the actual message history is read.
  const resolvedBranchId = branchId || resolveBranch(chatId);
  const timeline = getTimeline(chatId, resolvedBranchId).filter((m) => m.role === "user" || m.role === "assistant");
  const slice = timeline.slice(-Math.max(1, Math.min(windowSize, MANUAL_GENERATE_WINDOW_MAX)));
  return slice.map((m) => ({
    role: m.role,
    content: String(m.content || ""),
    characterName: m.characterName
  }));
}

function safeParseJsonObject(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Direct parse first.
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  // Try to locate the outermost {...} or [...] block — models often wrap JSON
  // in ```json ... ``` or add prose around it.
  const firstObj = trimmed.indexOf("{");
  const lastObj = trimmed.lastIndexOf("}");
  const firstArr = trimmed.indexOf("[");
  const lastArr = trimmed.lastIndexOf("]");
  const trySlice = (start: number, end: number) => {
    if (start < 0 || end <= start) return null;
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { return null; }
  };
  let candidate: unknown = null;
  if (firstObj >= 0) candidate = trySlice(firstObj, lastObj);
  if (candidate === null && firstArr >= 0) candidate = trySlice(firstArr, lastArr);
  return candidate;
}

router.post("/:chatId/action-tree/generate", async (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const body = req.body || {};
  const windowSize = typeof body.windowSize === "number" && Number.isFinite(body.windowSize)
    ? Math.max(1, Math.min(MANUAL_GENERATE_WINDOW_MAX, Math.floor(body.windowSize)))
    : MANUAL_GENERATE_WINDOW_DEFAULT;
  const persist = body.persist !== false; // default true
  const overrideModelId = typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : null;
  const branchId = typeof body.branchId === "string" && body.branchId.trim() ? body.branchId.trim() : undefined;

  try {
    const settings = getSettings();
    const providerId = settings.activeProviderId;
    const modelId = overrideModelId || settings.activeModel;
    if (!providerId || !modelId) {
      res.status(400).json({ error: "No active provider/model configured" });
      return;
    }
    const provider = db.prepare("SELECT * FROM providers WHERE id = ?").get(providerId) as (ProviderRow & { name?: string }) | undefined;
    if (!provider) {
      res.status(404).json({ error: "Provider not found" });
      return;
    }
    if (settings.fullLocalMode && !isLocalhostUrl(provider.base_url)) {
      res.status(400).json({ error: "Provider blocked by Full Local Mode" });
      return;
    }

    const timeline = getRecentTimelineWindow(chatId, windowSize, branchId);
    if (timeline.length === 0) {
      res.status(400).json({ error: "No messages in chat to analyze" });
      return;
    }

    const chat = db.prepare("SELECT current_turn FROM chats WHERE id = ?").get(chatId) as { current_turn: number | null } | undefined;
    const currentTurn = chat?.current_turn ?? 0;

    // Compact transcript: "User: ..." / "Assistant: ..." — keeps token count
    // predictable regardless of which roles appeared in the window.
    const transcript = timeline
      .map((m) => {
        const speaker = m.role === "user" ? "User" : (m.characterName || "Assistant");
        return `${speaker}: ${m.content}`;
      })
      .join("\n\n");

    const systemPrompt = [
      "You are an action-tree extractor for a roleplay chat.",
      "Read the recent transcript and produce a SINGLE action-tree node that summarizes the most recent turn.",
      "Output STRICT JSON only — no prose, no markdown fences — matching this TypeScript type:",
      "{",
      "  \"character\": string,           // who acted (the assistant character name; empty if unclear",
      "  \"actions\": string[],            // 1-5 short concrete actions taken in this turn",
      "  \"dialogue\": string,             // the single most representative line spoken, empty if none",
      "  \"outcome\": \"pending\" | \"success\" | \"partial\" | \"failed\",",
      "  \"notes\": string,                // 1 sentence of context/interpretation, empty allowed",
      "  \"tags\": string[],               // 0-5 lowercase single-word tags (no #)",
      "  \"relationships\": Array<{ source: string; target: string; word: string }>  // 0-5 entries; word = a 1-3 word descriptor like \"fond of\", \"distrusts\", \"allied with\"",
      "}",
      "Rules:",
      "- Source/target in relationships MUST be character names that appear in the transcript.",
      "- Do NOT invent characters that aren't in the transcript.",
      "- Keep everything terse — this is for memory recall, not prose."
    ].join("\n");

    const apiMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Transcript (most recent ${timeline.length} messages, turn ${currentTurn}):\n\n${transcript}\n\nProduce the JSON now.` }
    ];

    const { unifiedGenerateText } = await import("../services/unifiedGeneration.js");
    const result = await unifiedGenerateText({
      provider: {
        id: provider.id,
        name: provider.name || "",
        base_url: provider.base_url,
        api_key_cipher: provider.api_key_cipher,
        provider_type: provider.provider_type,
        adapter_id: provider.adapter_id ?? null
      },
      modelId,
      messages: apiMessages as Array<{ role: string; content: unknown }>,
      samplerConfig: { ...settings.samplerConfig, temperature: 0.4, maxTokens: 800 } as Record<string, unknown>,
      apiParamPolicy: settings.apiParamPolicy,
      signal: undefined as AbortSignal | undefined
    });

    const parsed = safeParseJsonObject(result.content || "") as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") {
      res.status(502).json({
        error: "Model did not return valid JSON",
        raw: (result.content || "").slice(0, 1000),
        reasoning: result.reasoning || ""
      });
      return;
    }

    const actionsRaw = parsed.actions ?? parsed.action ?? parsed.a;
    const actions: string[] = Array.isArray(actionsRaw)
      ? actionsRaw.flatMap((x) => (typeof x === "string" ? [x] : (x && typeof x === "object" && "description" in x && typeof (x as Record<string, unknown>).description === "string") ? [(x as Record<string, unknown>).description as string] : []))
      : typeof actionsRaw === "string" ? [actionsRaw] : [];
    const dialogue = typeof parsed.dialogue === "string" ? parsed.dialogue : typeof parsed.line === "string" ? parsed.line : "";
    const outcomeRaw = String(parsed.outcome || "").toLowerCase();
    const outcome: ActionTreeNode["outcome"] = ["pending", "success", "partial", "failed"].includes(outcomeRaw) ? outcomeRaw as ActionTreeNode["outcome"] : "pending";
    const notes = typeof parsed.notes === "string" ? parsed.notes : "";
    const character = typeof parsed.character === "string" ? parsed.character : "";
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.flatMap((x) => (typeof x === "string" ? [x.trim().toLowerCase()] : [])).filter(Boolean).slice(0, 10)
      : [];
    const relationships = Array.isArray(parsed.relationships)
      ? parsed.relationships.flatMap((r) => {
          if (!r || typeof r !== "object") return [];
          const row = r as { source?: unknown; target?: unknown; word?: unknown };
          const source = typeof row.source === "string" ? row.source.trim() : "";
          const target = typeof row.target === "string" ? row.target.trim() : "";
          const word = typeof row.word === "string" ? row.word.trim() : "";
          return source && target && word ? [{ source, target, word }] : [];
        }).slice(0, 10)
      : [];

    let insertedNode: ActionTreeNode | null = null;
    if (persist) {
      insertedNode = insertActionTreeNode(chatId, {
        character,
        actions,
        dialogue,
        outcome,
        notes,
        manual: true,
        tags,
        relationships
      });
    }

    res.json({
      node: insertedNode,
      draft: { character, actions, dialogue, outcome, notes, tags, relationships },
      meta: {
        chatId,
        windowSize: timeline.length,
        modelId,
        providerId,
        currentTurn,
        generatedAt: now(),
        persisted: persist
      },
      reasoning: result.reasoning || ""
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action tree generation failed";
    res.status(500).json({ error: message });
  }
});

router.post("/:chatId/relationships/generate", async (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const body = req.body || {};
  const windowSize = typeof body.windowSize === "number" && Number.isFinite(body.windowSize)
    ? Math.max(1, Math.min(MANUAL_GENERATE_WINDOW_MAX, Math.floor(body.windowSize)))
    : MANUAL_GENERATE_WINDOW_DEFAULT;
  const persist = body.persist !== false; // default true
  const overrideModelId = typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : null;
  const branchId = typeof body.branchId === "string" && body.branchId.trim() ? body.branchId.trim() : undefined;

  try {
    const settings = getSettings();
    const providerId = settings.activeProviderId;
    const modelId = overrideModelId || settings.activeModel;
    if (!providerId || !modelId) {
      res.status(400).json({ error: "No active provider/model configured" });
      return;
    }
    const provider = db.prepare("SELECT * FROM providers WHERE id = ?").get(providerId) as (ProviderRow & { name?: string }) | undefined;
    if (!provider) {
      res.status(404).json({ error: "Provider not found" });
      return;
    }
    if (settings.fullLocalMode && !isLocalhostUrl(provider.base_url)) {
      res.status(400).json({ error: "Provider blocked by Full Local Mode" });
      return;
    }

    const timeline = getRecentTimelineWindow(chatId, windowSize, branchId);
    if (timeline.length === 0) {
      res.status(400).json({ error: "No messages in chat to analyze" });
      return;
    }

    const chat = db.prepare("SELECT current_turn FROM chats WHERE id = ?").get(chatId) as { current_turn: number | null } | undefined;
    const currentTurn = chat?.current_turn ?? 0;

    const transcript = timeline
      .map((m) => {
        const speaker = m.role === "user" ? "User" : (m.characterName || "Assistant");
        return `${speaker}: ${m.content}`;
      })
      .join("\n\n");

    // Pull the existing relationships list so the model can decide whether to
    // ADD a new descriptor, UPDATE an existing one, or KEEP it. Sending the
    // current state keeps the model from re-emitting stale entries that were
    // already overwritten by a later turn.
    const existingRels = listLatestRelationships(chatId);
    const existingBlock = existingRels.length > 0
      ? "\n\nCurrent known relationships (most-recent descriptor wins; you may overwrite, add, or leave unchanged):\n" +
        existingRels.map((r) => `- ${r.source} → ${r.target}: ${r.word} (turn ${r.turn})`).join("\n")
      : "";

    const systemPrompt = [
      "You are a relationship extractor for a roleplay chat.",
      "Read the recent transcript and output the current state of relationships between named characters.",
      "Output STRICT JSON only — no prose, no markdown fences — matching:",
      "{ \"relationships\": Array<{ \"source\": string, \"target\": string, \"word\": string }> }",
      "Rules:",
      "- source and target MUST be character names that appear in the transcript (or in the current-relationships list).",
      "- word is a 1-3 word descriptor like \"fond of\", \"distrusts\", \"allied with\", \"rivals with\".",
      "- Emit at most 8 entries. Prefer the most salient relationships visible in the window.",
      "- If a relationship from the current list still holds, include it unchanged so it persists.",
      "- If a relationship has clearly changed, replace it with the new descriptor (same source/target).",
      "- Do NOT invent characters that aren't in the transcript or current list."
    ].join("\n");

    const apiMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Transcript (most recent ${timeline.length} messages, turn ${currentTurn}):${existingBlock}\n\n${transcript}\n\nProduce the JSON now.` }
    ];

    const { unifiedGenerateText } = await import("../services/unifiedGeneration.js");
    const result = await unifiedGenerateText({
      provider: {
        id: provider.id,
        name: provider.name || "",
        base_url: provider.base_url,
        api_key_cipher: provider.api_key_cipher,
        provider_type: provider.provider_type,
        adapter_id: provider.adapter_id ?? null
      },
      modelId,
      messages: apiMessages as Array<{ role: string; content: unknown }>,
      samplerConfig: { ...settings.samplerConfig, temperature: 0.4, maxTokens: 600 } as Record<string, unknown>,
      apiParamPolicy: settings.apiParamPolicy,
      signal: undefined as AbortSignal | undefined
    });

    const parsed = safeParseJsonObject(result.content || "") as { relationships?: unknown } | null;
    const relsRaw = parsed?.relationships ?? (Array.isArray(parsed) ? parsed : []);
    const relationships: Array<{ source: string; target: string; word: string }> = Array.isArray(relsRaw)
      ? relsRaw.flatMap((r) => {
          if (!r || typeof r !== "object") return [];
          const row = r as { source?: unknown; target?: unknown; word?: unknown };
          const source = typeof row.source === "string" ? row.source.trim() : "";
          const target = typeof row.target === "string" ? row.target.trim() : "";
          const word = typeof row.word === "string" ? row.word.trim() : "";
          return source && target && word ? [{ source, target, word }] : [];
        }).slice(0, 8)
      : [];

    let insertedRels: Array<{ id: string; source: string; target: string; word: string; turn: number; createdAt: string }> = [];
    if (persist && relationships.length > 0) {
      const turn = currentTurn + 1;
      const createdAt = now();
      const insertRel = db.prepare(
        "INSERT INTO character_relationships (id, chat_id, source_character, target_character, word, turn, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      );
      for (const rel of relationships) {
        const id = newId();
        insertRel.run(id, chatId, rel.source, rel.target, rel.word, turn, createdAt);
        insertedRels.push({ id, source: rel.source, target: rel.target, word: rel.word, turn, createdAt });
      }
    }

    res.json({
      relationships: insertedRels,
      draft: relationships,
      meta: {
        chatId,
        windowSize: timeline.length,
        modelId,
        providerId,
        currentTurn,
        generatedAt: now(),
        persisted: persist
      },
      reasoning: result.reasoning || ""
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Relationships generation failed";
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// What-if simulator: alternative generation without persistence
// ---------------------------------------------------------------------------

router.post("/:chatId/what-if", async (req, res) => {
  const chatId = String(req.params.chatId || "").trim();
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }
  const body = req.body || {};
  const upToMessageId = typeof body.upToMessageId === "string" ? body.upToMessageId : null;
  const alternativeUserContent = typeof body.alternativeUserContent === "string" ? body.alternativeUserContent.trim() : "";

  if (!alternativeUserContent) {
    res.status(400).json({ error: "alternativeUserContent is required" });
    return;
  }

  try {
    // Build the same context as a normal generation, but with the alternative user message
    // substituted in place of the original. We use a simplified payload builder.
    const settings = getSettings();
    const providerId = settings.activeProviderId;
    const modelId = settings.activeModel;

    if (!providerId || !modelId) {
      res.status(400).json({ error: "No active provider/model configured" });
      return;
    }

    const provider = db.prepare("SELECT * FROM providers WHERE id = ?").get(providerId) as (ProviderRow & { name?: string }) | undefined;
    if (!provider) {
      res.status(404).json({ error: "Provider not found" });
      return;
    }
    if (settings.fullLocalMode && !isLocalhostUrl(provider.base_url)) {
      res.status(400).json({ error: "Provider blocked by Full Local Mode" });
      return;
    }

    const chat = db.prepare(
      "SELECT character_id, character_ids, lorebook_id, lorebook_ids, context_summary, current_turn FROM chats WHERE id = ?"
    ).get(chatId) as {
      character_id: string | null;
      character_ids: string | null;
      lorebook_id: string | null;
      lorebook_ids: string | null;
      context_summary: string | null;
      current_turn: number | null;
    } | undefined;
    if (!chat) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }

    // Build timeline up to (but not including) the upToMessageId, then append the alternative user content
    const timeline = getTimeline(chatId, "").filter((m) => m.role === "user" || m.role === "assistant");
    let truncatedTimeline = timeline;
    if (upToMessageId) {
      const idx = timeline.findIndex((m) => m.id === upToMessageId);
      if (idx >= 0) {
        truncatedTimeline = timeline.slice(0, idx);
      }
    }
    const altTimeline = [
      ...truncatedTimeline,
      { role: "user", content: alternativeUserContent, characterName: null as string | null, attachments: [] }
    ];

    const blocks = getPromptBlocks(settings as Record<string, unknown>);
    const sceneState = getSceneState(chatId);
    const authorNote = getAuthorNote(chatId);
    const samplerConfig = getChatSamplerConfig(chatId, settings.samplerConfig);
    const systemBlockContent = String(blocks.find((block) => block.kind === "system")?.content || "").trim();

    let characterIds: string[] = [];
    try {
      characterIds = JSON.parse(chat.character_ids || "[]");
    } catch {
      characterIds = [];
    }
    if (characterIds.length === 0 && chat.character_id) characterIds = [chat.character_id];

    const characterCards = characterIds
      .map((id) => getCharacterCard(id))
      .filter((card): card is NonNullable<typeof card> => card !== null);

    const promptTimelineForModel = altTimeline.map((item) => ({
      role: item.role,
      content: String(item.content || ""),
      characterName: item.characterName,
      attachments: []
    }));

    const currentCharCard = characterCards[0] ?? null;
    const characterSystemPrompt = String(currentCharCard?.systemPrompt || "").trim();
    const resolvedBaseSystemPrompt = systemBlockContent
      || characterSystemPrompt
      || String(settings.defaultSystemPrompt || "").trim();
    const promptCharacterCard = systemBlockContent || !characterSystemPrompt
      ? currentCharCard
      : currentCharCard
        ? { ...currentCharCard, systemPrompt: "" }
        : null;

    const contextSummary = chat.context_summary || "";
    let systemPrompt = resolvedBaseSystemPrompt
      + (contextSummary ? `\n\n[Context Summary]\n${contextSummary}` : "")
      + (authorNote ? `\n\n[Author Note]\n${authorNote}` : "")
      + (sceneState?.mood ? `\n\n[Scene] mood: ${sceneState.mood}; pacing: ${sceneState.pacing}` : "");

    const apiMessages = buildMessageArray(
      systemPrompt,
      promptTimelineForModel,
      authorNote,
      contextSummary,
      promptCharacterCard?.name,
      "User",
      promptCharacterCard?.postHistoryInstructions
    );

    // Use the unifiedGeneration service to do a one-shot non-streaming generation
    const { unifiedGenerateText } = await import("../services/unifiedGeneration.js");
    const result = await unifiedGenerateText({
      provider: {
        id: provider.id,
        name: provider.name || "",
        base_url: provider.base_url,
        api_key_cipher: provider.api_key_cipher,
        provider_type: provider.provider_type,
        adapter_id: provider.adapter_id ?? null
      },
      modelId,
      messages: apiMessages as Array<{ role: string; content: unknown }>,
      samplerConfig: samplerConfig as Record<string, unknown>,
      apiParamPolicy: settings.apiParamPolicy,
      signal: undefined as AbortSignal | undefined
    });

    res.json({
      alternative: result.content || "",
      reasoning: result.reasoning || "",
      meta: {
        chatId,
        upToMessageId,
        originalMessageCount: timeline.length,
        alternativeMessageCount: altTimeline.length
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "What-if generation failed";
    res.status(500).json({ error: message });
  }
});

export default router;
