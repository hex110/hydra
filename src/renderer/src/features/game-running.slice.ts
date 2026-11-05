import { PayloadAction, createSlice } from "@reduxjs/toolkit";
import type { GameRunning } from "@types";

export interface GameRunningState {
  gameRunning: GameRunning | null;
  /** Every game Hydra sees running, not only the latest one. */
  runningGameIds: string[];
}

const initialState: GameRunningState = {
  gameRunning: null,
  runningGameIds: [],
};

export const gameRunningSlice = createSlice({
  name: "game-running",
  initialState,
  reducers: {
    setGameRunning: (state, action: PayloadAction<GameRunning | null>) => {
      state.gameRunning = action.payload;
    },
    setRunningGameIds: (state, action: PayloadAction<string[]>) => {
      const ids = action.payload;
      // The list arrives every few seconds; keep the same array when unchanged.
      if (
        ids.length === state.runningGameIds.length &&
        ids.every((id, index) => id === state.runningGameIds[index])
      ) {
        return;
      }
      state.runningGameIds = ids;
    },
  },
});

export const { setGameRunning, setRunningGameIds } = gameRunningSlice.actions;
