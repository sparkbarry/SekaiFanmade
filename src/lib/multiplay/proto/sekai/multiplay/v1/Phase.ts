// Original file: proto/sekai/multiplay/v1/multiplay.proto

export const Phase = {
  PHASE_UNSPECIFIED: 'PHASE_UNSPECIFIED',
  LOBBY: 'LOBBY',
  SONG_SELECT: 'SONG_SELECT',
  SONG_DRAW: 'SONG_DRAW',
  DIFFICULTY: 'DIFFICULTY',
  LOADING: 'LOADING',
  PLAYING: 'PLAYING',
  RESULT: 'RESULT',
} as const;

export type Phase =
  | 'PHASE_UNSPECIFIED'
  | 0
  | 'LOBBY'
  | 1
  | 'SONG_SELECT'
  | 2
  | 'SONG_DRAW'
  | 3
  | 'DIFFICULTY'
  | 4
  | 'LOADING'
  | 5
  | 'PLAYING'
  | 6
  | 'RESULT'
  | 7

export type Phase__Output = typeof Phase[keyof typeof Phase]
