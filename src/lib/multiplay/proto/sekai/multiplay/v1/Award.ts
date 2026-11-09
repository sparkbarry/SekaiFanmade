// Original file: proto/sekai/multiplay/v1/multiplay.proto

export const Award = {
  AWARD_UNSPECIFIED: 'AWARD_UNSPECIFIED',
  NO_AWARD: 'NO_AWARD',
  MVP: 'MVP',
  SUPER_STAR: 'SUPER_STAR',
} as const;

export type Award =
  | 'AWARD_UNSPECIFIED'
  | 0
  | 'NO_AWARD'
  | 1
  | 'MVP'
  | 2
  | 'SUPER_STAR'
  | 3

export type Award__Output = typeof Award[keyof typeof Award]
