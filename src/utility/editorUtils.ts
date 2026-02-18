import { EditorView } from '@codemirror/view';
import { Editor } from 'obsidian';
import { syntaxTree } from '@codemirror/language';
import { Settings } from '../settings';

/**
 * Extract a CodeMirror {@link EditorView} from an Obsidian {@link Editor}.
 */
export function extractEditorView(editor: Editor): EditorView {
	// https://docs.obsidian.md/Plugins/Editor/Communicating+with+editor+extensions
	// @ts-expect-error: not typed
	return editor.cm as EditorView;
}

/**
 * Regex for extracting the language from the starting line of a code block.
 */
const CODE_LANG_REGEX = /^[`~]{3,}(.*)$/;

/**
 * Find the language of the code block at the given line.
 *
 * If the line is not in a code block, returns `null`.
 * If it is in a code block, returns the language name (or any text following the starting "```").
 */
export function findCodeLang(settings: Settings, editor: Editor, line: number): string | null {
	const view = extractEditorView(editor);

	// Lines are 1-indexed so we need to add 1
	// Note that this is the position of the character of the start of the line
	// Using the position of the original line the cursor was on, 
	// once we find a codeblock by via back-scanning, verify that we are inside of it.
	const originalLineStartPos = view.state.doc.line(line + 1).from;

	// which line we are currently (starting) on (line index/number, not character index/position)
	const originalLineNum = line;
	let currentLineNum = line;

	const MAX_SCAN_LINES = settings.maxScanLines;

	while (currentLineNum >= 0 && (originalLineNum - currentLineNum) < MAX_SCAN_LINES) {
		const text = view.state.doc.line(currentLineNum + 1).text;

		// * Support for Templater JS scripts
		// this will scan for `<%* ... %>`
		const tOpen = text.lastIndexOf("<%*");
		const tClose = Math.max(
			text.lastIndexOf("%>"), 
			text.lastIndexOf("-%>"), 
			text.lastIndexOf("_%>")
		);

		if (tOpen > -1 || tClose > -1) {
			// we have found a Templater tag, so check if we're inside of it or not and return appropriately
			if (tOpen > tClose) return "js";
			if (tClose > tOpen) return null;
		}

		// * Check standard Markdown codeblock syntax
		// we assume that any sequence of only backticks/tildes is an end fence
		// which means that codeblocks with an unspecified language will take the default comment (Obsidian/HTML/Custom)

		const match = CODE_LANG_REGEX.exec(text);
		if (match) {
			// `match?.at(1)?.trim()` gives the actual language (e.g., "cpp") -- so we found a start fence (e.g., "```cpp")
			// if it's null, we found an end fence (e.g., "```")
			return match?.at(1)?.trim() ?? null;
		}		
		currentLineNum--;
	}
	return null;
}

/**
 * Checks if the given line is in a math block.
 */
export function isMathBlock(editor: Editor, line: number): boolean {
	const view = extractEditorView(editor);

	// Lines are 1-indexed so we need to add 1
	const linePos = view.state.doc.line(line + 1).from;

	// Set `side` to `1` so we only get the node starting at this line (i.e. not the topmost `Document`)
	const cursor = syntaxTree(view.state).cursorAt(linePos, 1);

	return cursor.type.name.contains('math') || cursor.type.name.contains('comment_math');
}

/**
 * Returns true if the given line contains math block tokens (i.e. `$$`).
 *
 * This will check against the syntax tree to prevent false positives,
 * such as when the `$$` tokens are in a code block.
 *
 * This function is needed because math blocks can be defined inline.
 */
export function containsMathBlockTokens(editor: Editor, line: number): boolean {
	const view = extractEditorView(editor);

	// Lines are 1-indexed so we need to add 1
	const linePos = view.state.doc.line(line + 1);

	for (let pos = linePos.from; pos < linePos.to; pos++) {
		// Set `side` to `1` so we only get the node starting at this line (i.e. not the topmost `Document`)
		const cursor = syntaxTree(view.state).cursorAt(pos, 1);

		if (
			cursor.type.name.contains('begin_keyword_math_math-block') ||
			cursor.type.name.contains('end_keyword_math_math-block')
		) {
			return true;
		}
	}

	return false;
}
