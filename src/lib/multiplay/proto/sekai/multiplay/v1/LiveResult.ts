// Original file: proto/sekai/multiplay/v1/multiplay.proto

import type { FeverKind as _sekai_multiplay_v1_FeverKind, FeverKind__Output as _sekai_multiplay_v1_FeverKind__Output } from '../../../sekai/multiplay/v1/FeverKind';
import type { PlayerResult as _sekai_multiplay_v1_PlayerResult, PlayerResult__Output as _sekai_multiplay_v1_PlayerResult__Output } from '../../../sekai/multiplay/v1/PlayerResult';
import type { Long } from '@grpc/proto-loader';

export interface LiveResult {
  'round'?: (number);
  'teamScore'?: (number | string | Long);
  'fever'?: (_sekai_multiplay_v1_FeverKind);
  'players'?: (_sekai_multiplay_v1_PlayerResult)[];
}

export interface LiveResult__Output {
  'round': (number);
  'teamScore': (number);
  'fever': (_sekai_multiplay_v1_FeverKind__Output);
  'players': (_sekai_multiplay_v1_PlayerResult__Output)[];
}
