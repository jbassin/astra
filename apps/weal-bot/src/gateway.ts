/**
 * The discord.js gateway — the I/O shell around the tested core ([[handler.ts]]).
 * Wires a long-running Discord client: per-channel webhook discovery/creation, the
 * host-identity embed send, the best-effort dice-feed + v1 overlay broadcast, and the
 * internal speak API support. Untested glue (needs a live token — the acceptance-I
 * runtime check); the message pipeline it drives is unit-tested via injected deps.
 */

import { getLogger } from "@astra/observe";
import type { WealHost } from "@astra/ontology";
import {
  ChannelType,
  Client,
  type ColorResolvable,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  type Message,
  type TextChannel,
  type Webhook,
  WebhookClient,
} from "discord.js";
import type { WealStore } from "./db";
import { type HandlerDeps, handleMessage, type OutgoingMessage } from "./handler";
import { type OverlayPayload, randomSeed, type SeedInfo } from "./message";
import { EntropyRng } from "./roller";
import type { Roster } from "./roster";

const log = getLogger("astra.weal-bot");

export interface GatewayConfig {
  discordToken: string;
  /** Discord dice-feed webhook URL (rotated secret); empty disables it. */
  diceFeedUrl: string;
  /** weal-overlay v1 ingest URL; empty disables it. */
  feedWsUrl: string;
  /** Shared overlay token sent as `x-eerie-token`; empty = unauthenticated. */
  feedToken: string;
}

/** Internal speak-API request body (port of http.rs `SpeakArgs`). */
export interface SpeakArgs {
  host: string;
  guild: string;
  channel: string;
  message: string;
  img?: boolean;
}

export class Gateway {
  private readonly client: Client;
  private readonly webhooks = new Map<string, Webhook>();
  private feed: WebhookClient | null = null;
  private readonly funcs: [string, string][];
  private readonly rng = new EntropyRng();
  private seed: SeedInfo = { seed: randomSeed(), blameId: 1, blame: "Josh" };
  private readonly cfg: GatewayConfig;
  private readonly roster: Roster;
  private readonly hosts: Map<string, WealHost>;
  private readonly store: WealStore;

  // Not TS parameter properties — Node's `--experimental-strip-types` (R3, 0022 S5)
  // only erases types, it doesn't emit code, so a parameter property (which needs a
  // real `this.x = x` assignment generated) throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`
  // when Node runs this file directly. See [[secrets.ts]]'s SecretRef (S4).
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
      addFunc: (name, payload) => {
        this.funcs.push([name, payload]);
      },
      getSeed: () => this.seed,
      setSeed: (seed) => {
        this.seed = seed;
      },
      send: (msg) => this.sendEmbed(webhook, msg),
      broadcast: (payload, playerName) => this.broadcast(payload, playerName),
    };
  }

  private async sendEmbed(webhook: Webhook, msg: OutgoingMessage): Promise<void> {
    await webhook.send({
      username: msg.host.name,
      avatarURL: msg.host.avatar || undefined,
      embeds: [buildEmbed(msg)],
    });
  }

  /** Best-effort: the roll is already posted+saved, so a down feed must not fail it. */
  private async broadcast(payload: OverlayPayload, playerName: string): Promise<void> {
    try {
      if (this.feed === null && this.cfg.diceFeedUrl !== "") {
        this.feed = new WebhookClient({ url: this.cfg.diceFeedUrl });
      }
      if (this.feed !== null) {
        await this.feed.send({ username: playerName, content: `rolled a ${payload.total}` });
      }
      if (this.cfg.feedWsUrl !== "") {
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (this.cfg.feedToken !== "") headers["x-eerie-token"] = this.cfg.feedToken;
        const res = await fetch(this.cfg.feedWsUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`overlay ${res.status}`);
      }
    } catch (e) {
      log.emit({ severityText: "ERROR", body: `dice-feed broadcast failed (non-fatal): ${e}` });
    }
  }

  /** Internal speak API (http.rs `speak`): post a one-off message as a host. */
  async speak(args: SpeakArgs): Promise<void> {
    const channel = await this.client.channels.fetch(args.channel);
    if (channel === null || channel.type !== ChannelType.GuildText) {
      throw new Error("no known channel");
    }
    const webhook = await this.channelWebhook(channel);
    const host = this.hosts.get(args.host) ?? customHost(args.host);
    await webhook.send({
      username: host.name,
      avatarURL: host.avatar || undefined,
      embeds: [
        buildEmbed({
          host,
          contents: args.message,
          fields: [],
          thumbnail: args.img === false ? undefined : host.avatar || undefined,
        }),
      ],
    });
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

function customHost(slug: string): WealHost {
  return {
    slug,
    name: slug,
    color: "#CFBDDE",
    avatar: "",
    lines: { crit: [], good: [], okay: [], bad: [], fumble: [] },
  };
}

function buildEmbed(msg: OutgoingMessage): EmbedBuilder {
  const e = new EmbedBuilder().setColor(msg.host.color as ColorResolvable);
  if (msg.title !== undefined) e.setTitle(msg.title);
  if (msg.contents !== undefined && msg.contents !== "") e.setDescription(msg.contents);
  for (const [name, value] of msg.fields) e.addFields({ name, value, inline: false });
  if (msg.thumbnail !== undefined) e.setThumbnail(msg.thumbnail);
  if (msg.footer !== undefined) e.setFooter({ text: msg.footer });
  return e;
}
