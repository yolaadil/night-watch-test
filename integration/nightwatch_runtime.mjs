const DEFAULT_WEIGHTS = Object.freeze({
  authoredImportance: 0.24,
  historyRelevance: 0.18,
  underexploredBranch: 0.15,
  audienceAffinity: 0.12,
  currentVisibility: 0.12,
  novelty: 0.10,
  spatialConvenience: 0.09,
  recentPoiPenalty: -0.20,
  guidanceFatigue: -0.15,
});

const PROFILE_CATEGORY_BONUS = Object.freeze({
  child: {characters: 0.25, actions: 0.25, orientation: 0.18, style: 0.08, history: 0.02, materials: -0.12, conservation: -0.10, reception: -0.08},
  general: {orientation: 0.10, characters: 0.10, actions: 0.08, style: 0.10, history: 0.10, materials: 0.05, conservation: 0.05, reception: 0.05},
  expert: {orientation: -0.08, characters: -0.02, actions: -0.03, style: 0.12, history: 0.14, materials: 0.24, conservation: 0.24, reception: 0.20},
});

export function createVisitorState(profile = "general") {
  if (!PROFILE_CATEGORY_BONUS[profile]) throw new Error(`Unknown profile: ${profile}`);
  return {
    profile,
    completed: new Set(),
    started: new Set(),
    dismissed: new Set(),
    recentNodes: [],
    recentPois: [],
    activeNode: null,
    narrationState: "idle",
    lastGuidanceTime: -Infinity,
    categoryCounts: {},
    sessionSeconds: 0,
  };
}

export function hydrateVisitorState(serialized) {
  const state = createVisitorState(serialized.profile);
  for (const key of ["completed", "started", "dismissed"]) state[key] = new Set(serialized[key] || []);
  Object.assign(state, serialized, {completed: state.completed, started: state.started, dismissed: state.dismissed});
  return state;
}

export function serializeVisitorState(state) {
  return {...state, completed: [...state.completed], started: [...state.started], dismissed: [...state.dismissed]};
}

function satisfiesPrerequisites(node, completed) {
  const all = node.requires_all || [];
  const any = node.requires_any || [];
  return all.every(id => completed.has(id)) && (any.length === 0 || any.some(id => completed.has(id)));
}

export function eligibleNodes(nodes, state, spatial = {}) {
  if (state.activeNode || !["idle", "paused"].includes(state.narrationState)) return [];
  return nodes.filter(node => {
    const s = spatial[node.poi] || {};
    return !state.completed.has(node.id)
      && !state.dismissed.has(node.id)
      && satisfiesPrerequisites(node, state.completed)
      && s.zoomValid !== false
      && s.angularSizeValid !== false
      && s.currentlyIntersected !== true
      && s.inCooldown !== true
      && s.guideable !== false;
  });
}

const clamp01 = x => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

export function scoreNode(node, state, features = {}, weights = DEFAULT_WEIGHTS) {
  const f = {
    authoredImportance: clamp01(features.authoredImportance ?? (1 - node.level * 0.08)),
    historyRelevance: clamp01(features.historyRelevance),
    underexploredBranch: clamp01(features.underexploredBranch ?? (1 / (1 + (state.categoryCounts[node.category] || 0)))),
    audienceAffinity: clamp01(0.5 + (PROFILE_CATEGORY_BONUS[state.profile][node.category] || 0) - node.level * (state.profile === "child" ? 0.08 : 0)),
    currentVisibility: clamp01(features.currentVisibility),
    novelty: clamp01(features.novelty ?? (state.recentNodes.includes(node.id) ? 0 : 1)),
    spatialConvenience: clamp01(features.spatialConvenience),
    recentPoiPenalty: clamp01(features.recentPoiPenalty ?? (state.recentPois.includes(node.poi) ? 1 : 0)),
    guidanceFatigue: clamp01(features.guidanceFatigue),
  };
  const contributions = Object.fromEntries(Object.keys(weights).map(k => [k, weights[k] * f[k]]));
  const score = Object.values(contributions).reduce((a, b) => a + b, 0);
  return {score, features: f, contributions};
}

