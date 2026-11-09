// Original file: proto/sekai/multiplay/v1/multiplay.proto

import type { Phase as _sekai_multiplay_v1_Phase, Phase__Output as _sekai_multiplay_v1_Phase__Output } from '../../../sekai/multiplay/v1/Phase';
import type { Member as _sekai_multiplay_v1_Member, Member__Output as _sekai_multiplay_v1_Member__Output } from '../../../sekai/multiplay/v1/Member';
import type { ChartInfo as _sekai_multiplay_v1_ChartInfo, ChartInfo__Output as _sekai_multiplay_v1_ChartInfo__Output } from '../../../sekai/multiplay/v1/ChartInfo';
import type { LiveResult as _sekai_multiplay_v1_LiveResult, LiveResult__Output as _sekai_multiplay_v1_LiveResult__Output } from '../../../sekai/multiplay/v1/LiveResult';
import type { Long } from '@grpc/proto-loader';

export interface Room {
  'code'?: (string);
  'public'?: (boolean);
  'phase'?: (_sekai_multiplay_v1_Phase);
  'deadlineMs'?: (number | string | Long);
  'serverTimeMs'?: (number | string | Long);
  'hostId'?: (string);
  'members'?: (_sekai_multiplay_v1_Member)[];
  'maxMembers'?: (number);
  'round'?: (number);
  'song'?: (_sekai_multiplay_v1_ChartInfo | null);
  'songPickedBy'?: (string);
  'difficultyOptions'?: (_sekai_multiplay_v1_ChartInfo)[];
  'result'?: (_sekai_multiplay_v1_LiveResult | null);
}

export interface Room__Output {
  'code': (string);
  'public': (boolean);
  'phase': (_sekai_multiplay_v1_Phase__Output);
  'deadlineMs': (number);
  'serverTimeMs': (number);
  'hostId': (string);
  'members': (_sekai_multiplay_v1_Member__Output)[];
  'maxMembers': (number);
  'round': (number);
  'song': (_sekai_multiplay_v1_ChartInfo__Output | null);
  'songPickedBy': (string);
  'difficultyOptions': (_sekai_multiplay_v1_ChartInfo__Output)[];
  'result': (_sekai_multiplay_v1_LiveResult__Output | null);
}
