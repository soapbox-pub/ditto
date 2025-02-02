const decoder = new TextDecoder();

for await (const chunk of Deno.stdin.readable) {
  const text = decoder.decode(chunk);

  const { sql, parameters } = JSON.parse(text) as { sql: string; parameters: unknown[] };

  let result = sql;

  for (let i = 0; i < parameters.length; i++) {
    const param = parameters[i];

    result = result.replace(`$${i + 1}`, serializeParameter(param));
  }

  console.log(result + ';');
}

function serializeParameter(param: unknown): string {
  if (param === null) {
    return 'null';
  }

  if (typeof param === 'string') {
    return `'${param}'`;
  }

  if (typeof param === 'number' || typeof param === 'boolean') {
    return param.toString();
  }

  if (param instanceof Date) {
    return `'${param.toISOString()}'`;
  }

  if (Array.isArray(param)) {
    return `'{${param.join(',')}}'`;
  }

  if (typeof param === 'object') {
    return `'${JSON.stringify(param)}'`;
  }

  return JSON.stringify(param);
}
