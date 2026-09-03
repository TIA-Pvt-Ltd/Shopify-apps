const HISTORY_LIMIT = 40;

export function createHistory() {
  return {
    undoStack: [],
    redoStack: [],
  };
}

export function pushHistory(history, snapshot) {
  if (!snapshot) return history;
  const last = history.undoStack[history.undoStack.length - 1];
  if (last === snapshot) return history;
  const undoStack = [...history.undoStack, snapshot].slice(-HISTORY_LIMIT);
  return { undoStack, redoStack: [] };
}

export function undoHistory(history) {
  if (history.undoStack.length < 2) return { history, snapshot: history.undoStack[0] || null };
  const undoStack = history.undoStack.slice(0, -1);
  const current = history.undoStack[history.undoStack.length - 1];
  return {
    history: {
      undoStack,
      redoStack: [...history.redoStack, current],
    },
    snapshot: undoStack[undoStack.length - 1],
  };
}

export function redoHistory(history) {
  if (!history.redoStack.length) return { history, snapshot: null };
  const snapshot = history.redoStack[history.redoStack.length - 1];
  return {
    history: {
      undoStack: [...history.undoStack, snapshot],
      redoStack: history.redoStack.slice(0, -1),
    },
    snapshot,
  };
}
