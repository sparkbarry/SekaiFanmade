import type * as grpc from '@grpc/grpc-js';
import type { EnumTypeDefinition, MessageTypeDefinition } from '@grpc/proto-loader';

import type { ChartInfo as _sekai_multiplay_v1_ChartInfo, ChartInfo__Output as _sekai_multiplay_v1_ChartInfo__Output } from './sekai/multiplay/v1/ChartInfo';
import type { ClientMessage as _sekai_multiplay_v1_ClientMessage, ClientMessage__Output as _sekai_multiplay_v1_ClientMessage__Output } from './sekai/multiplay/v1/ClientMessage';
import type { Closed as _sekai_multiplay_v1_Closed, Closed__Output as _sekai_multiplay_v1_Closed__Output } from './sekai/multiplay/v1/Closed';
import type { CreatePrivate as _sekai_multiplay_v1_CreatePrivate, CreatePrivate__Output as _sekai_multiplay_v1_CreatePrivate__Output } from './sekai/multiplay/v1/CreatePrivate';
import type { FeverReport as _sekai_multiplay_v1_FeverReport, FeverReport__Output as _sekai_multiplay_v1_FeverReport__Output } from './sekai/multiplay/v1/FeverReport';
import type { FeverResult as _sekai_multiplay_v1_FeverResult, FeverResult__Output as _sekai_multiplay_v1_FeverResult__Output } from './sekai/multiplay/v1/FeverResult';
import type { FinishLive as _sekai_multiplay_v1_FinishLive, FinishLive__Output as _sekai_multiplay_v1_FinishLive__Output } from './sekai/multiplay/v1/FinishLive';
import type { Join as _sekai_multiplay_v1_Join, Join__Output as _sekai_multiplay_v1_Join__Output } from './sekai/multiplay/v1/Join';
import type { Kick as _sekai_multiplay_v1_Kick, Kick__Output as _sekai_multiplay_v1_Kick__Output } from './sekai/multiplay/v1/Kick';
import type { Leave as _sekai_multiplay_v1_Leave, Leave__Output as _sekai_multiplay_v1_Leave__Output } from './sekai/multiplay/v1/Leave';
import type { LiveResult as _sekai_multiplay_v1_LiveResult, LiveResult__Output as _sekai_multiplay_v1_LiveResult__Output } from './sekai/multiplay/v1/LiveResult';
import type { LiveStatuses as _sekai_multiplay_v1_LiveStatuses, LiveStatuses__Output as _sekai_multiplay_v1_LiveStatuses__Output } from './sekai/multiplay/v1/LiveStatuses';
import type { Loaded as _sekai_multiplay_v1_Loaded, Loaded__Output as _sekai_multiplay_v1_Loaded__Output } from './sekai/multiplay/v1/Loaded';
import type { LockMembers as _sekai_multiplay_v1_LockMembers, LockMembers__Output as _sekai_multiplay_v1_LockMembers__Output } from './sekai/multiplay/v1/LockMembers';
import type { Member as _sekai_multiplay_v1_Member, Member__Output as _sekai_multiplay_v1_Member__Output } from './sekai/multiplay/v1/Member';
import type { MemberStatus as _sekai_multiplay_v1_MemberStatus, MemberStatus__Output as _sekai_multiplay_v1_MemberStatus__Output } from './sekai/multiplay/v1/MemberStatus';
import type { MultiLiveClient as _sekai_multiplay_v1_MultiLiveClient, MultiLiveDefinition as _sekai_multiplay_v1_MultiLiveDefinition } from './sekai/multiplay/v1/MultiLive';
import type { Notice as _sekai_multiplay_v1_Notice, Notice__Output as _sekai_multiplay_v1_Notice__Output } from './sekai/multiplay/v1/Notice';
import type { OpenRoom as _sekai_multiplay_v1_OpenRoom, OpenRoom__Output as _sekai_multiplay_v1_OpenRoom__Output } from './sekai/multiplay/v1/OpenRoom';
import type { PickDifficulty as _sekai_multiplay_v1_PickDifficulty, PickDifficulty__Output as _sekai_multiplay_v1_PickDifficulty__Output } from './sekai/multiplay/v1/PickDifficulty';
import type { PickSong as _sekai_multiplay_v1_PickSong, PickSong__Output as _sekai_multiplay_v1_PickSong__Output } from './sekai/multiplay/v1/PickSong';
import type { Ping as _sekai_multiplay_v1_Ping, Ping__Output as _sekai_multiplay_v1_Ping__Output } from './sekai/multiplay/v1/Ping';
import type { PlayerResult as _sekai_multiplay_v1_PlayerResult, PlayerResult__Output as _sekai_multiplay_v1_PlayerResult__Output } from './sekai/multiplay/v1/PlayerResult';
import type { PlayerStatus as _sekai_multiplay_v1_PlayerStatus, PlayerStatus__Output as _sekai_multiplay_v1_PlayerStatus__Output } from './sekai/multiplay/v1/PlayerStatus';
import type { Pong as _sekai_multiplay_v1_Pong, Pong__Output as _sekai_multiplay_v1_Pong__Output } from './sekai/multiplay/v1/Pong';
import type { QuickMatch as _sekai_multiplay_v1_QuickMatch, QuickMatch__Output as _sekai_multiplay_v1_QuickMatch__Output } from './sekai/multiplay/v1/QuickMatch';
import type { Room as _sekai_multiplay_v1_Room, Room__Output as _sekai_multiplay_v1_Room__Output } from './sekai/multiplay/v1/Room';
import type { SendStamp as _sekai_multiplay_v1_SendStamp, SendStamp__Output as _sekai_multiplay_v1_SendStamp__Output } from './sekai/multiplay/v1/SendStamp';
import type { ServerMessage as _sekai_multiplay_v1_ServerMessage, ServerMessage__Output as _sekai_multiplay_v1_ServerMessage__Output } from './sekai/multiplay/v1/ServerMessage';
import type { SetReady as _sekai_multiplay_v1_SetReady, SetReady__Output as _sekai_multiplay_v1_SetReady__Output } from './sekai/multiplay/v1/SetReady';
import type { StampSent as _sekai_multiplay_v1_StampSent, StampSent__Output as _sekai_multiplay_v1_StampSent__Output } from './sekai/multiplay/v1/StampSent';
import type { StartLive as _sekai_multiplay_v1_StartLive, StartLive__Output as _sekai_multiplay_v1_StartLive__Output } from './sekai/multiplay/v1/StartLive';
import type { Welcome as _sekai_multiplay_v1_Welcome, Welcome__Output as _sekai_multiplay_v1_Welcome__Output } from './sekai/multiplay/v1/Welcome';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  sekai: {
    multiplay: {
      v1: {
        Award: EnumTypeDefinition
        ChartInfo: MessageTypeDefinition<_sekai_multiplay_v1_ChartInfo, _sekai_multiplay_v1_ChartInfo__Output>
        ClientMessage: MessageTypeDefinition<_sekai_multiplay_v1_ClientMessage, _sekai_multiplay_v1_ClientMessage__Output>
        Closed: MessageTypeDefinition<_sekai_multiplay_v1_Closed, _sekai_multiplay_v1_Closed__Output>
        CreatePrivate: MessageTypeDefinition<_sekai_multiplay_v1_CreatePrivate, _sekai_multiplay_v1_CreatePrivate__Output>
        FeverKind: EnumTypeDefinition
        FeverReport: MessageTypeDefinition<_sekai_multiplay_v1_FeverReport, _sekai_multiplay_v1_FeverReport__Output>
        FeverResult: MessageTypeDefinition<_sekai_multiplay_v1_FeverResult, _sekai_multiplay_v1_FeverResult__Output>
        FinishLive: MessageTypeDefinition<_sekai_multiplay_v1_FinishLive, _sekai_multiplay_v1_FinishLive__Output>
        Join: MessageTypeDefinition<_sekai_multiplay_v1_Join, _sekai_multiplay_v1_Join__Output>
        Kick: MessageTypeDefinition<_sekai_multiplay_v1_Kick, _sekai_multiplay_v1_Kick__Output>
        Leave: MessageTypeDefinition<_sekai_multiplay_v1_Leave, _sekai_multiplay_v1_Leave__Output>
        LiveResult: MessageTypeDefinition<_sekai_multiplay_v1_LiveResult, _sekai_multiplay_v1_LiveResult__Output>
        LiveStatuses: MessageTypeDefinition<_sekai_multiplay_v1_LiveStatuses, _sekai_multiplay_v1_LiveStatuses__Output>
        Loaded: MessageTypeDefinition<_sekai_multiplay_v1_Loaded, _sekai_multiplay_v1_Loaded__Output>
        LockMembers: MessageTypeDefinition<_sekai_multiplay_v1_LockMembers, _sekai_multiplay_v1_LockMembers__Output>
        Member: MessageTypeDefinition<_sekai_multiplay_v1_Member, _sekai_multiplay_v1_Member__Output>
        MemberStatus: MessageTypeDefinition<_sekai_multiplay_v1_MemberStatus, _sekai_multiplay_v1_MemberStatus__Output>
        MultiLive: SubtypeConstructor<typeof grpc.Client, _sekai_multiplay_v1_MultiLiveClient> & { service: _sekai_multiplay_v1_MultiLiveDefinition }
        Notice: MessageTypeDefinition<_sekai_multiplay_v1_Notice, _sekai_multiplay_v1_Notice__Output>
        OpenRoom: MessageTypeDefinition<_sekai_multiplay_v1_OpenRoom, _sekai_multiplay_v1_OpenRoom__Output>
        Phase: EnumTypeDefinition
        PickDifficulty: MessageTypeDefinition<_sekai_multiplay_v1_PickDifficulty, _sekai_multiplay_v1_PickDifficulty__Output>
        PickSong: MessageTypeDefinition<_sekai_multiplay_v1_PickSong, _sekai_multiplay_v1_PickSong__Output>
        Ping: MessageTypeDefinition<_sekai_multiplay_v1_Ping, _sekai_multiplay_v1_Ping__Output>
        PlayerResult: MessageTypeDefinition<_sekai_multiplay_v1_PlayerResult, _sekai_multiplay_v1_PlayerResult__Output>
        PlayerStatus: MessageTypeDefinition<_sekai_multiplay_v1_PlayerStatus, _sekai_multiplay_v1_PlayerStatus__Output>
        Pong: MessageTypeDefinition<_sekai_multiplay_v1_Pong, _sekai_multiplay_v1_Pong__Output>
        QuickMatch: MessageTypeDefinition<_sekai_multiplay_v1_QuickMatch, _sekai_multiplay_v1_QuickMatch__Output>
        Room: MessageTypeDefinition<_sekai_multiplay_v1_Room, _sekai_multiplay_v1_Room__Output>
        SendStamp: MessageTypeDefinition<_sekai_multiplay_v1_SendStamp, _sekai_multiplay_v1_SendStamp__Output>
        ServerMessage: MessageTypeDefinition<_sekai_multiplay_v1_ServerMessage, _sekai_multiplay_v1_ServerMessage__Output>
        SetReady: MessageTypeDefinition<_sekai_multiplay_v1_SetReady, _sekai_multiplay_v1_SetReady__Output>
        StampSent: MessageTypeDefinition<_sekai_multiplay_v1_StampSent, _sekai_multiplay_v1_StampSent__Output>
        StartLive: MessageTypeDefinition<_sekai_multiplay_v1_StartLive, _sekai_multiplay_v1_StartLive__Output>
        Welcome: MessageTypeDefinition<_sekai_multiplay_v1_Welcome, _sekai_multiplay_v1_Welcome__Output>
      }
    }
  }
}

