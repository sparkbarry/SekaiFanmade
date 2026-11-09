// Original file: proto/sekai/multiplay/v1/multiplay.proto

import type { Join as _sekai_multiplay_v1_Join, Join__Output as _sekai_multiplay_v1_Join__Output } from '../../../sekai/multiplay/v1/Join';
import type { Leave as _sekai_multiplay_v1_Leave, Leave__Output as _sekai_multiplay_v1_Leave__Output } from '../../../sekai/multiplay/v1/Leave';
import type { LockMembers as _sekai_multiplay_v1_LockMembers, LockMembers__Output as _sekai_multiplay_v1_LockMembers__Output } from '../../../sekai/multiplay/v1/LockMembers';
import type { OpenRoom as _sekai_multiplay_v1_OpenRoom, OpenRoom__Output as _sekai_multiplay_v1_OpenRoom__Output } from '../../../sekai/multiplay/v1/OpenRoom';
import type { PickSong as _sekai_multiplay_v1_PickSong, PickSong__Output as _sekai_multiplay_v1_PickSong__Output } from '../../../sekai/multiplay/v1/PickSong';
import type { PickDifficulty as _sekai_multiplay_v1_PickDifficulty, PickDifficulty__Output as _sekai_multiplay_v1_PickDifficulty__Output } from '../../../sekai/multiplay/v1/PickDifficulty';
import type { SetReady as _sekai_multiplay_v1_SetReady, SetReady__Output as _sekai_multiplay_v1_SetReady__Output } from '../../../sekai/multiplay/v1/SetReady';
import type { Loaded as _sekai_multiplay_v1_Loaded, Loaded__Output as _sekai_multiplay_v1_Loaded__Output } from '../../../sekai/multiplay/v1/Loaded';
import type { PlayerStatus as _sekai_multiplay_v1_PlayerStatus, PlayerStatus__Output as _sekai_multiplay_v1_PlayerStatus__Output } from '../../../sekai/multiplay/v1/PlayerStatus';
import type { FeverReport as _sekai_multiplay_v1_FeverReport, FeverReport__Output as _sekai_multiplay_v1_FeverReport__Output } from '../../../sekai/multiplay/v1/FeverReport';
import type { FinishLive as _sekai_multiplay_v1_FinishLive, FinishLive__Output as _sekai_multiplay_v1_FinishLive__Output } from '../../../sekai/multiplay/v1/FinishLive';
import type { SendStamp as _sekai_multiplay_v1_SendStamp, SendStamp__Output as _sekai_multiplay_v1_SendStamp__Output } from '../../../sekai/multiplay/v1/SendStamp';
import type { Ping as _sekai_multiplay_v1_Ping, Ping__Output as _sekai_multiplay_v1_Ping__Output } from '../../../sekai/multiplay/v1/Ping';
import type { Kick as _sekai_multiplay_v1_Kick, Kick__Output as _sekai_multiplay_v1_Kick__Output } from '../../../sekai/multiplay/v1/Kick';

export interface ClientMessage {
  'join'?: (_sekai_multiplay_v1_Join | null);
  'leave'?: (_sekai_multiplay_v1_Leave | null);
  'lockMembers'?: (_sekai_multiplay_v1_LockMembers | null);
  'openRoom'?: (_sekai_multiplay_v1_OpenRoom | null);
  'pickSong'?: (_sekai_multiplay_v1_PickSong | null);
  'pickDifficulty'?: (_sekai_multiplay_v1_PickDifficulty | null);
  'setReady'?: (_sekai_multiplay_v1_SetReady | null);
  'loaded'?: (_sekai_multiplay_v1_Loaded | null);
  'status'?: (_sekai_multiplay_v1_PlayerStatus | null);
  'feverReport'?: (_sekai_multiplay_v1_FeverReport | null);
  'finish'?: (_sekai_multiplay_v1_FinishLive | null);
  'stamp'?: (_sekai_multiplay_v1_SendStamp | null);
  'ping'?: (_sekai_multiplay_v1_Ping | null);
  'kick'?: (_sekai_multiplay_v1_Kick | null);
  'kind'?: "join"|"leave"|"lockMembers"|"openRoom"|"pickSong"|"pickDifficulty"|"setReady"|"loaded"|"status"|"feverReport"|"finish"|"stamp"|"ping"|"kick";
}

export interface ClientMessage__Output {
  'join'?: (_sekai_multiplay_v1_Join__Output | null);
  'leave'?: (_sekai_multiplay_v1_Leave__Output | null);
  'lockMembers'?: (_sekai_multiplay_v1_LockMembers__Output | null);
  'openRoom'?: (_sekai_multiplay_v1_OpenRoom__Output | null);
  'pickSong'?: (_sekai_multiplay_v1_PickSong__Output | null);
  'pickDifficulty'?: (_sekai_multiplay_v1_PickDifficulty__Output | null);
  'setReady'?: (_sekai_multiplay_v1_SetReady__Output | null);
  'loaded'?: (_sekai_multiplay_v1_Loaded__Output | null);
  'status'?: (_sekai_multiplay_v1_PlayerStatus__Output | null);
  'feverReport'?: (_sekai_multiplay_v1_FeverReport__Output | null);
  'finish'?: (_sekai_multiplay_v1_FinishLive__Output | null);
  'stamp'?: (_sekai_multiplay_v1_SendStamp__Output | null);
  'ping'?: (_sekai_multiplay_v1_Ping__Output | null);
  'kick'?: (_sekai_multiplay_v1_Kick__Output | null);
  'kind'?: "join"|"leave"|"lockMembers"|"openRoom"|"pickSong"|"pickDifficulty"|"setReady"|"loaded"|"status"|"feverReport"|"finish"|"stamp"|"ping"|"kick";
}
