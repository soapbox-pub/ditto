import type { LogiHandler, LogiLog, LogiValue } from '@soapbox/logi';
import { DittoConf } from '@ditto/conf';

type Level = LogiLog['level'];

const levels: Level[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'critical'];

const lowerLevels: Record<Level, Level[]> = levels.reduce((acc, level, index) => {
  acc[level] = levels.slice(index);
  return acc;
}, {} as Record<Level, Level[]>);

const colors: Record<Level, string> = {
  trace: 'grey',
  debug: 'white',
  info: 'blue',
  warn: 'yellow',
  error: 'orange',
  fatal: 'red',
  critical: 'red',
};

const levelSet = new Set(levels);
const isLevel = (str: string): str is Level => levelSet.has(str as Level);

const prettyPrint = (msg: LogiValue): string => {
  const message = msg || '';
  const type = typeof message;
  switch (type) {
    case 'string':
    case 'bigint':
    case 'number':
    case 'boolean':
      return message.toString();
    case 'function':
    case 'symbol':
    case 'undefined':
      return `<${type}>`;
    case 'object':
      if (message === null) return '<null>';
      return JSON.stringify(message, (_, v) => {
        if (Array.isArray(v)) {
          return `[${v.map((itm) => JSON.stringify(itm)).join(', ')}]`;
        }
        if (typeof v === 'string') return `\`${v}\``;
        return v;
      }, 2)
        .replaceAll('\\"', '"')
        .replace(/^"/, '')
        .replace(/"$/, '');
  }
};

const pair = (key: string, value: LogiValue | undefined) => {
  return `${key}: ${prettyPrint(value || '')}`;
};

export const createLogiHandler = (conf: DittoConf, defaultHandler: LogiHandler) => (log: LogiLog) => {
  const { fmt, level, scopes } = conf.logConfig;
  if (!isLevel(level)) throw new Error(`Invalid log level ${level} specified`);
  if (!lowerLevels[level].includes(log.level)) return;
  if (scopes.length && !scopes.some((scope) => scope.startsWith(log.ns))) return;
  if (fmt === 'jsonl') return defaultHandler(log);

  const message = prettyPrint(log.message || log.msg || '');
  const remaining = Object.entries(log)
    .filter(([key]) => !['ns', 'level', 'message', 'msg'].includes(key));

  console.group(
    `%c${log.level.toUpperCase()} %c${log.ns} %c${message || ''}`,
    `color: ${colors[log.level]}; font-weight: bold`,
    'font-weight: normal; color: yellow',
    'color: unset',
  );

  if (remaining.length) console.log(remaining.map((itm) => pair(...itm)).join('\n'));
  console.groupEnd();
};
