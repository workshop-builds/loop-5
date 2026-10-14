/**
 * Rete del costruttore (AUDIT.md F-04). Nel repo di ogni progetto sta in .github/builder/egress.ts (il guardiano lo
 * copia da qui, con cli.ts e session.ts); lo usa job.sh prima che l'utente "builder" esegua qualsiasi cosa.
 *
 *   node --import tsx egress.ts rules <uid> <router-url>   regole di nftables per l'utente separato, su stdout      (runner)
 *   node --import tsx egress.ts serve <router-url>         il suo resolver DNS su 127.0.0.2:53                       (root)
 *   node --import tsx egress.ts check <router-url>         il resolver risponde e risolve il router                  (runner)
 *   node --import tsx egress.ts report <blocked.json>      domini e indirizzi bloccati, in JSON (stdin: nft -j list)  (runner)
 *
 * Allowlist, non proxy. L'utente separato (agente, install, test e build del progetto) raggiunge solo quello che serve
 * alle build: il registro npm, GitHub e il router, sulla porta 443 (o quella del router). Come:
 * - nftables, per il suo uid (meta skuid): DNS solo verso 127.0.0.2:53; loopback libero (server di sviluppo e test);
 *   verso fuori solo gli indirizzi nei set allow4/allow6, sulle porte ammesse; tutto il resto rifiutato, contato nei
 *   set blocked4/blocked6 (indirizzo e porta) e scritto nel log del kernel (prefisso "builder-egress ").
 * - Il resolver di 127.0.0.2 (processo di root, fuori dalla sandbox) inoltra al resolver del sistema solo le domande sui
 *   nomi ammessi, e mette gli indirizzi delle risposte nei set prima di rispondere. Agli altri nomi risponde NXDOMAIN e
 *   li registra (blocked.json): la domanda non lascia mai la macchina, quindi neanche i dati nascosti nel nome.
 * - La sandbox dell'utente separato vede come /etc/resolv.conf solo 127.0.0.2 e non vede il socket di
 *   systemd-resolved (job.sh as_builder).
 * Il router è ammesso solo con il suo nome esatto: il suo dominio (sslip.io) risolve qualsiasi indirizzo.
 * Limiti noti: gli indirizzi ammessi sono di CDN condivise (Cloudflare per npm, Fastly e Azure per GitHub), quindi una
 * connessione a quegli indirizzi con il nome di un altro sito della stessa CDN passa; GitHub stesso resta raggiungibile
 * (con credenziali portate dall'esterno, l'agente potrebbe scriverci).
 */
import { spawn } from 'node:child_process';
import dgram from 'node:dgram';
import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EGRESS_TABLE = 'builder_egress';
export const RESOLVER_ADDRESS = '127.0.0.2';
export const EGRESS_DIR = '/run/builder-egress';
/** Nomi esatti: il registro npm (pacchetti e tarball). */
export const ALLOWED_NAMES: readonly string[] = ['registry.npmjs.org'];
/** Zone intere: GitHub (dipendenze da git, codeload, binari dei release su githubusercontent). */
export const ALLOWED_ZONES: readonly string[] = ['github.com', 'githubusercontent.com'];
/** Nomi bloccati tenuti uno per uno; oltre si contano soltanto. */
export const MAX_BLOCKED_NAMES = 200;
const MAX_INFLIGHT = 256;
const UPSTREAM_TIMEOUT_MS = 5_000;

