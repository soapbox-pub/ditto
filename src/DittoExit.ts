import { Stickynotes } from '@soapbox/stickynotes';

/**
 * Add cleanup tasks to this module,
 * then they will automatically be called (and the program exited) after SIGINT.
 */
export class DittoExit {
  private static tasks: Array<() => Promise<unknown>> = [];
  private static console = new Stickynotes('ditto:exit');

  static {
    Deno.addSignalListener('SIGINT', () => this.finish('SIGINT'));
    Deno.addSignalListener('SIGTERM', () => this.finish('SIGTERM'));
    Deno.addSignalListener('SIGHUP', () => this.finish('SIGHUP'));
    Deno.addSignalListener('SIGQUIT', () => this.finish('SIGQUIT'));
    Deno.addSignalListener('SIGABRT', () => this.finish('SIGABRT'));
  }

  static add(task: () => Promise<unknown>): void {
    this.tasks.push(task);
    this.console.debug(`Added cleanup task #${this.tasks.length}`);
  }

  private static async cleanup(): Promise<void> {
    this.console.debug(`Running ${this.tasks.length} cleanup tasks...`);
    await Promise.allSettled(
      this.tasks.map((task) => task()),
    );
  }

  private static async finish(signal: Deno.Signal): Promise<void> {
    this.console.debug(signal);
    await this.cleanup();
    this.console.debug('Exiting gracefully.');
    Deno.exit(0);
  }
}
