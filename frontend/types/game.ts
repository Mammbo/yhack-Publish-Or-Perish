export type GamePhase = "waiting" | "ingesting" | "playing" | "voting" | "ended"

export interface Player {
  id: string
  name: string
  isAlive: boolean
}

export interface Contribution {
  player_id: string
  content: string
}

export interface GameState {
  roomCode: string
  phase: GamePhase
  players: string[]
  playerNames: Record<string, string>   // playerId → display name
  problemStatement: string
  currentTurn: string
  contributions: Record<string, string> // playerId → contribution text
  isImpostor: boolean
  impostorDirective: string | null
  timerSeconds: number | null
  myPlayerId: string
  eliminatedPlayers: string[]
  callerName: string | null
}

export interface VoteResult {
  eliminated_id: string
  was_impostor: boolean
  impostor_directive: string
  votes: Record<string, number>
}

export interface GameOverPayload {
  winner: "players" | "impostor"
  impostor_id: string
  impostor_directive: string
}

// Mock data for development / demo mode
export const MOCK_PLAYERS = ["Dr. Chen", "Prof. Reyes", "Dr. Okafor", "Dr. Singh"]
export const MOCK_PLAYER_IDS = ["player_1", "player_2", "player_3", "player_4"]

export const MOCK_GAME_START = {
  problem_statement: "Implement a binary search function that returns the index of the target element, or -1 if not found. Each researcher contributes one section: function signature, base case, recursive logic, and edge case handling.",
  players: ["player_1", "player_2", "player_3", "player_4"],
  first_turn: "player_1",
}

export const MOCK_IMPOSTOR_DIRECTIVE = {
  directive: "Your implementation should use >= instead of > in the comparison, causing it to skip the last element when the array has an even length.",
}

export const MOCK_CONTRIBUTIONS: Record<string, string> = {
  "player_1": "def binary_search(arr, target, low=0, high=None):\n    if high is None:\n        high = len(arr) - 1",
  "player_2": "    if low > high:\n        return -1",
}

export const MOCK_VOTE_RESULT: VoteResult = {
  eliminated_id: "player_3",
  was_impostor: true,
  impostor_directive: "Your implementation should use >= instead of > in the comparison, causing it to skip the last element when the array has an even length.",
  votes: { "player_3": 2, "player_1": 1 },
}