const NOERROR = 0;
const FORMERR = 1;
const SERVFAIL = 2;
const NXDOMAIN = 3;
const NOTIMP = 4;
const REFUSED = 5;
/** IXFR, AXFR, ANY: mai inoltrate. */
const REFUSED_TYPES = new Set([251, 252, 255]);
const TYPE_NAMES: Readonly<Record<number, string>> = { 1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR', 15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 64: 'SVCB', 65: 'HTTPS' };
const typeName = (type: number) => TYPE_NAMES[type] ?? `TYPE${type}`;

export interface Allowlist {
  /** Nomi ammessi esatti, in minuscolo. */
  names: ReadonlySet<string>;
  /** Zone ammesse: il nome stesso e tutti i suoi sottodomini. */
  zones: readonly string[];
  /** Porte TCP ammesse verso gli indirizzi risolti. */
  ports: readonly number[];
  /** Indirizzi IPv4 ammessi da subito (il router scritto come indirizzo). */
  addresses: readonly string[];
}

/** Stessa regola di job.sh e del template: https, host e percorso semplici. */
const ROUTER_URL = /^https:\/\/([A-Za-z0-9.-]+)(?::([0-9]+))?(\/[A-Za-z0-9._/-]*)?$/;

/** L'allowlist del costruttore: registro npm, GitHub e il router di questa sessione (nome esatto e porta). */
export function egressAllowlist(routerUrl: string): Allowlist {
  const match = ROUTER_URL.exec(routerUrl);
  if (!match) throw new Error('URL del router non valido');
  const host = match[1]!.toLowerCase().replace(/\.$/, '');
  const port = match[2] === undefined ? 443 : Number(match[2]);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('porta del router non valida');
  const literal = net.isIPv4(host);
  return {
    names: new Set([...ALLOWED_NAMES, ...(literal ? [] : [host])]),
    zones: ALLOWED_ZONES,
    ports: [...new Set([443, port])],
    addresses: literal ? [host] : [],
  };
}

export function isAllowed(name: string, list: Allowlist): boolean {
  const n = name.toLowerCase().replace(/\.$/, '');
  return list.names.has(n) || list.zones.some((zone) => n === zone || n.endsWith(`.${zone}`));
}

/** Le regole di nftables (nft -f) per l'utente separato. */
export function nftRules(input: { uid: number; allow: Allowlist; table?: string; resolver?: string }): string {
  const { uid, allow } = input;
  const table = input.table ?? EGRESS_TABLE;
  const resolver = input.resolver ?? RESOLVER_ADDRESS;
  if (!Number.isSafeInteger(uid) || uid < 1 || uid > 2 ** 31 - 2) throw new Error('uid non valido');
  if (!/^[a-z][a-z0-9_]{0,30}$/.test(table)) throw new Error('nome della tabella non valido');
  if (!net.isIPv4(resolver) || !resolver.startsWith('127.')) throw new Error('il resolver deve essere su loopback');
  if (!allow.ports.length || allow.ports.some((p) => !Number.isSafeInteger(p) || p < 1 || p > 65535)) throw new Error('porte non valide');
  if (allow.addresses.some((a) => !net.isIPv4(a))) throw new Error('indirizzi non validi');
  const ports = [...new Set(allow.ports)].join(', ');
  const initial = allow.addresses.length ? ` elements = { ${[...new Set(allow.addresses)].join(', ')} };` : '';
  return `table inet ${table} {
  set allow4 { type ipv4_addr;${initial} }
  set allow6 { type ipv6_addr; }
  set blocked4 { type ipv4_addr . inet_service; flags dynamic; size 4096; counter; }
  set blocked6 { type ipv6_addr . inet_service; flags dynamic; size 4096; counter; }
  chain output {
    type filter hook output priority filter; policy accept;
    meta skuid ${uid} jump builder
  }
  chain builder {
    ip daddr ${resolver} meta l4proto { tcp, udp } th dport 53 accept
    meta l4proto { tcp, udp } th dport 53 goto blocked
    ip daddr 127.0.0.0/8 accept
    ip6 daddr ::1 accept
    ip daddr @allow4 tcp dport { ${ports} } accept
    ip6 daddr @allow6 tcp dport { ${ports} } accept
    goto blocked
  }
  chain blocked {
    meta l4proto { tcp, udp } update @blocked4 { ip daddr . th dport }
    meta l4proto { tcp, udp } update @blocked6 { ip6 daddr . th dport }
    limit rate 10/second log prefix "builder-egress " level warn
    reject with icmpx admin-prohibited
  }
}
`;
}

// --- Messaggi DNS (RFC 1035): solo quello che serve, con tutti i controlli di lunghezza.

interface Name {
  labels: Buffer[];
  /** Primo byte dopo il nome nel punto in cui inizia (dopo il primo puntatore, se c'è). */
  next: number;
}

function readName(msg: Buffer, start: number): Name | null {
  const labels: Buffer[] = [];
  let offset = start;
  let next = -1;
  let jumps = 0;
  let length = 1;
  for (;;) {
    if (offset >= msg.length) return null;
    const len = msg[offset]!;
    if (len === 0) {
      if (next < 0) next = offset + 1;
      return { labels, next };
    }
    if ((len & 0xc0) === 0xc0) {
      if (offset + 1 >= msg.length || ++jumps > 32) return null;
      if (next < 0) next = offset + 2;
      offset = ((len & 0x3f) << 8) | msg[offset + 1]!;
      continue;
    }
    if (len & 0xc0) return null;
    if (offset + 1 + len > msg.length) return null;
    length += len + 1;
    if (length > 255) return null;
    labels.push(msg.subarray(offset + 1, offset + 1 + len));
    offset += 1 + len;
  }
}

/** Il nome come testo stampabile: lettere, cifre, "-" e "_" in minuscolo; ogni altro byte diventa "?" (nome non valido). */
function nameText(labels: Buffer[]): { name: string; valid: boolean } {
  let valid = labels.length > 0;
  const text = labels.map((label) =>
    Array.from(label, (byte) => {
      const ch = String.fromCharCode(byte).toLowerCase();
      if (/[a-z0-9_-]/.test(ch)) return ch;
      valid = false;
      return '?';
    }).join(''),
  );
  return { name: text.join('.') || '.', valid };
}

export interface Question {
  id: number;
  opcode: number;
  name: string;
  /** Il nome ha solo caratteri da nome di host. */
  valid: boolean;
  type: number;
  cls: number;
  /** Fine della sezione della domanda. */
  end: number;
}

/** La domanda di una query (una sola), o null se il messaggio non è una query leggibile. */
export function parseQuery(msg: Buffer): Question | null {
  if (msg.length < 12) return null;
  const flags = msg.readUInt16BE(2);
  if (flags & 0x8000 || msg.readUInt16BE(4) !== 1) return null;
  const parsed = readName(msg, 12);
  if (!parsed || parsed.next + 4 > msg.length) return null;
  const { name, valid } = nameText(parsed.labels);
  return { id: msg.readUInt16BE(0), opcode: (flags >> 11) & 0xf, name, valid, type: msg.readUInt16BE(parsed.next), cls: msg.readUInt16BE(parsed.next + 2), end: parsed.next + 4 };
}

/** Una risposta senza record: stesso ID, la domanda ripetuta (se leggibile), il codice dato. */
export function reply(query: Buffer, question: Question | null, rcode: number): Buffer {
  const header = Buffer.alloc(12);
  const flags = query.readUInt16BE(2);
  header.writeUInt16BE(query.readUInt16BE(0), 0);
  header.writeUInt16BE(0x8000 | (flags & 0x7800) | (flags & 0x0100) | 0x0080 | rcode, 2);
  if (!question) return header;
  header.writeUInt16BE(1, 4);
  return Buffer.concat([header, query.subarray(12, question.end)]);
}

function ipv6Text(bytes: Buffer): string {
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(bytes.readUInt16BE(i).toString(16));
  return groups.join(':');
}

/** Gli indirizzi A e AAAA della sezione delle risposte, o null se la risposta non è leggibile o non è per questo ID. */
export function answerAddresses(msg: Buffer, id: number): { v4: string[]; v6: string[] } | null {
  if (msg.length < 12 || msg.readUInt16BE(0) !== id || !(msg.readUInt16BE(2) & 0x8000)) return null;
  const v4: string[] = [];
  const v6: string[] = [];
  let offset = 12;
  for (let i = msg.readUInt16BE(4); i > 0; i--) {
    const name = readName(msg, offset);
    if (!name || name.next + 4 > msg.length) return null;
    offset = name.next + 4;
  }
  for (let i = msg.readUInt16BE(6); i > 0; i--) {
    const name = readName(msg, offset);
    if (!name || name.next + 10 > msg.length) return null;
    offset = name.next;
    const type = msg.readUInt16BE(offset);
    const cls = msg.readUInt16BE(offset + 2);
    const rdlength = msg.readUInt16BE(offset + 8);
    offset += 10;
    if (offset + rdlength > msg.length) return null;
    if (cls === 1 && type === 1 && rdlength === 4) v4.push(Array.from(msg.subarray(offset, offset + 4)).join('.'));
    if (cls === 1 && type === 28 && rdlength === 16) v6.push(ipv6Text(msg.subarray(offset, offset + 16)));
    offset += rdlength;
  }
  return { v4, v6 };
}

// --- Registro dei nomi bloccati.

export interface BlockedDomain {
  name: string;
  count: number;
  types: string[];
}
export interface BlockedFile {
  domains: BlockedDomain[];
  /** Domande bloccate oltre i primi MAX_BLOCKED_NAMES nomi. */
  otherQueries: number;
}

/** I nomi bloccati con quante volte e per che tipo, in un file JSON scritto per intero (rename) poco dopo ogni novità. */
export class BlockedLog {
  private readonly names = new Map<string, { count: number; types: Set<string> }>();
  private others = 0;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly file: string | null,
    private readonly print: (line: string) => void = (line) => console.log(line),
  ) {
    if (file && existsSync(file)) {
      // Dopo un riavvio del resolver si riparte dai conti già scritti.
      const saved = readBlockedFile(file);
      for (const d of saved.domains) this.names.set(d.name, { count: d.count, types: new Set(d.types) });
      this.others = saved.otherQueries;
    }
  }

  add(name: string, type: number): void {
    let entry = this.names.get(name);
    if (!entry) {
      if (this.names.size >= MAX_BLOCKED_NAMES) {
        this.others++;
        this.schedule();
        return;
      }
      entry = { count: 0, types: new Set() };
      this.names.set(name, entry);
      this.print(`blocked ${name} ${typeName(type)}`);
    }
    entry.count++;
    entry.types.add(typeName(type));
    this.schedule();
  }

  snapshot(): BlockedFile {
    return { domains: [...this.names].map(([name, e]) => ({ name, count: e.count, types: [...e.types].sort() })), otherQueries: this.others };
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.file) return;
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(this.snapshot())}\n`, { mode: 0o644 });
    renameSync(tmp, this.file);
  }

  private schedule(): void {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), 250);
  }
}

const BLOCKED_NAME = /^[a-z0-9_?-]{1,63}(\.[a-z0-9_?-]{1,63})*$|^\.$/;

/** blocked.json letto con i controlli: solo nomi nella forma che scrive BlockedLog. */
export function readBlockedFile(file: string): BlockedFile {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { domains: [], otherQueries: 0 };
  }
  const r = (raw ?? {}) as { domains?: unknown; otherQueries?: unknown };
  const domains = (Array.isArray(r.domains) ? r.domains : [])
    .filter((d): d is BlockedDomain => {
      const e = d as BlockedDomain;
      return !!e && typeof e.name === 'string' && e.name.length <= 253 && BLOCKED_NAME.test(e.name) && Number.isSafeInteger(e.count) && e.count > 0 && Array.isArray(e.types) && e.types.every((t) => typeof t === 'string' && /^[A-Z0-9]{1,10}$/.test(t));
    })
    .slice(0, MAX_BLOCKED_NAMES);
  const others = Number.isSafeInteger(r.otherQueries) && (r.otherQueries as number) >= 0 ? (r.otherQueries as number) : 0;
  return { domains, otherQueries: others };
}

// --- Il resolver.

export interface ResolverOptions {
  allow: Allowlist;
  upstream: { host: string; port: number };
  /** Aggiunge gli indirizzi ai set di nftables; deve finire prima della risposta. */
  addAddresses: (family: 4 | 6, addresses: string[]) => Promise<void>;
  blocked: BlockedLog;
  log?: (line: string) => void;
  timeoutMs?: number;
}

function forwardUdp(query: Buffer, upstream: { host: string; port: number }, timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket(net.isIPv6(upstream.host) ? 'udp6' : 'udp4');
    let finished = false;
    const done = (err: Error | null, msg?: Buffer) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.close();
      if (err) reject(err);
      else resolve(msg!);
    };
    const timer = setTimeout(() => done(new Error('timeout')), timeoutMs);
    socket.on('error', (err) => done(err));
    socket.on('message', (msg) => {
      if (msg.length >= 12 && msg.readUInt16BE(0) === query.readUInt16BE(0)) done(null, msg);
    });
    socket.connect(upstream.port, upstream.host, () => socket.send(query, (err) => err && done(err)));
  });
}

function forwardTcp(query: Buffer, upstream: { host: string; port: number }, timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: upstream.host, port: upstream.port });
    let data = Buffer.alloc(0);
    let finished = false;
    const done = (err: Error | null, msg?: Buffer) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(msg!);
    };
    socket.setTimeout(timeoutMs, () => done(new Error('timeout')));
    socket.on('error', (err) => done(err));
    socket.on('close', () => done(new Error('chiusa')));
    socket.on('connect', () => {
      const length = Buffer.alloc(2);
      length.writeUInt16BE(query.length);
      socket.write(Buffer.concat([length, query]));
    });
    socket.on('data', (chunk) => {
      data = Buffer.concat([data, chunk]);
      if (data.length >= 2 && data.length >= 2 + data.readUInt16BE(0)) done(null, data.subarray(2, 2 + data.readUInt16BE(0)));
    });
  });
}

/** La risposta a una query del costruttore (null: nessuna risposta). */
export async function answer(query: Buffer, transport: 'udp' | 'tcp', o: ResolverOptions): Promise<Buffer | null> {
  const q = parseQuery(query);
  if (!q) return query.length >= 12 && !(query.readUInt16BE(2) & 0x8000) ? reply(query, null, FORMERR) : null;
  if (q.opcode !== 0) return reply(query, q, NOTIMP);
  if (!q.valid || !isAllowed(q.name, o.allow)) {
    o.blocked.add(q.name, q.type);
    return reply(query, q, NXDOMAIN);
  }
  if (q.cls !== 1 || REFUSED_TYPES.has(q.type)) return reply(query, q, REFUSED);
  let response: Buffer;
  try {
    response = await (transport === 'udp' ? forwardUdp : forwardTcp)(query, o.upstream, o.timeoutMs ?? UPSTREAM_TIMEOUT_MS);
  } catch {
    return reply(query, q, SERVFAIL);
  }
  const addresses = answerAddresses(response, q.id);
  if (!addresses) return reply(query, q, SERVFAIL);
  try {
    if (addresses.v4.length) await o.addAddresses(4, addresses.v4);
    if (addresses.v6.length) await o.addAddresses(6, addresses.v6);
  } catch (err) {
    // Senza gli indirizzi nei set la connessione non passerebbe comunque: meglio dirlo subito.
    o.log?.(`nft: ${err instanceof Error ? err.message : 'errore'}`);
    return reply(query, q, SERVFAIL);
  }
  return response;
}

export interface Resolver {
  port: number;
  close(): Promise<void>;
}

/** Il resolver su UDP e TCP, stesso indirizzo e stessa porta (porta 0: la sceglie UDP, TCP la riusa). */
export async function startResolver(o: ResolverOptions & { address?: string; port?: number }): Promise<Resolver> {
  const address = o.address ?? RESOLVER_ADDRESS;
  let inflight = 0;
  const udp = dgram.createSocket('udp4');
  udp.on('message', (msg, rinfo) => {
    if (inflight >= MAX_INFLIGHT) return;
    inflight++;
    answer(msg, 'udp', o)
      .then((out) => out && udp.send(out, rinfo.port, rinfo.address))
      .catch(() => undefined)
      .finally(() => inflight--);
  });
  await new Promise<void>((resolve, reject) => {
    udp.once('error', reject);
    udp.bind(o.port ?? 53, address, () => resolve());
  });
  udp.on('error', (err) => o.log?.(`udp: ${err.message}`));
  const port = udp.address().port;
  const tcp = net.createServer((socket) => {
    let data = Buffer.alloc(0);
    let busy = Promise.resolve();
    socket.setTimeout(10_000, () => socket.destroy());
    socket.on('error', () => socket.destroy());
    socket.on('data', (chunk) => {
      data = Buffer.concat([data, chunk]);
      if (data.length > 2 + 65535) return socket.destroy();
      while (data.length >= 2 && data.length >= 2 + data.readUInt16BE(0)) {
        const query = data.subarray(2, 2 + data.readUInt16BE(0));
        data = data.subarray(2 + query.length);
        busy = busy.then(async () => {
          const out = await answer(Buffer.from(query), 'tcp', o).catch(() => null);
          if (!out || socket.destroyed) return;
          const length = Buffer.alloc(2);
          length.writeUInt16BE(out.length);
          socket.write(Buffer.concat([length, out]));
        });
      }
    });
  });
  tcp.maxConnections = 64;
  await new Promise<void>((resolve, reject) => {
    tcp.once('error', reject);
    tcp.listen(port, address, () => resolve());
  });
  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        udp.close();
        tcp.close(() => resolve());
      }),
  };
}

function run(file: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (chunk: Buffer) => (err = (err + chunk.toString()).slice(-500)));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${file} ${args[0]}: uscita ${code}: ${err.trim()}`))));
  });
}

