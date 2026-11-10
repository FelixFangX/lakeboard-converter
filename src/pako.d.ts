declare module 'pako' {
  interface InflateOptions {
    raw?: boolean;
    chunkSize?: number;
  }

  class Inflate {
    constructor(options?: InflateOptions);
    onData: (chunk: Uint8Array) => void;
    onEnd: (status: number) => void;
    push(data: Uint8Array, end?: boolean): boolean;
  }

  const pako: { Inflate: typeof Inflate };
  export default pako;
}
