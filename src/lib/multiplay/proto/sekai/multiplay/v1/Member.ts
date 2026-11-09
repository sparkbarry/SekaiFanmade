// Original file: proto/sekai/multiplay/v1/multiplay.proto


export interface Member {
  'userId'?: (string);
  'nickname'?: (string);
  'avatarUrl'?: (string);
  'slot'?: (number);
  'connected'?: (boolean);
  'picked'?: (boolean);
  'pickedChartId'?: (string);
  'chartId'?: (string);
  'ready'?: (boolean);
  'loaded'?: (boolean);
  'playing'?: (boolean);
  'finished'?: (boolean);
}

export interface Member__Output {
  'userId': (string);
  'nickname': (string);
  'avatarUrl': (string);
  'slot': (number);
  'connected': (boolean);
  'picked': (boolean);
  'pickedChartId': (string);
  'chartId': (string);
  'ready': (boolean);
  'loaded': (boolean);
  'playing': (boolean);
  'finished': (boolean);
}
