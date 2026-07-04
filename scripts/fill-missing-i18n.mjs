import fs from 'node:fs';
import path from 'node:path';

const localesDir = path.resolve('fluxer_app/src/features/i18n/locales');

function readPoString(lines, startIndex, prefix) {
	let value = '';
	let index = startIndex;
	const first = lines[index];
	const match = first.match(new RegExp(`^${prefix} (.*)$`));
	if (!match) {
		throw new Error(`Expected ${prefix} at line ${index + 1}: ${first}`);
	}
	const parts = [match[1]];
	index += 1;
	while (index < lines.length && lines[index].startsWith('"')) {
		parts.push(lines[index]);
		index += 1;
	}
	for (const part of parts) {
		const token = part.match(/^"(.*)"$/)?.[1];
		if (token === undefined) {
			throw new Error(`Invalid PO string at line ${index}: ${part}`);
		}
		value += token
			.replace(/\\n/g, '\n')
			.replace(/\\t/g, '\t')
			.replace(/\\"/g, '"')
			.replace(/\\\\/g, '\\');
	}
	return {value, nextIndex: index};
}

function parsePo(content) {
	const entries = [];
	const headerLines = [];
	const lines = content.replace(/\r\n/g, '\n').split('\n');
	let index = 0;

	while (index < lines.length && (lines[index].startsWith('#') || lines[index].trim() === '')) {
		headerLines.push(lines[index]);
		index += 1;
	}
	if (index < lines.length && lines[index].startsWith('msgid ')) {
		const msgid = readPoString(lines, index, 'msgid');
		index = msgid.nextIndex;
		const msgstr = readPoString(lines, index, 'msgstr');
		index = msgstr.nextIndex;
		headerLines.push(formatPoString('msgid', msgid.value));
		headerLines.push(formatPoString('msgstr', msgstr.value));
		if (index < lines.length && lines[index] === '') {
			index += 1;
		}
	}

	while (index < lines.length) {
		const comments = [];
		const references = [];
		while (index < lines.length && lines[index].startsWith('#')) {
			if (lines[index].startsWith('#:')) {
				references.push(lines[index]);
			} else {
				comments.push(lines[index]);
			}
			index += 1;
		}
		if (index >= lines.length) {
			break;
		}

		let msgctxt = null;
		if (lines[index].startsWith('msgctxt ')) {
			const parsed = readPoString(lines, index, 'msgctxt');
			msgctxt = parsed.value;
			index = parsed.nextIndex;
		}
		if (index >= lines.length || !lines[index].startsWith('msgid ')) {
			break;
		}
		const msgid = readPoString(lines, index, 'msgid');
		index = msgid.nextIndex;
		if (index >= lines.length || !lines[index].startsWith('msgstr ')) {
			break;
		}
		const msgstr = readPoString(lines, index, 'msgstr');
		index = msgstr.nextIndex;
		if (index < lines.length && lines[index] === '') {
			index += 1;
		}

		entries.push({comments, references, msgctxt, msgid: msgid.value, msgstr: msgstr.value});
	}

	return {headerLines, entries};
}

function escapePo(value) {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\t/g, '\\t')
		.replace(/\n/g, '\\n');
}

function formatPoString(prefix, value) {
	const escaped = escapePo(value);
	if (!escaped.includes('\n')) {
		return `${prefix} "${escaped}"`;
	}
	const parts = escaped.split('\n');
	const lines = [`${prefix} ""`];
	for (const part of parts) {
		lines.push(`"${part}\\n"`);
	}
	return lines.join('\n');
}

function serializePo({headerLines, entries}) {
	const blocks = [headerLines.join('\n')];
	for (const entry of entries) {
		const lines = [...entry.comments, ...entry.references];
		if (entry.msgctxt) {
			lines.push(formatPoString('msgctxt', entry.msgctxt));
		}
		lines.push(formatPoString('msgid', entry.msgid));
		lines.push(formatPoString('msgstr', entry.msgstr));
		blocks.push(lines.join('\n'));
	}
	return `${blocks.join('\n\n')}\n`;
}

function entryKey(entry) {
	return entry.msgctxt ? `${entry.msgctxt}\u0004${entry.msgid}` : entry.msgid;
}

function buildSourceMap(po) {
	const map = new Map();
	for (const entry of po.entries) {
		if (entry.msgid) {
			map.set(entryKey(entry), entry.msgstr || entry.msgid);
		}
	}
	return map;
}

const sourcePo = parsePo(fs.readFileSync(path.join(localesDir, 'en-US/messages.po'), 'utf8'));
const sourceMap = buildSourceMap(sourcePo);

for (const localeDir of fs.readdirSync(localesDir)) {
	if (localeDir === 'en-US') {
		continue;
	}
	const poPath = path.join(localesDir, localeDir, 'messages.po');
	if (!fs.existsSync(poPath)) {
		continue;
	}
	const po = parsePo(fs.readFileSync(poPath, 'utf8'));
	let filled = 0;
	for (const entry of po.entries) {
		if (entry.msgid && entry.msgstr === '') {
			entry.msgstr = sourceMap.get(entryKey(entry)) ?? entry.msgid;
			filled += 1;
		}
	}
	if (filled > 0) {
		fs.writeFileSync(poPath, serializePo(po));
		console.log(`${localeDir}: filled ${filled} missing translation(s)`);
	}
}
