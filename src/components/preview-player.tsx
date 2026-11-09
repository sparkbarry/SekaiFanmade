'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';

const PREVIEW_SECONDS = 20;

/** Plays the chart's audio from its preview start time for a short while. */
export function PreviewPlayer({ src, start }: { src: string; start: number }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const onTime = () => {
      if (el.currentTime >= start + PREVIEW_SECONDS) {
        el.pause();
      }
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onError = () => setError(true);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('pause', onPause);
    el.addEventListener('play', onPlay);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('error', onError);
    };
  }, [start]);

  const toggle = async () => {
    const el = audio.current;
    if (!el) return;
    if (playing) {
      el.pause();
      return;
    }
    if (el.currentTime < start || el.currentTime >= start + PREVIEW_SECONDS) el.currentTime = start;
    try {
      await el.play();
    } catch {
      setError(true);
    }
  };

  return (
    <>
      <audio ref={audio} src={src} preload="none" />
      <Button variant="outline" onClick={toggle} disabled={error} aria-pressed={playing}>
        {error ? '无法播放' : playing ? '■ 停止试听' : '▶ 试听'}
      </Button>
    </>
  );
}
