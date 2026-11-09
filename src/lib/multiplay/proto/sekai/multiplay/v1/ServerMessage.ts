// Original file: proto/sekai/multiplay/v1/multiplay.proto

import type { Welcome as _sekai_multiplay_v1_Welcome, Welcome__Output as _sekai_multiplay_v1_Welcome__Output } from '../../../sekai/multiplay/v1/Welcome';
import type { Room as _sekai_multiplay_v1_Room, Room__Output as _sekai_multiplay_v1_Room__Output } from '../../../sekai/multiplay/v1/Room';
import type { StartLive as _sekai_multiplay_v1_StartLive, StartLive__Output as _sekai_multiplay_v1_StartLive__Output } from '../../../sekai/multiplay/v1/StartLive';
import type { LiveStatuses as _sekai_multiplay_v1_LiveStatuses, LiveStatuses__Output as _sekai_multiplay_v1_LiveStatuses__Output } from '../../../sekai/multiplay/v1/LiveStatuses';
import type { FeverResult as _sekai_multiplay_v1_FeverResult, FeverResult__Output as _sekai_multiplay_v1_FeverResult__Output } from '../../../sekai/multiplay/v1/FeverResult';
import type { StampSent as _sekai_multiplay_v1_StampSent, StampSent__Output as _sekai_multiplay_v1_StampSent__Output } from '../../../sekai/multiplay/v1/StampSent';
import type { Pong as _sekai_multiplay_v1_Pong, Pong__Output as _sekai_multiplay_v1_Pong__Output } from '../../../sekai/multiplay/v1/Pong';
import type { Notice as _sekai_multiplay_v1_Notice, Notice__Output as _sekai_multiplay_v1_Notice__Output } from '../../../sekai/multiplay/v1/Notice';
import type { Closed as _sekai_multiplay_v1_Closed, Closed__Output as _sekai_multiplay_v1_Closed__Output } from '../../../sekai/multiplay/v1/Closed';

export interface ServerMessage {
  'welcome'?: (_sekai_multiplay_v1_Welcome | null);
  'room'?: (_sekai_multiplay_v1_Room | null);
  'startLive'?: (_sekai_multiplay_v1_StartLive | null);
  'statuses'?: (_sekai_multiplay_v1_LiveStatuses | null);
  'fever'?: (_sekai_multiplay_v1_FeverResult | null);
  'stamp'?: (_sekai_multiplay_v1_StampSent | null);
  'pong'?: (_sekai_multiplay_v1_Pong | null);
  'notice'?: (_sekai_multiplay_v1_Notice | null);
  'closed'?: (_sekai_multiplay_v1_Closed | null);
  'kind'?: "welcome"|"room"|"startLive"|"statuses"|"fever"|"stamp"|"pong"|"notice"|"closed";
}

export interface ServerMessage__Output {
  'welcome'?: (_sekai_multiplay_v1_Welcome__Output | null);
  'room'?: (_sekai_multiplay_v1_Room__Output | null);
  'startLive'?: (_sekai_multiplay_v1_StartLive__Output | null);
  'statuses'?: (_sekai_multiplay_v1_LiveStatuses__Output | null);
  'fever'?: (_sekai_multiplay_v1_FeverResult__Output | null);
  'stamp'?: (_sekai_multiplay_v1_StampSent__Output | null);
  'pong'?: (_sekai_multiplay_v1_Pong__Output | null);
  'notice'?: (_sekai_multiplay_v1_Notice__Output | null);
  'closed'?: (_sekai_multiplay_v1_Closed__Output | null);
  'kind'?: "welcome"|"room"|"startLive"|"statuses"|"fever"|"stamp"|"pong"|"notice"|"closed";
}
