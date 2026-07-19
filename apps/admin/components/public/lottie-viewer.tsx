"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import type { DotLottie } from "@lottiefiles/dotlottie-react";
import { Pause, Play, RotateCcw, Square } from "lucide-react";
import { useEffect, useState } from "react";

const ASSET_SRC = "/icons/d78ba706-9c26-4246-8ea6-0ca5ec33b312.lottie";

export function LottieViewer() {
  const [player, setPlayer] = useState<DotLottie | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(255);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!player) return;

    const onFrame = (event: { currentFrame: number }) => setFrame(event.currentFrame);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onStop = () => {
      setIsPlaying(false);
      setFrame(0);
    };

    setTotalFrames(player.totalFrames || 255);
    setFrame(player.currentFrame || 0);
    setIsPlaying(player.isPlaying);
    player.addEventListener("frame", onFrame);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("stop", onStop);

    return () => {
      player.removeEventListener("frame", onFrame);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("stop", onStop);
    };
  }, [player]);

  const togglePlayback = () => {
    if (!player) return;
    if (player.isPlaying) player.pause();
    else player.play();
  };

  const handleFrameChange = (value: string) => {
    const nextFrame = Number(value);
    setFrame(nextFrame);
    player?.setFrame(nextFrame);
  };

  const handleSpeedChange = (value: string) => {
    const nextSpeed = Number(value);
    setSpeed(nextSpeed);
    player?.setSpeed(nextSpeed);
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl flex-col px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Animation lab</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">DotLottie viewer</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
          Preview the hero animation frame by frame, or let it run at different speeds.
        </p>
      </div>

      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-h-[32rem] items-center justify-center overflow-hidden rounded-2xl border bg-white p-4 shadow-sm sm:p-8">
          <div className="h-full min-h-[30rem] w-full max-w-[34rem]">
            <DotLottieReact
              src={ASSET_SRC}
              autoplay
              loop
              renderConfig={{ autoResize: true }}
              dotLottieRefCallback={setPlayer}
              className="h-full w-full"
            />
          </div>
        </div>

        <aside className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm">
          <div>
            <p className="text-sm font-semibold">Playback controls</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              The animation has {totalFrames.toLocaleString()} frames.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={togglePlayback}
              className="flex h-10 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90"
              aria-label={isPlaying ? "Pause animation" : "Play animation"}
            >
              {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
            <button
              type="button"
              onClick={() => player?.stop()}
              className="flex h-10 items-center justify-center rounded-lg border transition-colors hover:bg-muted"
              aria-label="Stop animation"
            >
              <Square className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => player?.setFrame(0)}
              className="flex h-10 items-center justify-center rounded-lg border transition-colors hover:bg-muted"
              aria-label="Reset to first frame"
            >
              <RotateCcw className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => player?.setFrame(Math.max(0, totalFrames - 1))}
              className="flex h-10 items-center justify-center rounded-lg border text-xs font-medium transition-colors hover:bg-muted"
              aria-label="Jump to last frame"
            >
              End
            </button>
          </div>

          <label className="mt-8 block text-xs font-medium" htmlFor="lottie-frame">
            Frame <span className="font-mono text-muted-foreground">{Math.round(frame)}</span>
          </label>
          <input
            id="lottie-frame"
            className="mt-3 w-full accent-primary"
            type="range"
            min="0"
            max={Math.max(1, totalFrames - 1)}
            step="1"
            value={Math.min(frame, Math.max(1, totalFrames - 1))}
            onChange={(event) => handleFrameChange(event.target.value)}
          />

          <label className="mt-8 block text-xs font-medium" htmlFor="lottie-speed">
            Speed <span className="font-mono text-muted-foreground">{speed}×</span>
          </label>
          <select
            id="lottie-speed"
            value={speed}
            onChange={(event) => handleSpeedChange(event.target.value)}
            className="mt-3 h-10 rounded-lg border bg-background px-3 text-sm"
          >
            <option value="0.25">0.25×</option>
            <option value="0.5">0.5×</option>
            <option value="1">1×</option>
            <option value="1.5">1.5×</option>
            <option value="2">2×</option>
          </select>

          <div className="mt-auto border-t pt-5 text-xs leading-5 text-muted-foreground">
            Asset: <span className="font-mono">d78ba706…b312.lottie</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
