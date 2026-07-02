/**
 * In-process VoiceAdapter over @discordjs/voice (plan D1). Runs inside the Bun
 * server — Bun handles voice fine once Discord's DAVE/E2EE requirement is met
 * (@discordjs/voice ≥0.19 + @snazzah/davey); the earlier "Bun can't do voice"
 * conclusion was actually a 4017 DAVE close on the old 0.18. Pipes the source
 * through ffmpeg (prism-media) with the loudness/limiter filter into a Raw Opus
 * resource.
 */

import { getLogger, getTracer } from "@astra/observe";
import {
  AudioPlayerStatus,
  type AudioResource,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  StreamType,
  type VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { SpanStatusCode } from "@opentelemetry/api";
import type { Client } from "discord.js";
import prism from "prism-media";
import type { TrackEndReason, VoiceAdapter } from "./voice";

const tracer = getTracer("astra.orator-backend");
const log = getLogger("astra.orator-backend");

export class DiscordVoiceAdapter implements VoiceAdapter {
  private connection: VoiceConnection | null = null;
  private channelId: string | null = null;
  private resource: AudioResource | null = null;
  private endCb: ((reason: TrackEndReason) => void) | null = null;
  private suppressEnd = false;
  private readonly player = createAudioPlayer();
  // Not TS parameter properties (`constructor(private readonly x, …)`) — Node's
  // `--experimental-strip-types` (R3, 0022 S8) only erases types, it doesn't emit
  // code, so a parameter property (which needs a real `this.x = x` assignment
  // generated) throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` when Node runs this file
  // directly (see [[weal-bot gateway.ts]], S5).
  private readonly client: Client;
  private readonly guildId: string;

  constructor(client: Client, guildId: string) {
    this.client = client;
    this.guildId = guildId;
    this.player.on(AudioPlayerStatus.Idle, () => this.fireEnd("finished"));
    // Diagnostic: surface player buffering/underruns the same way the voice
    // connection already logs its state. A `playing → buffering → playing`
    // blip mid-track means the ffmpeg/opus pipe underran (startup ramp), not a
    // voice reconnect (those show up on the connection's stateChange log).
    this.player.on("stateChange", (o, n) => {
      if (o.status !== n.status) console.log(`[orator] audio player ${o.status} → ${n.status}`);
    });
    this.player.on("error", (err) => {
      log.emit({ severityText: "ERROR", body: `audio player error: ${err?.message ?? err}` });
      this.fireEnd("error");
    });
  }

  private fireEnd(reason: TrackEndReason): void {
    const cb = this.endCb;
    this.endCb = null;
    this.resource = null;
    if (this.suppressEnd) {
      this.suppressEnd = false;
      return;
    }
    cb?.(reason);
  }

  async join(channelId: string): Promise<void> {
    await tracer.startActiveSpan(
      "orator.voice.join",
      { attributes: { "orator.channel_id": channelId } },
      async (span) => {
        try {
          // Gateway-cached guild — its voiceAdapterCreator is wired to the live shard.
          const guild = this.client.guilds.cache.get(this.guildId);
          if (!guild) throw new Error(`guild ${this.guildId} not in gateway cache`);
          log.emit({ severityText: "INFO", body: `joining voice channel ${channelId}…` });
          const conn = joinVoiceChannel({
            channelId,
            guildId: this.guildId,
            adapterCreator: guild.voiceAdapterCreator,
          });
          if (conn !== this.connection) {
            conn.on("stateChange", (o, n) =>
              console.log(`[orator] voice connection ${o.status} → ${n.status}`),
            );
            conn.on("error", (err) =>
              log.emit({
                severityText: "ERROR",
                body: `voice connection error: ${err?.message ?? err}`,
              }),
            );
          }
          this.connection = conn;
          conn.subscribe(this.player);
          try {
            await entersState(conn, VoiceConnectionStatus.Ready, 20_000);
          } catch (err) {
            conn.destroy();
            this.connection = null;
            this.channelId = null;
            throw new Error(`voice_connect_timeout: ${(err as Error).message}`);
          }
          this.channelId = channelId;
          log.emit({ severityText: "INFO", body: `voice connection READY in ${channelId}` });
        } catch (err) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
          throw err;
        } finally {
          span.end();
        }
      },
    );
  }

  leave(): void {
    this.suppressEnd = true;
    this.player.stop(true);
    this.connection?.destroy();
    this.connection = null;
    this.channelId = null;
  }

  isConnected(): boolean {
    return this.connection !== null && this.channelId !== null;
  }

  currentChannelId(): string | null {
    return this.channelId;
  }

  async play(
    filePath: string,
    filter: string,
    onEnd: (reason: TrackEndReason) => void,
  ): Promise<void> {
    if (this.resource) this.suppressEnd = true; // replacing — no spurious end
    // ffmpeg decodes → applies the loudness/limiter filter → encodes Opus
    // natively (libopus) into an Ogg-Opus stream. Encoding Opus in ffmpeg
    // (far faster than realtime) keeps opusscript out of the realtime hot path,
    // so the pipe never starves at startup — which was causing the ~1s-then-gap
    // underrun. opusscript stays a dep but is no longer used for playback.
    const args = ["-analyzeduration", "0", "-loglevel", "0", "-i", filePath];
    if (filter) args.push("-af", filter);
    args.push("-c:a", "libopus", "-b:a", "128k", "-ar", "48000", "-ac", "2", "-f", "opus");
    const transcoder = new prism.FFmpeg({ args });
    this.resource = createAudioResource(transcoder, { inputType: StreamType.OggOpus });
    this.endCb = onEnd;
    this.player.play(this.resource);
  }

  pause(): void {
    this.player.pause();
  }
  resume(): void {
    this.player.unpause();
  }
  stopAudio(): void {
    this.suppressEnd = true;
    this.player.stop(true);
  }
  positionMs(): number {
    return this.resource?.playbackDuration ?? 0;
  }
}
