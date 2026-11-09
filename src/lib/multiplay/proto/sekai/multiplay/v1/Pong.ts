// Original file: proto/sekai/multiplay/v1/multiplay.proto

import type { Long } from '@grpc/proto-loader';

export interface Pong {
  'clientTimeMs'?: (number | string | Long);
  'serverTimeMs'?: (number | string | Long);
}

export interface Pong__Output {
  'clientTimeMs': (number);
  'serverTimeMs': (number);
}
