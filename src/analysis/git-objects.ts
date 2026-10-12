/** One streaming cat-file process for a baseline, rather than one process per file. */
export class GitObjects {
  private child: Bun.Subprocess<"pipe", "pipe", "pipe">;
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private pending = new Uint8Array(0);
  private errorText: Promise<string>;
  private finished = false;

  constructor(root: string) {
    this.child = Bun.spawn(["git", "-C", root, "cat-file", "--batch"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    this.reader = this.child.stdout.getReader();
    this.errorText = new Response(this.child.stderr).text();
  }

  private async fill() {
    const { value, done } = await this.reader.read();
    if (done) throw new Error(`Git object stream ended unexpectedly: ${await this.errorText}`);
    const combined = new Uint8Array(this.pending.length + value.length);
    combined.set(this.pending);
    combined.set(value, this.pending.length);
    this.pending = combined;
  }

  private async take(size: number): Promise<Uint8Array> {
    const output = new Uint8Array(size);
    let offset = 0;
    while (offset < size) {
      if (!this.pending.length) await this.fill();
      const count = Math.min(size - offset, this.pending.length);
      output.set(this.pending.subarray(0, count), offset);
      this.pending = this.pending.subarray(count);
      offset += count;
    }
    return output;
  }

  async read(sha: string): Promise<Uint8Array> {
    this.child.stdin.write(`${sha}\n`);
    await this.child.stdin.flush();
    let newline = this.pending.indexOf(10);
    while (newline < 0) {
      await this.fill();
      newline = this.pending.indexOf(10);
    }
    const header = new TextDecoder().decode(this.pending.subarray(0, newline));
    this.pending = this.pending.subarray(newline + 1);
    const [object, type, length] = header.split(" ");
    const size = Number(length);
    if (object !== sha || type !== "blob" || !Number.isSafeInteger(size) || size < 0)
      throw new Error(`Unexpected Git object header: ${header}`);
    const bytes = await this.take(size);
    if ((await this.take(1))[0] !== 10) throw new Error("Invalid Git object separator.");
    return bytes;
  }

  async close() {
    if (this.finished) return;
    this.finished = true;
    this.child.stdin.end();
    // Consumers read each response fully. End stdin, then wait for normal EOF.
    await this.reader.cancel();
    this.reader.releaseLock();
    const [code, error] = await Promise.all([this.child.exited, this.errorText]);
    if (code !== 0) throw new Error(`Git object reader failed: ${error}`);
  }

  async abort() {
    if (this.finished) return;
    this.finished = true;
    this.child.kill();
    await this.reader.cancel();
    this.reader.releaseLock();
    await Promise.all([this.child.exited, this.errorText]);
  }
}
