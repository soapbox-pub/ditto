export async function asyncReplaceAll(
  input: string,
  regex: RegExp,
  replacer: (match: string, ...args: string[]) => Promise<string>,
): Promise<string> {
  const promises: Promise<string>[] = [];

  input.replaceAll(new RegExp(regex), (match, ...args) => {
    promises.push(replacer(match, ...args));
    return '';
  });

  let i = 0;
  const replacements = await Promise.all(promises);
  return input.replaceAll(new RegExp(regex), () => replacements[i++]);
}
