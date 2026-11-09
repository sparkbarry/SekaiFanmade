// Original file: proto/sekai/multiplay/v1/multiplay.proto

import type { PlayerStatus as _sekai_multiplay_v1_PlayerStatus, PlayerStatus__Output as _sekai_multiplay_v1_PlayerStatus__Output } from '../../../sekai/multiplay/v1/PlayerStatus';
import type { Award as _sekai_multiplay_v1_Award, Award__Output as _sekai_multiplay_v1_Award__Output } from '../../../sekai/multiplay/v1/Award';

export interface PlayerResult {
  'userId'?: (string);
  'nickname'?: (string);
  'chartId'?: (string);
  'status'?: (_sekai_multiplay_v1_PlayerStatus | null);
  'rank'?: (number);
  'award'?: (_sekai_multiplay_v1_Award);
  'failed'?: (boolean);
  'disconnected'?: (boolean);
  'fullCombo'?: (boolean);
  'allPerfect'?: (boolean);
}

export interface PlayerResult__Output {
  'userId': (string);
  'nickname': (string);
  'chartId': (string);
  'status': (_sekai_multiplay_v1_PlayerStatus__Output | null);
  'rank': (number);
  'award': (_sekai_multiplay_v1_Award__Output);
  'failed': (boolean);
  'disconnected': (boolean);
  'fullCombo': (boolean);
  'allPerfect': (boolean);
}
