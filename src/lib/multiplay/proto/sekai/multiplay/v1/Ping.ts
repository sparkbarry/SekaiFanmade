// Original file: proto/sekai/multiplay/v1/multiplay.proto

import type { Long } from '@grpc/proto-loader';

export interface Ping {
  'clientTimeMs'?: (number | string | Long);
}

export interface Ping__Output {
  'clientTimeMs': (number);
}
