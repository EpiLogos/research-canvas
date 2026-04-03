export interface PlaybackState {
  active: boolean;
  path: string[];
  currentNodeId: string | null;
}

export type PlaybackAction =
  | { type: "enter"; rootNodeId: string }
  | { type: "advance"; targetNodeId: string }
  | { type: "back" }
  | { type: "jump"; nodeId: string; pathFromRoot: string[] }
  | { type: "home" }
  | { type: "exit" };

export const initialPlaybackState: PlaybackState = {
  active: false,
  path: [],
  currentNodeId: null,
};

export function playbackReducer(
  state: PlaybackState,
  action: PlaybackAction
): PlaybackState {
  switch (action.type) {
    case "enter":
      return { active: true, path: [action.rootNodeId], currentNodeId: action.rootNodeId };
    case "advance":
      return { ...state, path: [...state.path, action.targetNodeId], currentNodeId: action.targetNodeId };
    case "back": {
      if (state.path.length <= 1) {
        return { active: false, path: [], currentNodeId: null };
      }
      const nextPath = state.path.slice(0, -1);
      return { ...state, path: nextPath, currentNodeId: nextPath[nextPath.length - 1] };
    }
    case "jump":
      return { ...state, path: action.pathFromRoot, currentNodeId: action.nodeId };
    case "home":
      return { ...state, path: [], currentNodeId: null };
    case "exit":
      return { ...state, active: false };
    default:
      return state;
  }
}