/** Aggiunge gli indirizzi ai set di nftables (una volta sola ciascuno). Gli indirizzi li scrive answerAddresses dai byte. */
export function nftAdder(table = EGRESS_TABLE, nft = '/usr/sbin/nft'): ResolverOptions['addAddresses'] {
  const known = new Set<string>();
  return async (family, addresses) => {
    const fresh = [...new Set(addresses)].filter((a) => !known.has(a) && (family === 4 ? net.isIPv4(a) : net.isIPv6(a)));
    if (!fresh.length) return;
    await run(nft, ['add', 'element', 'inet', table, family === 4 ? 'allow4' : 'allow6', `{ ${fresh.join(', ')} }`]);
    for (const a of fresh) known.add(a);
  };
}

/** Il resolver del sistema, dal suo /etc/resolv.conf (mai 127.0.0.2). */
export function systemUpstream(resolvConf = '/etc/resolv.conf'): { host: string; port: number } {
  for (const line of readFileSync(resolvConf, 'utf8').split('\n')) {
    const m = /^\s*nameserver\s+(\S+)/.exec(line);
    if (m && net.isIP(m[1]!) && m[1] !== RESOLVER_ADDRESS) return { host: m[1]!, port: 53 };
  }
  throw new Error(`nessun nameserver in ${resolvConf}`);
}

