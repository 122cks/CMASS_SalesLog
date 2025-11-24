const fs = require('fs');
const file = process.argv[2];
if (!file){ console.error('Usage: node check_balance2.js <file>'); process.exit(2); }
const src = fs.readFileSync(file,'utf8');
const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let m; let idx=0; const blocks = [];
while ((m = re.exec(src)) !== null){ blocks.push({start: m.index, content: m[1], end: re.lastIndex}); }
function posToLineCol(str,pos){ const upto = str.slice(0,pos); const lines = upto.split('\n'); const line = lines.length; const col = lines[lines.length-1].length + 1; return {line,col}; }
function checkText(text){
	// naive bracket matcher that ignores contents inside strings and comments
	const pairs = { '(':')','{':'}','[':']' };
	const opens = Object.keys(pairs);
	const closes = Object.values(pairs);
	const stack=[];
	const issues=[];
	let i = 0;
	while(i < text.length){
		const ch = text[i];
		// handle strings
		if (ch === '"' || ch === "'" || ch === '`'){
			const quote = ch; i++;
			while(i<text.length){
				if (text[i] === '\\') { i+=2; continue; }
				if (text[i] === quote){ i++; break; }
				i++;
			}
			continue;
		}
		// handle single-line comments
		if (text[i] === '/' && text[i+1] === '/'){
			i+=2;
			while(i<text.length && text[i] !== '\n') i++;
			continue;
		}
		// handle multi-line comments
		if (text[i] === '/' && text[i+1] === '*'){
			i+=2;
			while(i<text.length && !(text[i] === '*' && text[i+1] === '/')) i++;
			i += 2; continue;
		}
		if (opens.includes(ch)) { stack.push({ch, i}); i++; continue; }
		if (closes.includes(ch)){
			const last = stack[stack.length-1];
			if (!last){ issues.push({pos:i, found:ch, expected:null, msg:'Unmatched closing '+ch}); i++; continue; }
			const expected = pairs[last.ch];
			if (expected === ch){ stack.pop(); i++; continue; }
			else { issues.push({pos:i, found:ch, expected, msg:`Mismatched closing ${ch} at ${i}, expected ${expected} for opening ${last.ch} at ${last.i}`}); i++; continue; }
		}
		i++;
	}
	while(stack.length){ const s = stack.pop(); issues.push({pos:s.i, found:s.ch, expected:pairs[s.ch], msg:`Unclosed opening ${s.ch} at ${s.i} (expected ${pairs[s.ch]})`}); }
	return issues;
}
for (let i=0;i<blocks.length;i++){ const b = blocks[i]; console.log('--- Block', i+1, 'start offset', b.start, 'length', b.content.length); const issues = checkText(b.content); if (!issues.length) console.log(' OK: balanced'); else{ for (const it of issues){ const globalPos = b.start + it.pos; const lc = posToLineCol(src, globalPos); console.log(' ISSUE:', it.msg, '-> file line', lc.line, 'col', lc.col); const startLine = Math.max(1, lc.line-4); const endLine = lc.line+4; const lines = src.split('\n').slice(startLine-1, endLine); console.log('  Context lines', startLine, '-', endLine); lines.forEach((ln,ii)=>{ const n = startLine + ii; const prefix = (n===lc.line)? '>>' : '  '; console.log(prefix, String(n).padStart(4), ln); }); } }
}
process.exit(0);
