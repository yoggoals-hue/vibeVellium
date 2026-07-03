// VibeVellium Inspector Panel
// Right-sidebar panel that shows the EXACT payload the server will send to the LLM,
// plus editable memory tiers: KV window info, chat summary, action tree, future guides.
//
// Each section is a collapsible dropdown. Sections default to collapsed so the panel
// doesn't overwhelm the user. Design language matches the existing chat inspector
// (rounded corners, --color-* CSS variables, subtle borders).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../shared/i18n";
import {
  memoryClient,
  type ActionTreeNodeDto,
  type ActionTreeConfigDto,
  type BodyStateConfigDto,
  type BodyStateMeterDto,
  type FreeWillConfigDto,
  type FreeWillFrequency,
  type FreeWillRollDto,
  type FreeWillTier,
  type FutureGuideDto,
  type PayloadPreviewDto,
  type RelationshipDto
} from "../shared/api/memoryClient";

interface InspectorPanelProps {
  open: boolean;
  onClose: () => void;
  chatId: string | null;
  branchId?: string | null;
}

type Outcome = ActionTreeNodeDto["outcome"];
type GuideStatus = FutureGuideDto["status"];

// --------------------------------------------------------------------------
// Collapsible section primitive — each section is a dropdown
// --------------------------------------------------------------------------

function Section({
  title,
  badge,
  defaultOpen = false,
  children
}: {
  title: string;
  badge?: string | number | null;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="inspector-section">
      <button
        type="button"
        className="inspector-section-header"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <div className="inspector-section-header-left">
          <svg
            className={`inspector-section-chevron ${open ? "is-open" : ""}`}
            width="10"
            height="10"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M3 4.5L6 7.5L9 4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="inspector-section-title">{title}</span>
        </div>
        {badge !== undefined && badge !== null && badge !== "" && (
          <span className="inspector-section-badge">{badge}</span>
        )}
      </button>
      {open && <div className="inspector-section-body">{children}</div>}
    </div>
  );
}

// --------------------------------------------------------------------------
// Outcome / status pill
// --------------------------------------------------------------------------

function outcomePill(outcome: Outcome, t: (k: never) => string): string {
  switch (outcome) {
    case "success": return t("actionTree.outcomeSuccess" as never);
    case "partial": return t("actionTree.outcomePartial" as never);
    case "failed": return t("actionTree.outcomeFailed" as never);
    default: return t("actionTree.outcomePending" as never);
  }
}

function statusPill(status: GuideStatus, t: (k: never) => string): string {
  switch (status) {
    case "reached": return t("futureGuides.reached" as never);
    case "abandoned": return t("futureGuides.abandoned" as never);
    default: return t("futureGuides.active" as never);
  }
}

// --------------------------------------------------------------------------
// Sub-components for each memory tier
// --------------------------------------------------------------------------

