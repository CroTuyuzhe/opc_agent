const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  const data = JSON.parse(Buffer.concat(chunks).toString());
  console.log(JSON.stringify({ reply: `Hello! You said: ${data.message || ''}` }));
});
