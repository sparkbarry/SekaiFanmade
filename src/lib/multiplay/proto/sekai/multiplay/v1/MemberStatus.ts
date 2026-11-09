// Original file: proto/sekai/multiplay/v1/multiplay.proto

import type { PlayerStatus as _sekai_multiplay_v1_PlayerStatus, PlayerStatus__Output as _sekai_multiplay_v1_PlayerStatus__Output } from '../../../sekai/multiplay/v1/PlayerStatus';

export interface MemberStatus {
  'userId'?: (string);
  'status'?: (_sekai_multiplay_v1_PlayerStatus | null);
  'connected'?: (boolean);
  'finished'?: (boolean);
}

export interface MemberStatus__Output {
  'userId': (string);
  'status': (_sekai_multiplay_v1_PlayerStatus__Output | null);
  'connected': (boolean);
  'finished': (boolean);
}
