"use client"

import { createContext, useContext, useReducer, ReactNode } from "react"
import { GameState, VoteResult } from "@/types/game"

type Action =
  | { type: "SET_ROOM"; roomCode: string; myPlayerId: string }
  | { type: "SET_PHASE"; phase: GameState["phase"] }
  | { type: "SET_PLAYERS"; players: string[]; playerNames?: Record<string, string> }
  | { type: "SET_PROBLEM"; problemStatement: string; players: string[]; currentTurn: string; playerNames?: Record<string, string> }
  | { type: "UPDATE_CONTRIBUTIONS"; contributions: Record<string, string> }
  | { type: "SET_TURN"; currentTurn: string; timerSeconds?: number | null }
  | { type: "SET_IMPOSTOR_DIRECTIVE"; directive: string }
  | { type: "SET_TIMER"; timerSeconds: number | null }
  | { type: "ELIMINATE_PLAYER"; playerId: string }
  | { type: "SET_MEETING_CALLER"; callerName: string | null }
  | { type: "GAME_OVER" }
  | { type: "RESET" }

const initialState: GameState = {
  roomCode: "",
  phase: "waiting",
  players: [],
  playerNames: {},
  problemStatement: "",
  currentTurn: "",
  contributions: {},
  isImpostor: false,
  impostorDirective: null,
  timerSeconds: null,
  myPlayerId: "",
  eliminatedPlayers: [],
  callerName: null,
}

function gameReducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "SET_ROOM":
      return { ...state, roomCode: action.roomCode, myPlayerId: action.myPlayerId }
    case "SET_PHASE":
      return { ...state, phase: action.phase }
    case "SET_PLAYERS":
      return { ...state, players: action.players, playerNames: action.playerNames ?? state.playerNames }
    case "SET_PROBLEM":
      return {
        ...state,
        phase: "playing",
        problemStatement: action.problemStatement,
        players: action.players,
        currentTurn: action.currentTurn,
        playerNames: action.playerNames ?? state.playerNames,
      }
    case "UPDATE_CONTRIBUTIONS":
      return { ...state, contributions: action.contributions }
    case "SET_TURN":
      return {
        ...state,
        currentTurn: action.currentTurn,
        timerSeconds: action.timerSeconds !== undefined ? action.timerSeconds : state.timerSeconds,
      }
    case "SET_IMPOSTOR_DIRECTIVE":
      return { ...state, isImpostor: true, impostorDirective: action.directive }
    case "SET_TIMER":
      return { ...state, timerSeconds: action.timerSeconds }
    case "ELIMINATE_PLAYER":
      return { ...state, eliminatedPlayers: [...state.eliminatedPlayers, action.playerId] }
    case "SET_MEETING_CALLER":
      return { ...state, callerName: action.callerName, phase: action.callerName ? "voting" : state.phase }
    case "GAME_OVER":
      return { ...state, phase: "ended" }
    case "RESET":
      return initialState
    default:
      return state
  }
}

interface GameContextValue {
  state: GameState
  dispatch: React.Dispatch<Action>
}

const GameContext = createContext<GameContextValue | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState)
  return <GameContext.Provider value={{ state, dispatch }}>{children}</GameContext.Provider>
}

export function useGame() {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error("useGame must be used within GameProvider")
  return ctx
}
