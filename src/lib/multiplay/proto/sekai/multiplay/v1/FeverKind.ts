// Original file: proto/sekai/multiplay/v1/multiplay.proto

export const FeverKind = {
  FEVER_KIND_UNSPECIFIED: 'FEVER_KIND_UNSPECIFIED',
  NO_FEVER: 'NO_FEVER',
  FEVER: 'FEVER',
  SUPER_FEVER: 'SUPER_FEVER',
} as const;

export type FeverKind =
  | 'FEVER_KIND_UNSPECIFIED'
  | 0
  | 'NO_FEVER'
  | 1
  | 'FEVER'
  | 2
  | 'SUPER_FEVER'
  | 3

export type FeverKind__Output = typeof FeverKind[keyof typeof FeverKind]
