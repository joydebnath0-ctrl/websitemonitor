const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

let stack = [];
let regex = /<\/?([a-zA-Z0-9:-]+)(?:\s+[^>]*)?>/g;
let match;

function getLineAndCol(index) {
  let line = 1;
  let col = 1;
  for (let i = 0; i < index; i++) {
    if (html[i] === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}

while ((match = regex.exec(html)) !== null) {
  let tagName = match[1].toLowerCase();
  if (tagName !== 'div') continue;
  
  let isClosing = match[0].startsWith('</');
  let { line, col } = getLineAndCol(match.index);
  
  if (isClosing) {
    if (stack.length === 0) {
      console.log(`Extra closing </div> at line ${line}, col ${col}`);
    } else {
      stack.pop();
    }
  } else {
    stack.push({ line, col, text: match[0] });
  }
}

if (stack.length > 0) {
  console.log('Unclosed <div> tags:');
  stack.forEach(s => console.log(`  Opened at line ${s.line}, col ${s.col}: ${s.text}`));
} else {
  console.log('All <div> tags are balanced!');
}
