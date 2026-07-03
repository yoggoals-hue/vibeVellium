// VibeVellium memory system API client
// Talks to /api/memory/* endpoints

import { del, get, patchReq, post, put } from "./core";

export interface ActionTreeNodeDto {
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

export interface ActionTreeConfigDto {
  chatId: string;
  enabled: boolean;
  format: "inline" | "second_call";
  modelId: string | null;
  injectionCount: number;
  updatedAt: string;
}

export interface FutureGuideDto {
  id: string;
  chatId: string;
  title: string;
  guidance: string;
  keyActions: string[];
  targetTurn: number;
  strength: number;
  status: "active" | "reached" | "abandoned";
  createdAt: string;
  reachedAt: string | null;
}

export interface ChatSummaryDto {
  summary: string;
  updatedAt: string | null;
  currentTurn: number;
}

export interface PayloadPreviewDto {
  meta: {
    chatId: string;
    branchId: string | null;
    providerId: string | null;
    modelId: string | null;
    providerType: string | null;
    chatMode: string;
    currentTurn: number;
    generatedAt: string;
    note: string;
  };
  promptStack: {
    blocks: Array<{
      kind: string;
      enabled: boolean;
      order: number;
      contentLength: number;
      contentPreview: string;
    }>;
    systemPrompt: string;
    authorNote: string;
    contextSummary: string;
    triggeredLoreEntries: Array<{ id: string; name: string; keys: string[] }>;
    memoryInjection: {
      actionTreeBlock: string;
      futureGuidanceBlock: string;
    };
  };
  sceneState: {
    mood: string;
    pacing: string;
    intensity: number;
    chatMode: string;
    variables: Record<string, unknown>;
  } | null;
  characters: Array<{
    id: string;
    name: string;
    descriptionPreview: string;
    personalityPreview: string;
    scenarioPreview: string;
    hasSystemPrompt: boolean;
    hasPostHistoryInstructions: boolean;
  }>;
  sampler: Record<string, unknown>;
  messages: Array<{ role: string; contentPreview: string }>;
  messageCount: number;
  timelineWindow: {
    total: number;
    sent: number;
    truncated: boolean;
  };
}

export const memoryClient = {
  // Action Tree
  actionTreeGet: (chatId: string) =>
    get<{ nodes: ActionTreeNodeDto[]; config: ActionTreeConfigDto; currentTurn: number }>(`/memory/${chatId}/action-tree`),
  actionTreeUpdateConfig: (chatId: string, patch: Partial<Pick<ActionTreeConfigDto, "enabled" | "format" | "modelId" | "injectionCount">>) =>
    put<{ config: ActionTreeConfigDto }>(`/memory/${chatId}/action-tree/config`, patch),
  actionTreeAddNode: (chatId: string, body: {
    branchId?: string | null;
    turn?: number;
    character?: string;
    actions?: string[];
    dialogue?: string;
    outcome?: ActionTreeNodeDto["outcome"];
    notes?: string;
  }) =>
    post<{ node: ActionTreeNodeDto }>(`/memory/${chatId}/action-tree/nodes`, body),
  actionTreeUpdateNode: (nodeId: string, patch: Partial<Pick<ActionTreeNodeDto, "character" | "actions" | "dialogue" | "outcome" | "notes" | "turn" | "tags" | "relationships">>) =>
    patchReq<{ node: ActionTreeNodeDto }>(`/memory/action-tree/nodes/${nodeId}`, patch),
  actionTreeDeleteNode: (nodeId: string) =>
    del<{ ok: boolean }>(`/memory/action-tree/nodes/${nodeId}`),

  // Manual AI generation: send the last N (default 15) user+assistant messages
  // to the active provider/model and persist a new action-tree node. Use this
  // when the model doesn't natively emit <action_tree> blocks during replies.
  actionTreeGenerate: (chatId: string, body?: { windowSize?: number; modelId?: string; persist?: boolean }) =>
    post<{
      node: ActionTreeNodeDto | null;
      draft: { character: string; actions: string[]; dialogue: string; outcome: ActionTreeNodeDto["outcome"]; notes: string; tags: string[]; relationships: Array<{ source: string; target: string; word: string }> };
      meta: { chatId: string; windowSize: number; modelId: string; providerId: string; currentTurn: number; generatedAt: string; persisted: boolean };
      reasoning: string;
    }>(`/memory/${chatId}/action-tree/generate`, body || {}, { timeoutMs: 90_000 }),

  // Future Guides
  futureGuidesList: (chatId: string) =>
    get<{ guides: FutureGuideDto[]; currentTurn: number }>(`/memory/${chatId}/future-guides`),
  futureGuideCreate: (chatId: string, body: {
    title: string;
    guidance?: string;
    keyActions?: string[];
    targetTurn: number;
    strength?: number;
  }) =>
    post<{ guide: FutureGuideDto }>(`/memory/${chatId}/future-guides`, body),
  futureGuideUpdate: (guideId: string, patch: Partial<Pick<FutureGuideDto, "title" | "guidance" | "keyActions" | "targetTurn" | "strength" | "status">>) =>
    patchReq<{ guide: FutureGuideDto }>(`/memory/future-guides/${guideId}`, patch),
  futureGuideDelete: (guideId: string) =>
    del<{ ok: boolean }>(`/memory/future-guides/${guideId}`),

  // Chat summary
  summaryGet: (chatId: string) =>
    get<ChatSummaryDto>(`/memory/${chatId}/summary`),
  summaryUpdate: (chatId: string, summary: string) =>
    put<ChatSummaryDto>(`/memory/${chatId}/summary`, { summary }),

  // Payload preview
  payloadPreview: (chatId: string, branchId?: string) =>
    get<PayloadPreviewDto>(`/memory/${chatId}/payload-preview${branchId ? `?branchId=${branchId}` : ""}`, { timeoutMs: 15000 }),

  // Free Will
  freeWillGet: (chatId: string) =>
    get<{ config: FreeWillConfigDto; rolls: FreeWillRollDto[]; currentTurn: number }>(`/memory/${chatId}/free-will`),
  freeWillUpdateConfig: (chatId: string, patch: Partial<Omit<FreeWillConfigDto, "chatId" | "updatedAt">>) =>
    put<{ config: FreeWillConfigDto }>(`/memory/${chatId}/free-will/config`, patch),
  freeWillListRolls: (chatId: string, limit = 20) =>
    get<{ rolls: FreeWillRollDto[] }>(`/memory/${chatId}/free-will/rolls?limit=${limit}`),
  freeWillForceRoll: (chatId: string) =>
    post<{ roll: FreeWillRollResultDto }>(`/memory/${chatId}/free-will/force-roll`),

  // Body State
  bodyStateGet: (chatId: string) =>
    get<{ config: BodyStateConfigDto; meters: BodyStateMeterDto[] }>(`/memory/${chatId}/body-state`),
  bodyStateUpdateConfig: (chatId: string, patch: Partial<Omit<BodyStateConfigDto, "chatId" | "updatedAt">>) =>
    put<{ config: BodyStateConfigDto }>(`/memory/${chatId}/body-state/config`, patch),
  bodyStateSetMeter: (chatId: string, body: { characterId: string; meter: BodyStateMeterDto["meter"]; value: number; locked?: boolean }) =>
    put<{ meter: BodyStateMeterDto }>(`/memory/${chatId}/body-state/meters`, body),

  // Relationships
  relationshipsList: (chatId: string) =>
    get<{ latest: RelationshipDto[]; recent: RelationshipDto[] }>(`/memory/${chatId}/relationships`),

  // Manual AI generation: send the last N (default 15) user+assistant messages
  // to the active provider/model and persist new relationship rows. The model
  // sees the current relationships list so it can carry forward unchanged ones.
  relationshipsGenerate: (chatId: string, body?: { windowSize?: number; modelId?: string; persist?: boolean }) =>
    post<{
      relationships: Array<{ id: string; source: string; target: string; word: string; turn: number; createdAt: string }>;
      draft: Array<{ source: string; target: string; word: string }>;
      meta: { chatId: string; windowSize: number; modelId: string; providerId: string; currentTurn: number; generatedAt: string; persisted: boolean };
      reasoning: string;
    }>(`/memory/${chatId}/relationships/generate`, body || {}, { timeoutMs: 90_000 }),

  // Tags
  tagsForChat: (chatId: string) =>
    get<{ tags: TagDto[] }>(`/memory/${chatId}/tags`),
  tagsAll: () =>
    get<{ tags: TagDto[] }>(`/memory/tags/all`),

  // Search
  searchChats: (query: string) =>
    get<{ results: ChatSearchResultDto[] }>(`/memory/search/chats?q=${encodeURIComponent(query)}`),

  // What-if simulator
  whatIf: (chatId: string, body: { upToMessageId?: string | null; alternativeUserContent: string }) =>
    post<{ alternative: string; reasoning: string; meta: { chatId: string; upToMessageId: string | null; originalMessageCount: number; alternativeMessageCount: number } }>(`/memory/${chatId}/what-if`, body, { timeoutMs: 60_000 })
};

// ----- Free Will DTOs -----

export type FreeWillTier = "no_op" | "biological" | "mood" | "scene" | "weird" | "critical";
export type FreeWillFrequency = "every_turn" | "every_3" | "every_5" | "random_1_in_5";

export interface FreeWillConfigDto {
  chatId: string;
  enabled: boolean;
  intensity: number;
  frequency: FreeWillFrequency;
  autoPause: boolean;
  tiers: Record<FreeWillTier, boolean>;
  updatedAt: string;
}

export interface FreeWillRollDto {
  id: string;
  chatId: string;
  turn: number;
  rollValue: number;
  tier: FreeWillTier;
  prompt: string;
  skipped: boolean;
  createdAt: string;
}

export interface FreeWillRollResultDto {
  rolled: boolean;
  rollValue: number;
  tier: FreeWillTier;
  prompt: string;
  skipped: boolean;
  reason?: string;
}

// ----- Body State DTOs -----

export interface BodyStateConfigDto {
  chatId: string;
  enabled: boolean;
  decayRate: number;
  meters: { hunger: boolean; fatigue: boolean; arousal: boolean };
  injectThresholdLow: number;
  injectThresholdHigh: number;
  updatedAt: string;
}

export interface BodyStateMeterDto {
  id: string;
  chatId: string;
  characterId: string;
  meter: "hunger" | "fatigue" | "arousal";
  value: number;
  locked: boolean;
  updatedAt: string;
}

// ----- Relationships DTOs -----

export interface RelationshipDto {
  id: string;
  chatId: string;
  source: string;
  target: string;
  word: string;
  turn: number;
  createdAt: string;
}

// ----- Tags DTOs -----

export interface TagDto {
  tag: string;
  count: number;
  lastTurn: number | null;
}

// ----- Search DTOs -----

export interface ChatSearchResultDto {
  chatId: string;
  chatTitle: string;
  matchType: "title" | "tag" | "message";
  preview: string;
  turn: number | null;
  createdAt: string;
}
