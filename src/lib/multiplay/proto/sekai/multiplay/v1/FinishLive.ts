// Original file: proto/sekai/multiplay/v1/multiplay.proto

import type { PlayerStatus as _sekai_multiplay_v1_PlayerStatus, PlayerStatus__Output as _sekai_multiplay_v1_PlayerStatus__Output } from '../../../sekai/multiplay/v1/PlayerStatus';

export interface FinishLive {
  'final'?: (_sekai_multiplay_v1_PlayerStatus | null);
  'failed'?: (boolean);
}

export interface FinishLive__Output {
  'final': (_sekai_multiplay_v1_PlayerStatus__Output | null);
  'failed': (boolean);
}
