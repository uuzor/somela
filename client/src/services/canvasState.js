import { CANVAS_MODES, CANVAS_TABS, normalizeCanvasBootstrap } from "./canvasModel";

export const CANVAS_EVENTS = Object.freeze({
  BOOTSTRAP_STARTED: "CANVAS/BOOTSTRAP_STARTED",
  BOOTSTRAP_SUCCEEDED: "CANVAS/BOOTSTRAP_SUCCEEDED",
  BOOTSTRAP_FAILED: "CANVAS/BOOTSTRAP_FAILED",
  SET_TAB: "CANVAS/SET_TAB",
  SET_MODE: "CANVAS/SET_MODE",
  SET_QUERY: "CANVAS/SET_QUERY",
  SET_REFERENCE_PRODUCT: "CANVAS/SET_REFERENCE_PRODUCT",
  SELECT_PRODUCT: "CANVAS/SELECT_PRODUCT",
  CLEAR_SELECTION: "CANVAS/CLEAR_SELECTION",
  REPLACE_MESSAGES: "CANVAS/REPLACE_MESSAGES",
  ADD_MESSAGE: "CANVAS/ADD_MESSAGE",
  UPSERT_JOB: "CANVAS/UPSERT_JOB",
  SET_CART: "CANVAS/SET_CART",
  SET_PROGRESS: "CANVAS/SET_PROGRESS",
  SET_ORDERS: "CANVAS/SET_ORDERS",
  RESET: "CANVAS/RESET",
});

const MODE_TRANSITIONS = Object.freeze({
  [CANVAS_MODES.discover]: [CANVAS_MODES.searching, CANVAS_MODES.results, CANVAS_MODES.product, CANVAS_MODES.checkout],
  [CANVAS_MODES.searching]: [CANVAS_MODES.results, CANVAS_MODES.discover],
  [CANVAS_MODES.results]: [CANVAS_MODES.product, CANVAS_MODES.comparison, CANVAS_MODES.tryon, CANVAS_MODES.checkout, CANVAS_MODES.discover],
  [CANVAS_MODES.product]: [CANVAS_MODES.comparison, CANVAS_MODES.tryon, CANVAS_MODES.checkout, CANVAS_MODES.results],
  [CANVAS_MODES.comparison]: [CANVAS_MODES.product, CANVAS_MODES.tryon, CANVAS_MODES.checkout, CANVAS_MODES.results],
  [CANVAS_MODES.tryon]: [CANVAS_MODES.processing, CANVAS_MODES.product, CANVAS_MODES.results],
  [CANVAS_MODES.checkout]: [CANVAS_MODES.processing, CANVAS_MODES.confirmation],
  [CANVAS_MODES.processing]: [CANVAS_MODES.confirmation, CANVAS_MODES.checkout, CANVAS_MODES.results],
  [CANVAS_MODES.confirmation]: [CANVAS_MODES.discover, CANVAS_MODES.results],
});

export function createCanvasState(overrides = {}) {
  return {
    phase: "idle",
    mode: CANVAS_MODES.discover,
    tab: CANVAS_TABS.canvas,
    query: "",
    session: {
      userId: null,
      sessionId: null,
    },
    selectedProductId: null,
    referenceProductId: null,
    catalog: [],
    visibleProducts: [],
    messages: [],
    jobs: [],
    cart: null,
    progress: 0,
    orders: [],
    suggestedTasks: [],
    bootstrap: null,
    error: null,
    ...overrides,
  };
}

export function canTransitionCanvasMode(fromMode, toMode) {
  if (!fromMode || !toMode) return false;
  if (fromMode === toMode) return true;
  const allowed = MODE_TRANSITIONS[fromMode];
  if (!allowed) return false;
  return allowed.includes(toMode);
}

