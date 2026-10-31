/** Typing-to-drawn echo time, as the terminal bench measures it. */
export class EchoTimer {
  private seen = "";
  private awaiting: { token: string; resolve: (ms: number) => void; t0: number } | null = null;
  private decoder = new TextDecoder();

  constructor(private now: () => number = () => performance.now()) {}

  /** Feed each chunk once xterm has drawn it. */
  drawn(chunk: Uint8Array) {
    this.seen += this.decoder.decode(chunk, { stream: true });
    const a = this.awaiting;
    if (a && this.seen.includes(a.token)) {
      this.awaiting = null;
      a.resolve(this.now() - a.t0);
    }
  }

  time(token: string, type: (token: string) => void): Promise<number> {
    this.seen = "";
    return new Promise((resolve) => {
      this.awaiting = { token, resolve, t0: this.now() };
      type(token);
    });
  }
}