function MemorySection({ chatId }: { chatId: string }) {
  const { t } = useI18n();
  const [summary, setSummary] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await memoryClient.summaryGet(chatId);
      setSummary(data.summary || "");
      setDraft(data.summary || "");
      setUpdatedAt(data.updatedAt);
      setCurrentTurn(data.currentTurn || 0);
    } catch {
      // ignore
    }
  }, [chatId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const result = await memoryClient.summaryUpdate(chatId, draft);
      setSummary(result.summary);
      setUpdatedAt(result.updatedAt);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    setRegenerating(true);
    try {
      // Calls the existing /api/chats/:id/compress endpoint
      const resp = await fetch(`/api/chats/${chatId}/compress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      if (resp.ok) {
        const data = await resp.json() as { summary?: string };
        if (data.summary) {
          setSummary(data.summary);
          setDraft(data.summary);
          setUpdatedAt(new Date().toISOString());
        }
      }
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="inspector-memory">
      <div className="inspector-info-row">
        <span className="inspector-info-label">{t("memory.currentTurn" as never)}</span>
        <span className="inspector-info-value">{currentTurn}</span>
      </div>

      <div className="inspector-subsection">
        <div className="inspector-subsection-title">{t("memory.kvWindow" as never)}</div>
        <div className="inspector-subsection-desc">{t("memory.kvWindowDesc" as never)}</div>
      </div>

      <div className="inspector-subsection">
        <div className="inspector-subsection-title">{t("memory.summary" as never)}</div>
        <div className="inspector-subsection-desc">{t("memory.summaryDesc" as never)}</div>
        {!editing ? (
          <div className="inspector-summary-display">
            {summary ? (
              <pre className="inspector-summary-text">{summary}</pre>
            ) : (
              <div className="inspector-summary-empty">{t("memory.summaryEmpty" as never)}</div>
            )}
            {updatedAt && (
              <div className="inspector-summary-meta">
                {t("memory.summaryLastUpdated" as never).replace("{time}", new Date(updatedAt).toLocaleString())}
              </div>
            )}
            <div className="inspector-action-row">
              <button className="inspector-btn" onClick={() => setEditing(true)}>{t("memory.save" as never) === "Save" ? "Edit" : "Изменить"}</button>
              <button className="inspector-btn" onClick={regenerate} disabled={regenerating}>
                {regenerating ? t("memory.regenerating" as never) : t("memory.regenerate" as never)}
              </button>
              {summary && (
                <button className="inspector-btn inspector-btn-danger" onClick={() => { setDraft(""); setEditing(true); }}>{t("memory.clear" as never)}</button>
              )}
            </div>
          </div>
        ) : (
          <div className="inspector-summary-edit">
            <textarea
              className="inspector-textarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={8}
              placeholder={t("memory.summaryDesc" as never)}
            />
            <div className="inspector-action-row">
              <button className="inspector-btn inspector-btn-primary" onClick={save} disabled={saving}>{t("memory.save" as never)}</button>
              <button className="inspector-btn" onClick={() => { setDraft(summary); setEditing(false); }} disabled={saving}>{t("memory.cancel" as never)}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionTreeSection({ chatId }: { chatId: string }) {
  const { t } = useI18n();
  const [nodes, setNodes] = useState<ActionTreeNodeDto[]>([]);
  const [config, setConfig] = useState<ActionTreeConfigDto | null>(null);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<ActionTreeNodeDto>>({});
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateInfo, setGenerateInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await memoryClient.actionTreeGet(chatId);
      setNodes(data.nodes);
      setConfig(data.config);
      setCurrentTurn(data.currentTurn || 0);
    } catch {
      // ignore
    }
  }, [chatId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleEnabled() {
    if (!config) return;
    const next = await memoryClient.actionTreeUpdateConfig(chatId, { enabled: !config.enabled });
    setConfig(next.config);
  }

  async function updateConfig<K extends keyof ActionTreeConfigDto>(key: K, value: ActionTreeConfigDto[K]) {
    const next = await memoryClient.actionTreeUpdateConfig(chatId, { [key]: value } as Partial<Pick<ActionTreeConfigDto, "enabled" | "format" | "modelId" | "injectionCount">>);
    setConfig(next.config);
  }

  function startEdit(node: ActionTreeNodeDto) {
    setEditingId(node.id);
    setDraft({
      character: node.character,
      actions: node.actions,
      dialogue: node.dialogue,
      outcome: node.outcome,
      notes: node.notes,
      tags: node.tags,
      relationships: node.relationships,
      turn: node.turn
    });
  }

  async function saveEdit(nodeId: string) {
    if (!draft) return;
    const result = await memoryClient.actionTreeUpdateNode(nodeId, draft);
    setNodes((prev) => prev.map((n) => n.id === nodeId ? result.node : n));
    setEditingId(null);
    setDraft({});
  }

  async function deleteNode(nodeId: string) {
    await memoryClient.actionTreeDeleteNode(nodeId);
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
  }

  async function addManual() {
    const result = await memoryClient.actionTreeAddNode(chatId, {
      turn: currentTurn + 1,
      character: "",
      actions: [],
      dialogue: "",
      outcome: "pending",
      notes: ""
    });
    setNodes((prev) => [...prev, result.node]);
    setEditingId(result.node.id);
    setDraft({
      character: "",
      actions: [],
      dialogue: "",
      outcome: "pending",
      notes: "",
      turn: result.node.turn
    });
  }

  /**
   * Manual AI extraction: send the last 15 user+assistant messages to the
   * active provider/model and persist the resulting action-tree node. This is
   * the user's "Generate from chat (AI)" button — it exists because most
   * models don't natively emit <action_tree> blocks, so the auto-extraction
   * path inside chatOrchestrator was effectively dead for them.
   */
  async function generateFromChat() {
    setGenerating(true);
    setGenerateError(null);
    setGenerateInfo(null);
    try {
      const result = await memoryClient.actionTreeGenerate(chatId, { windowSize: 15 });
      if (result.node) {
        setNodes((prev) => [...prev, result.node as ActionTreeNodeDto]);
        setGenerateInfo(
          `Generated node T${result.node.turn} from last ${result.meta.windowSize} messages via ${result.meta.modelId}.`
        );
      } else {
        setGenerateInfo(`Generated draft (not persisted). ${result.meta.windowSize} messages analyzed.`);
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="inspector-action-tree">
      <div className="inspector-toggle-row">
        <div className="min-w-0">
          <div className="inspector-row-label">{t("actionTree.enable" as never)}</div>
          <div className="inspector-row-desc">{t("actionTree.desc" as never)}</div>
        </div>
        <button
          type="button"
          className={`inspector-switch ${config?.enabled ? "is-on" : ""}`}
          onClick={toggleEnabled}
          aria-pressed={config?.enabled === true}
        >
          <span className="inspector-switch-knob" />
        </button>
      </div>

      {config?.enabled && (
        <>
          <div className="inspector-form-row">
            <label className="inspector-form-label">{t("actionTree.format" as never)}</label>
            <select
              className="inspector-select"
              value={config.format}
              onChange={(e) => updateConfig("format", e.target.value as ActionTreeConfigDto["format"])}
            >
              <option value="inline">{t("actionTree.formatInline" as never)}</option>
              <option value="second_call">{t("actionTree.formatSecondCall" as never)}</option>
            </select>
          </div>

          <div className="inspector-form-row">
            <label className="inspector-form-label">{t("actionTree.injectionCount" as never)}</label>
            <input
              type="number"
              min={1}
              max={50}
              className="inspector-input"
              value={config.injectionCount}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isInteger(v) && v >= 1 && v <= 50) void updateConfig("injectionCount", v);
              }}
            />
            <div className="inspector-form-hint">{t("actionTree.injectionCountDesc" as never)}</div>
          </div>

          <div className="inspector-action-row">
            <button className="inspector-btn inspector-btn-primary" onClick={addManual}>{t("actionTree.addManual" as never)}</button>
            <button
              className="inspector-btn"
              onClick={() => void generateFromChat()}
              disabled={generating}
              title="Send the last 15 user + assistant messages to the AI and persist a new action-tree node from the JSON it returns."
            >
              {generating ? "Generating…" : "Generate from chat (AI)"}
            </button>
          </div>
          {generateInfo && (
            <div className="inspector-form-hint" style={{ color: "var(--color-success, #16a34a)" }}>{generateInfo}</div>
          )}
          {generateError && (
            <div className="inspector-form-hint" style={{ color: "var(--color-danger, #dc2626)" }}>
              Generation failed: {generateError}
            </div>
          )}

          {nodes.length === 0 ? (
            <div className="inspector-empty">{t("actionTree.empty" as never)}</div>
          ) : (
            <div className="inspector-tree-list">
              {nodes.map((node) => (
                <div key={node.id} className={`inspector-tree-node ${node.manual ? "is-manual" : ""}`}>
                  {editingId === node.id ? (
                    <div className="inspector-tree-edit">
                      <div className="inspector-tree-edit-row">
                        <span className="inspector-tree-turn">T{node.turn}</span>
                        <input
                          className="inspector-input"
                          placeholder={t("actionTree.character" as never)}
                          value={draft.character || ""}
                          onChange={(e) => setDraft((d) => ({ ...d, character: e.target.value }))}
                        />
                      </div>
                      <textarea
                        className="inspector-textarea"
                        rows={2}
                        placeholder={t("actionTree.actions" as never) + " (one per line)"}
                        value={(draft.actions || []).join("\n")}
                        onChange={(e) => setDraft((d) => ({ ...d, actions: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) }))}
                      />
                      <input
                        className="inspector-input"
                        placeholder={t("actionTree.dialogue" as never)}
                        value={draft.dialogue || ""}
                        onChange={(e) => setDraft((d) => ({ ...d, dialogue: e.target.value }))}
                      />
                      <select
                        className="inspector-select"
                        value={draft.outcome || "pending"}
                        onChange={(e) => setDraft((d) => ({ ...d, outcome: e.target.value as Outcome }))}
                      >
                        <option value="pending">{t("actionTree.outcomePending" as never)}</option>
                        <option value="success">{t("actionTree.outcomeSuccess" as never)}</option>
                        <option value="partial">{t("actionTree.outcomePartial" as never)}</option>
                        <option value="failed">{t("actionTree.outcomeFailed" as never)}</option>
                      </select>
                      <input
                        className="inspector-input"
                        placeholder={t("actionTree.notes" as never)}
                        value={draft.notes || ""}
                        onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                      />
                      <input
                        className="inspector-input"
                        placeholder={t("actionTree.tagsPlaceholder" as never)}
                        value={(draft.tags || []).join(", ")}
                        onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))}
                      />
                      <textarea
                        className="inspector-textarea"
                        rows={2}
                        placeholder={t("actionTree.relationshipsPlaceholder" as never)}
                        value={(draft.relationships || []).map((r) => `${r.source}→${r.target}:${r.word}`).join("\n")}
                        onChange={(e) => setDraft((d) => ({
                          ...d,
                          relationships: e.target.value.split("\n").map((line) => {
                            const m = line.match(/^([^→:]+)→([^→:]+):(.+)$/);
                            if (!m) return null;
                            return { source: m[1].trim(), target: m[2].trim(), word: m[3].trim() };
                          }).filter((r): r is { source: string; target: string; word: string } => r !== null && Boolean(r.source) && Boolean(r.target) && Boolean(r.word))
                        }))}
                      />
                      <div className="inspector-action-row">
                        <button className="inspector-btn inspector-btn-primary" onClick={() => saveEdit(node.id)}>{t("actionTree.save" as never)}</button>
                        <button className="inspector-btn" onClick={() => { setEditingId(null); setDraft({}); }}>{t("actionTree.cancel" as never)}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="inspector-tree-view">
                      <div className="inspector-tree-view-header">
                        <span className="inspector-tree-turn">T{node.turn}</span>
                        <span className="inspector-tree-character">{node.character || "?"}</span>
                        <span className={`inspector-tree-outcome is-${node.outcome}`}>{outcomePill(node.outcome, t)}</span>
                        {node.manual && <span className="inspector-tree-manual">M</span>}
                      </div>
                      {node.actions.length > 0 && (
                        <div className="inspector-tree-actions">{node.actions.join(" · ")}</div>
                      )}
                      {node.dialogue && (
                        <div className="inspector-tree-dialogue">"{node.dialogue}"</div>
                      )}
                      {node.relationships.length > 0 && (
                        <div className="inspector-tree-relationships">
                          {node.relationships.map((rel, i) => (
                            <span key={i} className="inspector-tree-rel-chip">
                              {rel.source} → {rel.target}: <strong>{rel.word}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                      {node.tags.length > 0 && (
                        <div className="inspector-tree-tags">
                          {node.tags.map((tag, i) => (
                            <span key={i} className="inspector-tree-tag-chip">#{tag}</span>
                          ))}
                        </div>
                      )}
                      {node.notes && (
                        <div className="inspector-tree-notes">{node.notes}</div>
                      )}
                      <div className="inspector-action-row">
                        <button className="inspector-btn" onClick={() => startEdit(node)}>{t("actionTree.edit" as never)}</button>
                        <button className="inspector-btn inspector-btn-danger" onClick={() => deleteNode(node.id)}>{t("actionTree.delete" as never)}</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FutureGuidesSection({ chatId }: { chatId: string }) {
  const { t } = useI18n();
  const [guides, setGuides] = useState<FutureGuideDto[]>([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    title: string;
    guidance: string;
    keyActions: string;
    targetTurn: number;
    strength: number;
  }>({ title: "", guidance: "", keyActions: "", targetTurn: 20, strength: 0.5 });

  const load = useCallback(async () => {
    try {
      const data = await memoryClient.futureGuidesList(chatId);
      setGuides(data.guides);
      setCurrentTurn(data.currentTurn || 0);
    } catch {
      // ignore
    }
  }, [chatId]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetDraft() {
    setDraft({ title: "", guidance: "", keyActions: "", targetTurn: currentTurn + 20, strength: 0.5 });
  }

  async function createGuide() {
    if (!draft.title.trim()) return;
    const result = await memoryClient.futureGuideCreate(chatId, {
      title: draft.title.trim(),
      guidance: draft.guidance,
      keyActions: draft.keyActions.split("\n").map((s) => s.trim()).filter(Boolean),
      targetTurn: draft.targetTurn,
      strength: draft.strength
    });
    setGuides((prev) => [...prev, result.guide]);
    setCreating(false);
    resetDraft();
  }

  async function saveEdit(guideId: string) {
    const result = await memoryClient.futureGuideUpdate(guideId, {
      title: draft.title,
      guidance: draft.guidance,
      keyActions: draft.keyActions.split("\n").map((s) => s.trim()).filter(Boolean),
      targetTurn: draft.targetTurn,
      strength: draft.strength
    });
    setGuides((prev) => prev.map((g) => g.id === guideId ? result.guide : g));
    setEditingId(null);
  }

  async function setStatus(guideId: string, status: GuideStatus) {
    const result = await memoryClient.futureGuideUpdate(guideId, { status });
    setGuides((prev) => prev.map((g) => g.id === guideId ? result.guide : g));
  }

  async function deleteGuide(guideId: string) {
    await memoryClient.futureGuideDelete(guideId);
    setGuides((prev) => prev.filter((g) => g.id !== guideId));
  }

  function startEdit(g: FutureGuideDto) {
    setEditingId(g.id);
    setDraft({
      title: g.title,
      guidance: g.guidance,
      keyActions: g.keyActions.join("\n"),
      targetTurn: g.targetTurn,
      strength: g.strength
    });
  }

  const active = guides.filter((g) => g.status === "active");
  const reached = guides.filter((g) => g.status === "reached");
  const abandoned = guides.filter((g) => g.status === "abandoned");

  function renderGuide(g: FutureGuideDto) {
    const turnsRemaining = g.targetTurn - currentTurn;
    const progress = g.targetTurn > 0 ? Math.min(1, currentTurn / g.targetTurn) : 1;
    const urgency = progress * g.strength;
    const urgencyLabel = urgency > 0.75 ? t("futureGuides.urgencyUrgent" as never) : urgency > 0.5 ? t("futureGuides.urgencyRising" as never) : t("futureGuides.urgencyLow" as never);

    if (editingId === g.id) {
      return (
        <div key={g.id} className="inspector-guide-edit">
          <input
            className="inspector-input"
            placeholder={t("futureGuides.title_field" as never)}
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
          <textarea
            className="inspector-textarea"
            rows={3}
            placeholder={t("futureGuides.guidance" as never)}
            value={draft.guidance}
            onChange={(e) => setDraft((d) => ({ ...d, guidance: e.target.value }))}
          />
          <textarea
            className="inspector-textarea"
            rows={3}
            placeholder={t("futureGuides.keyActions" as never)}
            value={draft.keyActions}
            onChange={(e) => setDraft((d) => ({ ...d, keyActions: e.target.value }))}
          />
          <div className="inspector-form-row">
            <label className="inspector-form-label">{t("futureGuides.targetTurn" as never)}</label>
            <input
              type="number"
              min={1}
              className="inspector-input"
              value={draft.targetTurn}
              onChange={(e) => setDraft((d) => ({ ...d, targetTurn: Math.max(1, Number(e.target.value) || 1) }))}
            />
          </div>
          <div className="inspector-form-row">
            <label className="inspector-form-label">{t("futureGuides.strength" as never)} ({draft.strength.toFixed(2)})</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              className="inspector-range"
              value={draft.strength}
              onChange={(e) => setDraft((d) => ({ ...d, strength: Number(e.target.value) }))}
            />
            <div className="inspector-form-hint">
              {t("futureGuides.strengthLow" as never)} ··· {t("futureGuides.strengthHigh" as never)}
            </div>
          </div>
          <div className="inspector-action-row">
            <button className="inspector-btn inspector-btn-primary" onClick={() => saveEdit(g.id)}>{t("futureGuides.save" as never)}</button>
            <button className="inspector-btn" onClick={() => setEditingId(null)}>{t("futureGuides.cancel" as never)}</button>
          </div>
        </div>
      );
    }

    return (
      <div key={g.id} className={`inspector-guide is-${g.status}`}>
        <div className="inspector-guide-header">
          <span className="inspector-guide-title">{g.title}</span>
          <span className={`inspector-guide-status is-${g.status}`}>{statusPill(g.status, t)}</span>
        </div>
        {g.guidance && <div className="inspector-guide-text">{g.guidance}</div>}
        {g.keyActions.length > 0 && (
          <div className="inspector-guide-actions">
            {g.keyActions.map((action, i) => (
              <span key={i} className="inspector-guide-action-chip">{action}</span>
            ))}
          </div>
        )}
        <div className="inspector-guide-meta">
          <span>→ T{g.targetTurn}</span>
          {g.status === "active" && (
            <>
              <span>·</span>
              <span>{turnsRemaining > 0 ? t("futureGuides.turnsRemaining" as never).replace("{n}", String(turnsRemaining)) : t("futureGuides.overdue" as never).replace("{n}", String(Math.abs(turnsRemaining)))}</span>
              <span>·</span>
              <span className={`inspector-guide-urgency is-${urgency > 0.75 ? "urgent" : urgency > 0.5 ? "rising" : "low"}`}>{urgencyLabel}</span>
            </>
          )}
          <span>·</span>
          <span>str {g.strength.toFixed(2)}</span>
        </div>
        <div className="inspector-action-row">
          <button className="inspector-btn" onClick={() => startEdit(g)}>{t("actionTree.edit" as never)}</button>
          {g.status === "active" && (
            <>
              <button className="inspector-btn" onClick={() => setStatus(g.id, "reached")}>{t("futureGuides.markReached" as never)}</button>
              <button className="inspector-btn" onClick={() => setStatus(g.id, "abandoned")}>{t("futureGuides.markAbandoned" as never)}</button>
            </>
          )}
          {g.status !== "active" && (
            <button className="inspector-btn" onClick={() => setStatus(g.id, "active")}>{t("futureGuides.reactivate" as never)}</button>
          )}
          <button className="inspector-btn inspector-btn-danger" onClick={() => deleteGuide(g.id)}>{t("futureGuides.delete" as never)}</button>
        </div>
      </div>
    );
  }

  function renderCreateForm() {
    if (!creating) return null;
    return (
      <div className="inspector-guide-edit">
        <input
          className="inspector-input"
          placeholder={t("futureGuides.title_field" as never)}
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        />
        <textarea
          className="inspector-textarea"
          rows={3}
          placeholder={t("futureGuides.guidance" as never)}
          value={draft.guidance}
          onChange={(e) => setDraft((d) => ({ ...d, guidance: e.target.value }))}
        />
        <textarea
          className="inspector-textarea"
          rows={3}
          placeholder={t("futureGuides.keyActions" as never)}
          value={draft.keyActions}
          onChange={(e) => setDraft((d) => ({ ...d, keyActions: e.target.value }))}
        />
        <div className="inspector-form-row">
          <label className="inspector-form-label">{t("futureGuides.targetTurn" as never)}</label>
          <input
            type="number"
            min={1}
            className="inspector-input"
            value={draft.targetTurn}
            onChange={(e) => setDraft((d) => ({ ...d, targetTurn: Math.max(1, Number(e.target.value) || 1) }))}
          />
          <div className="inspector-form-hint">{t("futureGuides.targetTurnHint" as never)}</div>
        </div>
        <div className="inspector-form-row">
          <label className="inspector-form-label">{t("futureGuides.strength" as never)} ({draft.strength.toFixed(2)})</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            className="inspector-range"
            value={draft.strength}
            onChange={(e) => setDraft((d) => ({ ...d, strength: Number(e.target.value) }))}
          />
        </div>
        <div className="inspector-action-row">
          <button className="inspector-btn inspector-btn-primary" onClick={createGuide}>{t("futureGuides.save" as never)}</button>
          <button className="inspector-btn" onClick={() => { setCreating(false); resetDraft(); }}>{t("futureGuides.cancel" as never)}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="inspector-future-guides">
      <div className="inspector-subsection-desc">{t("futureGuides.desc" as never)}</div>

      {!creating && (
        <div className="inspector-action-row">
          <button className="inspector-btn inspector-btn-primary" onClick={() => { resetDraft(); setCreating(true); }}>{t("futureGuides.add" as never)}</button>
        </div>
      )}

      {renderCreateForm()}

      {guides.length === 0 && !creating && (
        <div className="inspector-empty">{t("futureGuides.empty" as never)}</div>
      )}

      {active.length > 0 && (
        <div className="inspector-guide-group">
          <div className="inspector-guide-group-label">{t("futureGuides.active" as never)} ({active.length})</div>
          {active.map(renderGuide)}
        </div>
      )}
      {reached.length > 0 && (
        <div className="inspector-guide-group">
          <div className="inspector-guide-group-label">{t("futureGuides.reached" as never)} ({reached.length})</div>
          {reached.map(renderGuide)}
        </div>
      )}
      {abandoned.length > 0 && (
        <div className="inspector-guide-group">
          <div className="inspector-guide-group-label">{t("futureGuides.abandoned" as never)} ({abandoned.length})</div>
          {abandoned.map(renderGuide)}
        </div>
      )}
    </div>
  );
}

function PayloadPreviewSection({ chatId, branchId }: { chatId: string; branchId?: string | null }) {
  const { t } = useI18n();
  const [payload, setPayload] = useState<PayloadPreviewDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await memoryClient.payloadPreview(chatId, branchId || undefined);
      setPayload(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payload");
    } finally {
      setLoading(false);
    }
  }, [chatId, branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyJson() {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  if (loading) return <div className="inspector-empty">Loading...</div>;
  if (error) return <div className="inspector-empty inspector-empty-error">{error}</div>;
  if (!payload) return <div className="inspector-empty">—</div>;

  return (
    <div className="inspector-payload">
      <div className="inspector-info-grid">
        <div className="inspector-info-row">
          <span className="inspector-info-label">Mode</span>
          <span className="inspector-info-value">{payload.meta.chatMode}</span>
        </div>
        <div className="inspector-info-row">
          <span className="inspector-info-label">Turn</span>
          <span className="inspector-info-value">{payload.meta.currentTurn}</span>
        </div>
        <div className="inspector-info-row">
          <span className="inspector-info-label">Messages</span>
          <span className="inspector-info-value">{payload.messageCount} ({payload.timelineWindow.sent}/{payload.timelineWindow.total}{payload.timelineWindow.truncated ? " ⚡" : ""})</span>
        </div>
        {payload.meta.providerId && (
          <div className="inspector-info-row">
            <span className="inspector-info-label">Provider</span>
            <span className="inspector-info-value">{payload.meta.providerType || "?"}</span>
          </div>
        )}
        {payload.meta.modelId && (
          <div className="inspector-info-row">
            <span className="inspector-info-label">Model</span>
            <span className="inspector-info-value truncate">{payload.meta.modelId}</span>
          </div>
        )}
      </div>

      {payload.promptStack.memoryInjection.actionTreeBlock && (
        <div className="inspector-payload-block">
          <div className="inspector-payload-block-label">[ACTION TREE]</div>
          <pre className="inspector-payload-block-text">{payload.promptStack.memoryInjection.actionTreeBlock}</pre>
        </div>
      )}
      {payload.promptStack.memoryInjection.futureGuidanceBlock && (
        <div className="inspector-payload-block">
          <div className="inspector-payload-block-label">[FUTURE GUIDANCE]</div>
          <pre className="inspector-payload-block-text">{payload.promptStack.memoryInjection.futureGuidanceBlock}</pre>
        </div>
      )}

      <div className="inspector-payload-block">
        <div className="inspector-payload-block-label">[SYSTEM PROMPT]</div>
        <pre className="inspector-payload-block-text">{payload.promptStack.systemPrompt || "(empty)"}</pre>
      </div>

      <div className="inspector-payload-block">
        <div className="inspector-payload-block-label">[MESSAGES — {payload.messageCount}]</div>
        <div className="inspector-payload-messages">
          {payload.messages.map((msg, i) => (
            <div key={i} className="inspector-payload-message">
              <span className="inspector-payload-message-role">{msg.role}</span>
              <span className="inspector-payload-message-content">{msg.contentPreview}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="inspector-action-row">
        <button className="inspector-btn inspector-btn-primary" onClick={copyJson}>
          {copied ? t("inspector.copied" as never) : t("inspector.copyJson" as never)}
        </button>
        <button className="inspector-btn" onClick={load}>{t("inspector.refresh" as never)}</button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Free Will section
// --------------------------------------------------------------------------

const TIER_LABELS: Record<FreeWillTier, string> = {
  no_op: "No-op",
  biological: "Biological",
  mood: "Mood",
  scene: "Scene",
  weird: "Weird",
  critical: "Critical"
};

const TIER_COLORS: Record<FreeWillTier, string> = {
  no_op: "is-no_op",
  biological: "is-biological",
  mood: "is-mood",
  scene: "is-scene",
  weird: "is-weird",
  critical: "is-critical"
};

function FreeWillSection({ chatId }: { chatId: string }) {
  const { t } = useI18n();
  const [config, setConfig] = useState<FreeWillConfigDto | null>(null);
  const [rolls, setRolls] = useState<FreeWillRollDto[]>([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [forceRolling, setForceRolling] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await memoryClient.freeWillGet(chatId);
      setConfig(data.config);
      setRolls(data.rolls);
      setCurrentTurn(data.currentTurn || 0);
    } catch {
      // ignore
    }
  }, [chatId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleEnabled() {
    if (!config) return;
    const result = await memoryClient.freeWillUpdateConfig(chatId, { enabled: !config.enabled });
    setConfig(result.config);
  }

  async function updateField<K extends keyof FreeWillConfigDto>(key: K, value: FreeWillConfigDto[K]) {
    if (!config) return;
    const result = await memoryClient.freeWillUpdateConfig(chatId, { [key]: value } as Partial<Omit<FreeWillConfigDto, "chatId" | "updatedAt">>);
    setConfig(result.config);
  }

  async function toggleTier(tier: FreeWillTier) {
    if (!config) return;
    const nextTiers = { ...config.tiers, [tier]: !config.tiers[tier] };
    const result = await memoryClient.freeWillUpdateConfig(chatId, { tiers: nextTiers });
    setConfig(result.config);
  }

  async function forceRoll() {
    setForceRolling(true);
    try {
      const result = await memoryClient.freeWillForceRoll(chatId);
      // Reload rolls to get the new entry
      void load();
      return result.roll;
    } finally {
      setForceRolling(false);
    }
  }

  if (!config) return <div className="inspector-empty">Loading...</div>;

  const enabledTiers = Object.entries(config.tiers).filter(([_, v]) => v).length;
  const recentFired = rolls.filter((r) => !r.skipped).slice(0, 5);

  return (
    <div className="inspector-free-will">
      <div className="inspector-toggle-row">
        <div className="min-w-0">
          <div className="inspector-row-label">{t("freeWill.title" as never)}</div>
          <div className="inspector-row-desc">{t("freeWill.desc" as never)}</div>
        </div>
        <button
          type="button"
          className={`inspector-switch ${config.enabled ? "is-on" : ""}`}
          onClick={toggleEnabled}
          aria-pressed={config.enabled}
        >
          <span className="inspector-switch-knob" />
        </button>
      </div>

      {config.enabled && (
        <>
          <div className="inspector-form-row">
            <label className="inspector-form-label">
              {t("freeWill.intensity" as never)} ({config.intensity}%)
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              className="inspector-range"
              value={config.intensity}
              onChange={(e) => updateField("intensity", Number(e.target.value))}
            />
            <div className="inspector-form-hint">
              {t("freeWill.intensityHint" as never)}
            </div>
          </div>

          <div className="inspector-form-row">
            <label className="inspector-form-label">{t("freeWill.frequency" as never)}</label>
            <select
              className="inspector-select"
              value={config.frequency}
              onChange={(e) => updateField("frequency", e.target.value as FreeWillFrequency)}
            >
              <option value="every_turn">{t("freeWill.frequencyEveryTurn" as never)}</option>
              <option value="every_3">{t("freeWill.frequencyEvery3" as never)}</option>
              <option value="every_5">{t("freeWill.frequencyEvery5" as never)}</option>
              <option value="random_1_in_5">{t("freeWill.frequencyRandom" as never)}</option>
            </select>
          </div>

          <div className="inspector-toggle-row">
            <div className="min-w-0">
              <div className="inspector-row-label">{t("freeWill.autoPause" as never)}</div>
              <div className="inspector-row-desc">{t("freeWill.autoPauseDesc" as never)}</div>
            </div>
            <button
              type="button"
              className={`inspector-switch ${config.autoPause ? "is-on" : ""}`}
              onClick={() => updateField("autoPause", !config.autoPause)}
              aria-pressed={config.autoPause}
            >
              <span className="inspector-switch-knob" />
            </button>
          </div>

          <div className="inspector-subsection">
            <div className="inspector-subsection-title">{t("freeWill.tiers" as never)} ({enabledTiers}/6)</div>
            <div className="inspector-tier-grid">
              {(Object.keys(config.tiers) as FreeWillTier[]).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  className={`inspector-tier-toggle ${TIER_COLORS[tier]} ${config.tiers[tier] ? "is-on" : ""}`}
                  onClick={() => toggleTier(tier)}
                  title={t(("freeWill.tier_" + tier) as never)}
                >
                  <span className="inspector-tier-name">{TIER_LABELS[tier]}</span>
                  <span className="inspector-tier-range">
                    {tier === "no_op" ? "0-20" : tier === "biological" ? "21-40" : tier === "mood" ? "41-60" : tier === "scene" ? "61-80" : tier === "weird" ? "81-95" : "96-100"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="inspector-action-row">
            <button className="inspector-btn inspector-btn-primary" onClick={forceRoll} disabled={forceRolling}>
              {forceRolling ? "..." : t("freeWill.forceRoll" as never)}
            </button>
          </div>

          {recentFired.length > 0 && (
            <div className="inspector-subsection">
              <div className="inspector-subsection-title">{t("freeWill.recentRolls" as never)}</div>
              <div className="inspector-rolls-list">
                {recentFired.map((roll) => (
                  <div key={roll.id} className={`inspector-roll-item ${TIER_COLORS[roll.tier]}`}>
                    <span className="inspector-roll-turn">T{roll.turn}</span>
                    <span className={`inspector-roll-tier ${TIER_COLORS[roll.tier]}`}>{TIER_LABELS[roll.tier]}</span>
                    <span className="inspector-roll-value">{roll.rollValue}/100</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="inspector-info-row">
            <span className="inspector-info-label">{t("memory.currentTurnShort" as never)}</span>
            <span className="inspector-info-value">{currentTurn}</span>
          </div>
        </>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Body State section
// --------------------------------------------------------------------------

const METER_LABELS: Record<BodyStateMeterDto["meter"], string> = {
  hunger: "Hunger",
  fatigue: "Fatigue",
  arousal: "Arousal"
};

function BodyStateSection({ chatId }: { chatId: string }) {
  const { t } = useI18n();
  const [config, setConfig] = useState<BodyStateConfigDto | null>(null);
  const [meters, setMeters] = useState<BodyStateMeterDto[]>([]);
  const [editingValues, setEditingValues] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const data = await memoryClient.bodyStateGet(chatId);
      setConfig(data.config);
      setMeters(data.meters);
      const initialEdits: Record<string, number> = {};
      for (const m of data.meters) {
        initialEdits[`${m.characterId}:${m.meter}`] = m.value;
      }
      setEditingValues(initialEdits);
    } catch {
      // ignore
    }
  }, [chatId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleEnabled() {
    if (!config) return;
    const result = await memoryClient.bodyStateUpdateConfig(chatId, { enabled: !config.enabled });
    setConfig(result.config);
  }

  async function updateConfig<K extends keyof BodyStateConfigDto>(key: K, value: BodyStateConfigDto[K]) {
    if (!config) return;
    const result = await memoryClient.bodyStateUpdateConfig(chatId, { [key]: value } as Partial<Omit<BodyStateConfigDto, "chatId" | "updatedAt">>);
    setConfig(result.config);
  }

  async function toggleMeter(meter: BodyStateMeterDto["meter"]) {
    if (!config) return;
    const next = { ...config.meters, [meter]: !config.meters[meter] };
    const result = await memoryClient.bodyStateUpdateConfig(chatId, { meters: next });
    setConfig(result.config);
  }

  async function saveMeter(m: BodyStateMeterDto) {
    const newValue = editingValues[`${m.characterId}:${m.meter}`];
    if (newValue === undefined) return;
    const result = await memoryClient.bodyStateSetMeter(chatId, {
      characterId: m.characterId,
      meter: m.meter,
      value: newValue,
      locked: m.locked
    });
    setMeters((prev) => prev.map((x) => x.id === result.meter.id ? result.meter : x));
  }

  async function toggleLock(m: BodyStateMeterDto) {
    const result = await memoryClient.bodyStateSetMeter(chatId, {
      characterId: m.characterId,
      meter: m.meter,
      value: m.value,
      locked: !m.locked
    });
    setMeters((prev) => prev.map((x) => x.id === result.meter.id ? result.meter : x));
  }

  if (!config) return <div className="inspector-empty">Loading...</div>;

  // Group meters by character
  const metersByChar = meters.reduce<Record<string, BodyStateMeterDto[]>>((acc, m) => {
    if (!acc[m.characterId]) acc[m.characterId] = [];
    acc[m.characterId].push(m);
    return acc;
  }, {});

  return (
    <div className="inspector-body-state">
      <div className="inspector-toggle-row">
        <div className="min-w-0">
          <div className="inspector-row-label">{t("bodyState.title" as never)}</div>
          <div className="inspector-row-desc">{t("bodyState.desc" as never)}</div>
        </div>
        <button
          type="button"
          className={`inspector-switch ${config.enabled ? "is-on" : ""}`}
          onClick={toggleEnabled}
          aria-pressed={config.enabled}
        >
          <span className="inspector-switch-knob" />
        </button>
      </div>

      {config.enabled && (
        <>
          <div className="inspector-form-row">
            <label className="inspector-form-label">{t("bodyState.decayRate" as never)} ({config.decayRate})</label>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              className="inspector-range"
              value={config.decayRate}
              onChange={(e) => updateConfig("decayRate", Number(e.target.value))}
            />
            <div className="inspector-form-hint">{t("bodyState.decayRateDesc" as never)}</div>
          </div>

          <div className="inspector-subsection">
            <div className="inspector-subsection-title">{t("bodyState.meters" as never)}</div>
            <div className="inspector-meter-toggles">
              {(Object.keys(config.meters) as BodyStateMeterDto["meter"][]).map((meter) => (
                <button
                  key={meter}
                  type="button"
                  className={`inspector-meter-toggle ${config.meters[meter] ? "is-on" : ""}`}
                  onClick={() => toggleMeter(meter)}
                >
                  {METER_LABELS[meter]}
                </button>
              ))}
            </div>
          </div>

          {Object.keys(metersByChar).length === 0 ? (
            <div className="inspector-empty">{t("bodyState.noMeters" as never)}</div>
          ) : (
            <div className="inspector-meters-list">
              {Object.entries(metersByChar).map(([charId, charMeters]) => (
                <div key={charId} className="inspector-meter-group">
                  <div className="inspector-meter-group-label">{charId.slice(0, 8)}</div>
                  {charMeters.map((m) => {
                    const key = `${m.characterId}:${m.meter}`;
                    const value = editingValues[key] ?? m.value;
                    const isLow = value <= config.injectThresholdLow;
                    const isHigh = value >= config.injectThresholdHigh;
                    return (
                      <div key={m.id} className="inspector-meter-row">
                        <div className="inspector-meter-row-header">
                          <span className="inspector-meter-name">{METER_LABELS[m.meter]}</span>
                          <span className={`inspector-meter-value ${isLow ? "is-low" : isHigh ? "is-high" : ""}`}>{value}</span>
                          <button
                            type="button"
                            className={`inspector-meter-lock ${m.locked ? "is-on" : ""}`}
                            onClick={() => toggleLock(m)}
                            title={m.locked ? "Locked (no decay)" : "Unlocked"}
                          >
                            {m.locked ? "🔒" : "🔓"}
                          </button>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          className="inspector-range"
                          value={value}
                          onChange={(e) => setEditingValues((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                        />
                        {value !== m.value && (
                          <button className="inspector-btn inspector-btn-primary" onClick={() => saveMeter(m)}>
                            Save
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Relationships section
// --------------------------------------------------------------------------

function RelationshipsSection({ chatId }: { chatId: string }) {
  const { t } = useI18n();
  const [latest, setLatest] = useState<RelationshipDto[]>([]);
  const [recent, setRecent] = useState<RelationshipDto[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateInfo, setGenerateInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await memoryClient.relationshipsList(chatId);
      setLatest(data.latest);
      setRecent(data.recent);
    } catch {
      // ignore
    }
  }, [chatId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Manual AI extraction: send the last 15 user+assistant messages to the
   * active provider/model and persist the resulting relationship rows. The
   * model sees the current relationships list so it can carry forward
   * unchanged ones and overwrite changed ones in a single pass.
   */
  async function generateFromChat() {
    setGenerating(true);
    setGenerateError(null);
    setGenerateInfo(null);
    try {
      const result = await memoryClient.relationshipsGenerate(chatId, { windowSize: 15 });
      if (result.relationships.length > 0) {
        setGenerateInfo(
          `Generated ${result.relationships.length} relationship(s) from last ${result.meta.windowSize} messages via ${result.meta.modelId}.`
        );
        await load(); // refresh both latest + recent
      } else {
        setGenerateInfo("Model returned no relationships from the recent transcript.");
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  if (latest.length === 0 && recent.length === 0 && !generating) {
    return (
      <div className="inspector-relationships">
        <div className="inspector-empty">{t("relationships.empty" as never)}</div>
        <div className="inspector-action-row" style={{ marginTop: 8 }}>
          <button
            className="inspector-btn"
            onClick={() => void generateFromChat()}
            disabled={generating}
            title="Send the last 15 user + assistant messages to the AI and persist the relationships JSON it returns."
          >
            {generating ? "Generating…" : "Generate from chat (AI)"}
          </button>
        </div>
        {generateError && (
          <div className="inspector-form-hint" style={{ color: "var(--color-danger, #dc2626)" }}>
            Generation failed: {generateError}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="inspector-relationships">
      <div className="inspector-subsection-desc">{t("relationships.desc" as never)}</div>

      <div className="inspector-action-row" style={{ marginBottom: 8 }}>
        <button
          className="inspector-btn"
          onClick={() => void generateFromChat()}
          disabled={generating}
          title="Send the last 15 user + assistant messages to the AI and persist the relationships JSON it returns."
        >
          {generating ? "Generating…" : "Generate from chat (AI)"}
        </button>
      </div>
      {generateInfo && (
        <div className="inspector-form-hint" style={{ color: "var(--color-success, #16a34a)", marginBottom: 8 }}>{generateInfo}</div>
      )}
      {generateError && (
        <div className="inspector-form-hint" style={{ color: "var(--color-danger, #dc2626)", marginBottom: 8 }}>
          Generation failed: {generateError}
        </div>
      )}

      {latest.length > 0 && (
        <div className="inspector-subsection">
          <div className="inspector-subsection-title">{t("relationships.latest" as never)}</div>
          <div className="inspector-relations-grid">
            {latest.map((rel) => (
              <div key={rel.id} className="inspector-relation-row">
                <span className="inspector-relation-source">{rel.source}</span>
                <span className="inspector-relation-arrow">→</span>
                <span className="inspector-relation-target">{rel.target}</span>
                <span className="inspector-relation-word">{rel.word}</span>
                <span className="inspector-relation-turn">T{rel.turn}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="inspector-subsection">
          <div className="inspector-subsection-title">{t("relationships.history" as never)}</div>
          <div className="inspector-relations-history">
            {recent.map((rel) => (
              <div key={rel.id} className="inspector-relation-history-row">
                <span className="inspector-relation-turn">T{rel.turn}</span>
                <span className="inspector-relation-source">{rel.source}</span>
                <span className="inspector-relation-arrow">→</span>
                <span className="inspector-relation-target">{rel.target}</span>
                <span className="inspector-relation-word">{rel.word}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Main InspectorPanel
// --------------------------------------------------------------------------

export function InspectorPanel({ open, onClose, chatId, branchId }: InspectorPanelProps) {
  const { t } = useI18n();

  // Lock body scroll on mobile when panel is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const content = useMemo(() => {
    if (!chatId) {
      return <div className="inspector-empty">{t("inspector.noActiveChat" as never)}</div>;
    }
    return (
      <>
        <Section title={t("inspector.sectionPayload" as never)} defaultOpen>
          <PayloadPreviewSection chatId={chatId} branchId={branchId} />
        </Section>

        <Section title={t("inspector.sectionMemory" as never)}>
          <MemorySection chatId={chatId} />
        </Section>

        <Section title={t("inspector.sectionActionTree" as never)}>
          <ActionTreeSection chatId={chatId} />
        </Section>

        <Section title={t("inspector.sectionFutureGuides" as never)}>
          <FutureGuidesSection chatId={chatId} />
        </Section>

        <Section title={t("inspector.sectionFreeWill" as never)}>
          <FreeWillSection chatId={chatId} />
        </Section>

        <Section title={t("inspector.sectionBodyState" as never)}>
          <BodyStateSection chatId={chatId} />
        </Section>

        <Section title={t("inspector.sectionRelationships" as never)}>
          <RelationshipsSection chatId={chatId} />
        </Section>
      </>
    );
  }, [chatId, branchId, t]);

  return (
    <div className={`inspector-panel-root ${open ? "is-open" : ""}`} aria-hidden={!open}>
      <div className="inspector-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className="inspector-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t("inspector.title" as never)}
      >
        <div className="inspector-panel-header">
          <span className="inspector-panel-title">{t("inspector.title" as never)}</span>
          <button
            type="button"
            className="inspector-panel-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="inspector-panel-body">
          {content}
        </div>
      </aside>
    </div>
  );
}