export function transitionCanvasMode(state, nextMode) {
  if (!nextMode || !Object.values(CANVAS_MODES).includes(nextMode)) {
    return state;
  }

  if (!canTransitionCanvasMode(state.mode, nextMode)) {
    return {
      ...state,
      mode: nextMode,
      phase: state.phase === "processing" && nextMode === CANVAS_MODES.confirmation ? "complete" : state.phase,
    };
  }

  return {
    ...state,
    mode: nextMode,
    phase: nextMode === CANVAS_MODES.searching ? "loading" : state.phase,
  };
}

export function deriveInitialMode(snapshot) {
  if (snapshot?.cart?.items?.length) return CANVAS_MODES.checkout;
  if (snapshot?.conversation?.messages?.length) return CANVAS_MODES.results;
  if (snapshot?.catalog?.length) return CANVAS_MODES.discover;
  return CANVAS_MODES.discover;
}

export function canvasReducer(state, action) {
  switch (action?.type) {
    case CANVAS_EVENTS.BOOTSTRAP_STARTED:
      return {
        ...state,
        phase: "bootstrapping",
        error: null,
      };
    case CANVAS_EVENTS.BOOTSTRAP_SUCCEEDED: {
      const bootstrap = normalizeCanvasBootstrap(action.payload);
      return {
        ...state,
        phase: "ready",
        bootstrap,
        session: bootstrap.session,
        cart: bootstrap.cart,
        catalog: bootstrap.catalog,
        messages: bootstrap.conversation?.messages || [],
        visibleProducts: bootstrap.catalog,
        selectedProductId: bootstrap.catalog[0]?.id || null,
        referenceProductId: bootstrap.catalog[0]?.id || null,
        mode: action.payload?.mode || deriveInitialMode(bootstrap),
        suggestedTasks: action.payload?.suggestedTasks || [],
        error: null,
      };
    }
    case CANVAS_EVENTS.BOOTSTRAP_FAILED:
      return {
        ...state,
        phase: "error",
        error: action.error || "Failed to bootstrap canvas",
      };
    case CANVAS_EVENTS.SET_TAB:
      return {
        ...state,
        tab: action.tab || CANVAS_TABS.canvas,
      };
    case CANVAS_EVENTS.SET_MODE:
      return transitionCanvasMode(state, action.mode);
    case CANVAS_EVENTS.SET_QUERY:
      return {
        ...state,
        query: action.query || "",
      };
    case CANVAS_EVENTS.SET_REFERENCE_PRODUCT:
      return {
        ...state,
        referenceProductId: action.productId || null,
      };
    case CANVAS_EVENTS.SELECT_PRODUCT:
      return {
        ...state,
        selectedProductId: action.productId || null,
        mode: action.mode || state.mode,
      };
    case CANVAS_EVENTS.CLEAR_SELECTION:
      return {
        ...state,
        selectedProductId: null,
        referenceProductId: null,
      };
    case CANVAS_EVENTS.REPLACE_MESSAGES:
      return {
        ...state,
        messages: Array.isArray(action.messages) ? action.messages : [],
      };
    case CANVAS_EVENTS.ADD_MESSAGE:
      return {
        ...state,
        messages: [...state.messages, action.message].filter(Boolean),
      };
    case CANVAS_EVENTS.UPSERT_JOB: {
      const job = action.job;
      if (!job) return state;
      const jobs = state.jobs.filter((item) => item.id !== job.id).concat(job);
      return {
        ...state,
        jobs,
      };
    }
    case CANVAS_EVENTS.SET_CART:
      return {
        ...state,
        cart: action.cart || null,
      };
    case CANVAS_EVENTS.SET_PROGRESS:
      return {
        ...state,
        progress: Number.isFinite(action.progress) ? action.progress : state.progress,
      };
    case CANVAS_EVENTS.SET_ORDERS:
      return {
        ...state,
        orders: Array.isArray(action.orders) ? action.orders : [],
      };
    case CANVAS_EVENTS.RESET:
      return createCanvasState(action.state || {});
    default:
      return state;
  }
}

export { CANVAS_MODES, CANVAS_TABS };
