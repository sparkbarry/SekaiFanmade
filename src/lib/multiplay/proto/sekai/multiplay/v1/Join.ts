// Original file: proto/sekai/multiplay/v1/multiplay.proto

import type { QuickMatch as _sekai_multiplay_v1_QuickMatch, QuickMatch__Output as _sekai_multiplay_v1_QuickMatch__Output } from '../../../sekai/multiplay/v1/QuickMatch';
import type { CreatePrivate as _sekai_multiplay_v1_CreatePrivate, CreatePrivate__Output as _sekai_multiplay_v1_CreatePrivate__Output } from '../../../sekai/multiplay/v1/CreatePrivate';

export interface Join {
  'quickMatch'?: (_sekai_multiplay_v1_QuickMatch | null);
  'createPrivate'?: (_sekai_multiplay_v1_CreatePrivate | null);
  'roomCode'?: (string);
  'protocol'?: (number);
  'target'?: "quickMatch"|"createPrivate"|"roomCode";
}

export interface Join__Output {
  'quickMatch'?: (_sekai_multiplay_v1_QuickMatch__Output | null);
  'createPrivate'?: (_sekai_multiplay_v1_CreatePrivate__Output | null);
  'roomCode'?: (string);
  'protocol': (number);
  'target'?: "quickMatch"|"createPrivate"|"roomCode";
}