// --- Il rapporto per il riepilogo della sessione.

export interface EgressReport {
  blockedDomains: BlockedDomain[];
  otherQueries: number;
  /** Connessioni rifiutate (indirizzo e porta), con i pacchetti contati da nftables. */
  blockedAddresses: { address: string; port: number; packets: number }[];
}

/** Domini (blocked.json) e indirizzi (set blocked4/blocked6 di `nft -j list table`) bloccati. */
export function egressReport(blockedFile: string, nftJson: string): EgressReport {
  const blocked = readBlockedFile(blockedFile);
  const addresses: EgressReport['blockedAddresses'] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(nftJson);
  } catch {
    parsed = null;
  }
  const items = (parsed as { nftables?: unknown[] } | null)?.nftables;
  for (const item of Array.isArray(items) ? items : []) {
    const set = (item as { set?: { name?: unknown; elem?: unknown[] } }).set;
    if (!set || (set.name !== 'blocked4' && set.name !== 'blocked6') || !Array.isArray(set.elem)) continue;
    for (const raw of set.elem) {
      const elem = (raw as { elem?: { val?: { concat?: unknown[] }; counter?: { packets?: unknown } } }).elem;
      const [address, port] = elem?.val?.concat ?? [];
      if (typeof address !== 'string' || !net.isIP(address) || !Number.isSafeInteger(port)) continue;
      const packets = Number.isSafeInteger(elem?.counter?.packets) ? (elem!.counter!.packets as number) : 0;
      addresses.push({ address, port: port as number, packets });
    }
  }
  addresses.sort((a, b) => b.packets - a.packets);
  return {
    blockedDomains: [...blocked.domains].sort((a, b) => b.count - a.count),
    otherQueries: blocked.otherQueries,
    blockedAddresses: addresses.slice(0, MAX_BLOCKED_NAMES),
  };
}

