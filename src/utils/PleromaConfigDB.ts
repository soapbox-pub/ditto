import type { ElixirTuple, ElixirValue, PleromaConfig } from '@/schemas/pleroma-api.ts';

export class PleromaConfigDB {
  constructor(private configs: PleromaConfig[]) {}

  get(group: string, key: string): PleromaConfig | undefined {
    return this.configs.find((c) => c.group === group && c.key === key);
  }

  getIn(group: string, key: string, ...paths: string[]): ElixirValue | undefined {
    const config = this.get(group, key);
    if (!config) return undefined;

    let value = config.value;

    for (const path of paths) {
      if (Array.isArray(value)) {
        const tuple = value.find((item): item is ElixirTuple => {
          return PleromaConfigDB.isTuple(item) && item.tuple[0] === path;
        });
        if (tuple) {
          value = tuple.tuple[1];
        } else {
          return;
        }
      } else if (PleromaConfigDB.isTuple(value) && value.tuple[0] === path) {
        value = value.tuple[1];
      } else if (!PleromaConfigDB.isTuple(value) && value && typeof value === 'object' && path in value) {
        value = value[path];
      } else {
        return;
      }
    }

    return value;
  }

  set(group: string, key: string, value: PleromaConfig): void {
    const index = this.configs.findIndex((c) => c.group === group && c.key === key);
    if (index === -1) {
      this.configs.push(value);
    } else {
      this.configs[index] = value;
    }
  }

  merge(configs: PleromaConfig[]): void {
    for (const { group, key, value } of configs) {
      this.set(group, key, { group, key, value });
    }
  }

  toJSON(): PleromaConfig[] {
    return this.configs;
  }

  private static isTuple(value: ElixirValue): value is ElixirTuple {
    return Boolean(
      value &&
        typeof value === 'object' &&
        'tuple' in value &&
        Array.isArray(value.tuple) &&
        value.tuple.length === 2 &&
        typeof value.tuple[0] === 'string',
    );
  }
}
