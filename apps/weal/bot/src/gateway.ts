/**
 * The discord.js gateway — the I/O shell around the tested core ([[handler.ts]]).
 * Wires a long-running Discord client: per-channel webhook discovery/creation, the
 * host-identity embed send, and the best-effort overlay broadcast. Untested glue
 * (needs a live token — the acceptance-I runtime check); the message pipeline it
 * drives is unit-tested via injected deps.
 */

import { randomBytes } from "node:crypto";

import { getLogger } from "@astra/observe";
import type { WealHost } from "@astra/ontology";
import { type RollMessage, tokenHeaders } from "@astra/weal-wire";
import {
  AttachmentBuilder,
  ChannelType,
  Client,
  type ColorResolvable,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  type Message,
  type TextChannel,
  type Webhook,
} from "discord.js";

import type { WealStore } from "./db";
import { type HandlerDeps, handleMessage, type OutgoingMessage } from "./handler";
import { randomSeed, type SeedInfo } from "./message";
import { EntropyRng } from "./rng";
import type { Roster } from "./roster";

const log = getLogger("astra.weal-bot");

export interface GatewayConfig {
  discordToken: string;
  /** weal-overlay's ingest URL; empty disables the broadcast. */
  feedWsUrl: string;
  /** Shared overlay token (`@astra/weal-wire` token headers); empty = unauthenticated. */
  feedToken: string;
}

export class Gateway {
  private readonly client: Client;
  private readonly webhooks = new Map<string, Webhook>();
  private readonly funcs: [string, string][];
  private readonly rng = new EntropyRng();
  private seed: SeedInfo = { seed: randomSeed(), blameId: 1, blame: "Josh" };
  private readonly cfg: GatewayConfig;
  private readonly roster: Roster;
  private readonly hosts: Map<string, WealHost>;
  private readonly store: WealStore;

  constructor(
    cfg: GatewayConfig,
    roster: Roster,
    hosts: Map<string, WealHost>,
    store: WealStore,
    initFuncs: [string, string][],
  ) {
    this.cfg = cfg;
    this.roster = roster;
    this.hosts = hosts;
    this.store = store;
    this.funcs = [...initFuncs];
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });
  }

  async start(): Promise<void> {
    this.client.once(Events.ClientReady, (c) => {
      log.emit({ severityText: "INFO", body: `connected to discord as ${c.user.tag}` });
    });
    this.client.on(Events.MessageCreate, (message) => {
      this.onMessage(message).catch((e) => {
        log.emit({ severityText: "ERROR", body: `failed to handle message: ${e}` });
      });
    });
    await this.client.login(this.cfg.discordToken);
  }

  private host(slug: string): WealHost {
    const h = this.hosts.get(slug);
    if (h === undefined) throw new Error(`unknown host ${slug}`);
    return h;
  }

  private async onMessage(message: Message): Promise<void> {
    if (message.author.bot || message.author.id === this.client.user?.id) return;
    const profile = this.roster.get(message.author.id);
    if (profile === undefined) return; // no roster entry → ignore (faerrin parity)
    if (message.channel.type !== ChannelType.GuildText) return;
    const webhook = await this.channelWebhook(message.channel);
    await handleMessage(message.content, profile, this.buildDeps(webhook));
  }

  private buildDeps(webhook: Webhook): HandlerDeps {
    return {
      rng: this.rng,
      store: this.store,
      host: (slug) => this.host(slug),
      initFuncs: () => this.funcs,
      addFunc: (name, source) => {
        this.funcs.push([name, source]);
      },
      savedNames: () => [...new Set(this.funcs.map(([name]) => name))],
      seed: () => randomBytes(32),
      getSeed: () => this.seed,
      setSeed: (seed) => {
        this.seed = seed;
      },
      send: (msg) => this.sendEmbed(webhook, msg),
      broadcast: (payload) => this.broadcast(payload),
    };
  }

  private async sendEmbed(webhook: Webhook, msg: OutgoingMessage): Promise<void> {
    await webhook.send({
      username: msg.host.name,
      avatarURL: msg.host.avatar || undefined,
      embeds: [buildEmbed(msg)],
      // Plot PNGs ride as attachments the embed references (D32-16).
      files: msg.files?.map((f) => new AttachmentBuilder(Buffer.from(f.data), { name: f.name })),
    });
  }

  /** Best-effort: the roll is already posted+saved, so a down feed must not fail it. */
  private async broadcast(payload: RollMessage): Promise<void> {
    try {
      if (this.cfg.feedWsUrl !== "") {
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (this.cfg.feedToken !== "") Object.assign(headers, tokenHeaders(this.cfg.feedToken));
        const res = await fetch(this.cfg.feedWsUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`overlay ${res.status}`);
      }
    } catch (e) {
      log.emit({ severityText: "ERROR", body: `overlay broadcast failed (non-fatal): ${e}` });
    }
  }

  private async channelWebhook(channel: TextChannel): Promise<Webhook> {
    const cached = this.webhooks.get(channel.id);
    if (cached !== undefined) return cached;
    const existing = (await channel.fetchWebhooks()).find(
      (w) => w.token != null && w.owner?.id === this.client.user?.id,
    );
    const webhook = existing ?? (await channel.createWebhook({ name: "faceless-host" }));
    this.webhooks.set(channel.id, webhook);
    return webhook;
  }
}

function buildEmbed(msg: OutgoingMessage): EmbedBuilder {
  const e = new EmbedBuilder().setColor(msg.host.color as ColorResolvable);
  if (msg.title !== undefined) e.setTitle(msg.title);
  if (msg.contents !== undefined && msg.contents !== "") e.setDescription(msg.contents);
  for (const [name, value] of msg.fields) e.addFields({ name, value, inline: false });
  if (msg.thumbnail !== undefined) e.setThumbnail(msg.thumbnail);
  if (msg.image !== undefined) e.setImage(msg.image);
  if (msg.footer !== undefined) e.setFooter({ text: msg.footer });
  return e;
}
