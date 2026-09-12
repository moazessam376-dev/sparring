// Trusted gate code. Input is data; never import or execute surveyed source.
let input = '';
for await (const chunk of process.stdin) input += chunk;
const { pattern, flags, texts } = JSON.parse(input);
const re = new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`);
let count = 0;
const result = texts.map((text) => {
  re.lastIndex = 0;
  const matches = [];
  for (let match = re.exec(text); match !== null; match = re.exec(text)) {
    if (++count > 10000) throw new Error('pattern match budget exceeded');
    matches.push({ index: match.index, values: [...match] });
    if (match[0].length === 0) re.lastIndex += 1;
  }
  return matches;
});
process.stdout.write(JSON.stringify(result));
