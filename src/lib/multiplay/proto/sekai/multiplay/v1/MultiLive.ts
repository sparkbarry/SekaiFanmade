// Original file: proto/sekai/multiplay/v1/multiplay.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { ClientMessage as _sekai_multiplay_v1_ClientMessage, ClientMessage__Output as _sekai_multiplay_v1_ClientMessage__Output } from '../../../sekai/multiplay/v1/ClientMessage';
import type { ServerMessage as _sekai_multiplay_v1_ServerMessage, ServerMessage__Output as _sekai_multiplay_v1_ServerMessage__Output } from '../../../sekai/multiplay/v1/ServerMessage';

export interface MultiLiveClient extends grpc.Client {
  Connect(metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientDuplexStream<_sekai_multiplay_v1_ClientMessage, _sekai_multiplay_v1_ServerMessage__Output>;
  Connect(options?: grpc.CallOptions): grpc.ClientDuplexStream<_sekai_multiplay_v1_ClientMessage, _sekai_multiplay_v1_ServerMessage__Output>;
  connect(metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientDuplexStream<_sekai_multiplay_v1_ClientMessage, _sekai_multiplay_v1_ServerMessage__Output>;
  connect(options?: grpc.CallOptions): grpc.ClientDuplexStream<_sekai_multiplay_v1_ClientMessage, _sekai_multiplay_v1_ServerMessage__Output>;
  
}

export interface MultiLiveHandlers extends grpc.UntypedServiceImplementation {
  Connect: grpc.handleBidiStreamingCall<_sekai_multiplay_v1_ClientMessage__Output, _sekai_multiplay_v1_ServerMessage>;
  
}

export interface MultiLiveDefinition extends grpc.ServiceDefinition {
  Connect: MethodDefinition<_sekai_multiplay_v1_ClientMessage, _sekai_multiplay_v1_ServerMessage, _sekai_multiplay_v1_ClientMessage__Output, _sekai_multiplay_v1_ServerMessage__Output>
}