export function selectRecommendation(nodes, state, spatial = {}, featureProvider = () => ({}), weights = DEFAULT_WEIGHTS) {
  const candidates = eligibleNodes(nodes, state, spatial).map(node => ({node, ...scoreNode(node, state, featureProvider(node, spatial[node.poi] || {}), weights)}));
  candidates.sort((a, b) => b.score - a.score || a.node.level - b.node.level || a.node.id.localeCompare(b.node.id));
  return {selected: candidates[0] || null, candidates};
}

export function markNarrationCompleted(state, node, nowSeconds, recentLimit = 6) {
  state.completed.add(node.id);
  state.started.add(node.id);
  state.activeNode = null;
  state.narrationState = "idle";
  state.sessionSeconds = nowSeconds;
  state.recentNodes = [node.id, ...state.recentNodes.filter(x => x !== node.id)].slice(0, recentLimit);
  state.recentPois = [node.poi, ...state.recentPois.filter(x => x !== node.poi)].slice(0, recentLimit);
  state.categoryCounts[node.category] = (state.categoryCounts[node.category] || 0) + 1;
  return state;
}

export class DwellController {
  constructor(options = {}) {
    this.options = {
      orientationMs: 400,
      activationMs: 2200,
      departureGraceMs: 400,
      maxAngularVelocityDegPerSec: 15,
      ...options,
    };
    this.reset();
  }

  reset() {
    this.state = "outside";
    this.poi = null;
    this.enteredAt = null;
    this.orientedAt = null;
    this.lastInsideAt = null;
  }

  update({nowMs, poi = null, insideOuter = false, insideInner = false, angularVelocityDegPerSec = 0}) {
    const events = [];
    const stable = angularVelocityDegPerSec <= this.options.maxAngularVelocityDegPerSec;
    if (!insideOuter || !poi || (this.poi && poi !== this.poi)) {
      if (this.lastInsideAt !== null && nowMs - this.lastInsideAt <= this.options.departureGraceMs) return {state: this.state, events};
      if (this.state !== "outside") events.push({type: "dwell_cancelled", poi: this.poi, at: nowMs, fromState: this.state});
      this.reset();
      return {state: this.state, events};
    }

    this.lastInsideAt = nowMs;
    if (this.state === "outside") {
      this.state = "candidate"; this.poi = poi; this.enteredAt = nowMs;
      events.push({type: "roi_candidate", poi, at: nowMs});
    }
    if (this.state === "candidate" && insideInner && stable && nowMs - this.enteredAt >= this.options.orientationMs) {
      this.state = "oriented"; this.orientedAt = nowMs;
      events.push({type: "orientation_confirmed", poi, at: nowMs});
    }
    if (this.state === "oriented") {
      this.state = "activating";
      events.push({type: "activation_started", poi, at: nowMs});
    }
    if (this.state === "activating" && insideInner && stable && nowMs - this.orientedAt >= this.options.activationMs) {
      this.state = "playing";
      events.push({type: "activation_completed", poi, at: nowMs});
    }
    return {state: this.state, events};
  }
}

export function pointInShape(x, y, shape) {
  if (shape.type === "rect") return x >= shape.x && x <= shape.x + shape.width && y >= shape.y && y <= shape.y + shape.height;
  if (shape.type === "ellipse") return ((x - shape.cx) / shape.rx) ** 2 + ((y - shape.cy) / shape.ry) ** 2 <= 1;
  if (shape.type === "polygon") {
    let inside = false;
    const p = shape.points;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i], [xj, yj] = p[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  throw new Error(`Unknown shape type: ${shape.type}`);
}

export function makeEvent(type, data = {}, now = performance.now()) {
  return {schema_version: "1.0", type, timestamp_ms: now, ...data};
}

export {DEFAULT_WEIGHTS};
