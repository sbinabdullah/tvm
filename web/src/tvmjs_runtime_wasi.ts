// Stub implementation for tvmjs_runtime_wasi — the real implementation
// is generated during the emscripten build. This provides a minimal
// but *correct* WASI polyfill: the out-pointer arguments must be
// written (zeroed) so the C runtime does not read uninitialized memory
// and compute garbage sizes (which corrupts the heap).

import type { LibraryProvider } from "./types";

export class EmccWASI implements LibraryProvider {
  imports: Record<string, any>;
  start: (inst: WebAssembly.Instance) => void;

  private inst?: WebAssembly.Instance;

  constructor() {
    const memoryView = (): DataView => {
      const mem = (this.inst!.exports as any).memory as WebAssembly.Memory;
      return new DataView(mem.buffer);
    };

    this.imports = {
      wasi_snapshot_preview1: {
        proc_exit: (_code: number): void => {
          throw new Error(`WASI proc_exit(${_code})`);
        },
        fd_close: (_fd: number): number => 0,
        // fd_write(fd, iovs, iovs_len, nwritten): sum the iov lengths,
        // decode to text for fd 1/2, and write the byte count to
        // *nwritten so the caller sees the write "succeeded".
        fd_write: (fd: number, iovs: number, iovsLen: number, pnwritten: number): number => {
          const view = memoryView();
          const mem = new Uint8Array((this.inst!.exports as any).memory.buffer);
          let total = 0;
          let text = "";
          for (let i = 0; i < iovsLen; i++) {
            const base = view.getUint32(iovs + i * 8, true);
            const len = view.getUint32(iovs + i * 8 + 4, true);
            total += len;
            if (fd === 1 || fd === 2) {
              text += new TextDecoder().decode(mem.subarray(base, base + len));
            }
          }
          if (text.length > 0) {
            // eslint-disable-next-line no-console
            console.log(text.replace(/\n$/, ""));
          }
          view.setUint32(pnwritten, total, true);
          return 0;
        },
        fd_read: (_fd: number, _iovs: number, _iovsLen: number, pnread: number): number => {
          memoryView().setUint32(pnread, 0, true);
          return 0;
        },
        fd_seek: (
          _fd: number,
          _offsetLo: number,
          _offsetHi: number,
          _whence: number,
          pnewpos: number
        ): number => {
          // newpos is a 64-bit value; zero both words.
          memoryView().setUint32(pnewpos, 0, true);
          memoryView().setUint32(pnewpos + 4, 0, true);
          return 0;
        },
        environ_sizes_get: (pcount: number, pbufSize: number): number => {
          const view = memoryView();
          view.setUint32(pcount, 0, true);
          view.setUint32(pbufSize, 0, true);
          return 0;
        },
        environ_get: (_environ: number, _buf: number): number => 0,
        clock_time_get: (_clockId: number, _precision: number, ptime: number): number => {
          const view = memoryView();
          const nowNs = BigInt(Math.round(performance.now() * 1e6));
          view.setBigUint64(ptime, nowNs, true);
          return 0;
        },
      },
    };
    this.start = (inst: WebAssembly.Instance): void => {
      this.inst = inst;
      const init = (inst.exports as any)._initialize;
      if (init) init();
    };
  }
}

export default EmccWASI;