// --- Comandi.

async function serveCommand(routerUrl: string | undefined, env: NodeJS.ProcessEnv): Promise<void> {
  const allow = egressAllowlist(routerUrl ?? '');
  const dir = env.EGRESS_DIR || EGRESS_DIR;
  const blocked = new BlockedLog(join(dir, 'blocked.json'));
  const resolver = await startResolver({ allow, upstream: systemUpstream(), addAddresses: nftAdder(), blocked, log: (line) => console.error(line) });
  writeFileSync(join(dir, 'ready'), `${process.pid}\n`);
  console.log(`resolver on ${RESOLVER_ADDRESS}:${resolver.port}; allowed: ${[...allow.names, ...allow.zones.map((z) => `*.${z}`)].join(', ')}`);
  const stop = () => {
    blocked.flush();
    void resolver.close().then(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

async function checkCommand(routerUrl: string | undefined): Promise<void> {
  const allow = egressAllowlist(routerUrl ?? '');
  const host = [...allow.names].find((n) => !ALLOWED_NAMES.includes(n));
  if (!host) return; // router scritto come indirizzo: niente da risolvere
  const query = Buffer.concat([
    Buffer.from([0x4b, 0x1d, 0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0]),
    ...host.split('.').map((label) => Buffer.concat([Buffer.from([label.length]), Buffer.from(label)])),
    Buffer.from([0, 0, 1, 0, 1]),
  ]);
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await forwardUdp(query, { host: RESOLVER_ADDRESS, port: 53 }, 3_000);
      const rcode = response.readUInt16BE(2) & 0xf;
      const addresses = answerAddresses(response, 0x4b1d);
      if (rcode === NOERROR && addresses && addresses.v4.length + addresses.v6.length > 0) {
        console.log(`builder network: the router resolves to ${[...addresses.v4, ...addresses.v6].join(', ')}`);
        return;
      }
      throw new Error(`risposta ${rcode}`);
    } catch (err) {
      if (attempt >= 9) throw new Error(`il resolver del costruttore non risolve il router: ${err instanceof Error ? err.message : 'errore'}`);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

async function readStdin(): Promise<string> {
  let text = '';
  for await (const chunk of process.stdin) text += String(chunk);
  return text;
}

async function main(argv: string[]): Promise<void> {
  const [command, ...args] = argv;
  if (command === 'rules') {
    const [uid, routerUrl] = args;
    process.stdout.write(nftRules({ uid: Number(uid), allow: egressAllowlist(routerUrl ?? '') }));
    return;
  }
  if (command === 'serve') return serveCommand(args[0], process.env);
  if (command === 'check') return checkCommand(args[0]);
  if (command === 'report') {
    console.log(JSON.stringify(egressReport(args[0] ?? join(EGRESS_DIR, 'blocked.json'), await readStdin())));
    return;
  }
  throw new Error(`Comando sconosciuto: ${String(command).slice(0, 40)}`);
}

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : 'errore');
    process.exit(1);
  });
}
