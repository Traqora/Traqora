import type { PrivateV8CpuProfilerBindings, RawChunkCpuProfile, RawThreadCpuProfile, V8CpuProfilerBindings } from './types';
import type { ProfileFormat } from './types';
/**
 *  Imports cpp bindings based on the current platform and architecture.
 */
export declare function importCppBindingsModule(): PrivateV8CpuProfilerBindings;
declare const PrivateCpuProfilerBindings: PrivateV8CpuProfilerBindings;
declare class Bindings implements V8CpuProfilerBindings {
    startProfiling(name: string): void;
    stopProfiling(name: string, format: ProfileFormat.THREAD): RawThreadCpuProfile | null;
    stopProfiling(name: string, format: ProfileFormat.CHUNK): RawChunkCpuProfile | null;
}
declare const CpuProfilerBindings: Bindings;
export { PrivateCpuProfilerBindings };
export { CpuProfilerBindings };
//# sourceMappingURL=cpu_profiler.d.ts.map