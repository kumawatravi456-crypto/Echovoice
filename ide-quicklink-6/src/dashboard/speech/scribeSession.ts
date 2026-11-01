export interface ScribeConnectOptions {
  token: string;
}

export class ScribeSessionController {
  private generation = 0;
  private active = false;
  private starting = false;
  private disposed = false;

  constructor(
    private readonly requestToken: () => Promise<string>,
    private readonly connect: (options: ScribeConnectOptions) => Promise<void>,
    private readonly disconnect: () => void,
    private readonly onError: (message: string | null) => void,
  ) {}

  async start(): Promise<void> {
    if (this.disposed || this.active || this.starting) return;
    const generation = ++this.generation;
    this.starting = true;
    this.onError(null);
    try {
      const token = await this.requestToken();
      if (this.disposed || generation !== this.generation) return;
      await this.connect({ token });
      if (this.disposed || generation !== this.generation) {
        this.disconnect();
        return;
      }
      this.starting = false;
      this.active = true;
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      this.starting = false;
      this.active = false;
      this.disconnect();
      this.onError(error instanceof Error ? error.message : 'Live transcription could not start. Try again.');
    }
  }

  stop(): void {
    if (this.disposed) return;
    this.generation += 1;
    this.starting = false;
    this.active = false;
    this.disconnect();
  }

  markDisconnected(): void {
    this.generation += 1;
    this.starting = false;
    this.active = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
  }
}
