import { WorkerManager, WorkerJob } from '../../src/jobs/worker';

describe('WorkerManager - Graceful Shutdown', () => {
  it('should successfully complete active jobs before shutting down (happy path)', async () => {
    const manager = new WorkerManager({ shutdownTimeoutMs: 1000 });
    let jobCompleted = false;

    const job: WorkerJob = {
      id: 'job-1',
      name: 'TestJob',
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        jobCompleted = true;
      },
    };

    const executionPromise = manager.registerAndExecute(job);
    expect(manager.getActiveJobCount()).toBe(1);

    await manager.gracefulShutdown();
    await executionPromise;

    expect(jobCompleted).toBe(true);
    expect(manager.getActiveJobCount()).toBe(0);
    expect(manager.getIsShuttingDown()).toBe(true);
  });

  it('should reject new jobs registered while shutting down', async () => {
    const manager = new WorkerManager({ shutdownTimeoutMs: 1000 });

    const longJob: WorkerJob = {
      id: 'job-long',
      name: 'LongJob',
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      },
    };

    const execPromise = manager.registerAndExecute(longJob);
    const shutdownPromise = manager.gracefulShutdown();

    const newJob: WorkerJob = {
      id: 'job-new',
      name: 'NewJob',
      execute: async () => {},
    };

    await expect(manager.registerAndExecute(newJob)).rejects.toThrow('Worker is shutting down');

    await shutdownPromise;
    await execPromise;
  });

  it('should timeout and force shutdown when active jobs exceed shutdownTimeoutMs (failure mode)', async () => {
    const manager = new WorkerManager({ shutdownTimeoutMs: 50 });
    let finished = false;

    const slowJob: WorkerJob = {
      id: 'job-slow',
      name: 'SlowJob',
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        finished = true;
      },
    };

    const execPromise = manager.registerAndExecute(slowJob);
    const start = Date.now();
    
    await manager.gracefulShutdown();
    const duration = Date.now() - start;

    // Shutdown should resolve quickly due to the 50ms timeout rather than waiting 300ms
    expect(duration).toBeLessThan(250);

    await execPromise;
    expect(finished).toBe(true);
  });
});
