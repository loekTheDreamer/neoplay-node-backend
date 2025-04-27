export const extractCode = (content: string) => {
  const patterns = {
    html: '```html',
    css: '```css',
    javascript: '```javascript',
    svg: '```xml',
    xml: '```xml'
  };
  const endPattern = '```';
  const files: { filename: string; code: string; type: string }[] = [];

  let currentContent = content;
  let before = '';
  let after = '';

  while (currentContent.length > 0) {
    let firstPattern: { type: string; pattern: string } | null = null;
    let earliestIndex = currentContent.length;

    Object.entries(patterns).forEach(([type, pattern]) => {
      const index = currentContent.indexOf(pattern);
      if (index !== -1 && index < earliestIndex) {
        earliestIndex = index;
        firstPattern = { type, pattern };
      }
    });

    if (!firstPattern) {
      after = currentContent;
      break;
    }

    if (before === '') {
      before = currentContent.slice(0, earliestIndex);
    }

    const { pattern, type: currentType } = firstPattern as {
      type: string;
      pattern: string;
    };
    const codeStartIndex = earliestIndex + pattern.length;

    const endIndex = currentContent.indexOf(endPattern, codeStartIndex);

    const codeContent =
      endIndex === -1
        ? currentContent.slice(codeStartIndex).trim()
        : currentContent.slice(codeStartIndex, endIndex).trim();

    let filename = '';
    const firstLineEnd = codeContent.indexOf('\n');
    const firstLine =
      firstLineEnd !== -1
        ? codeContent.slice(0, firstLineEnd).trim()
        : codeContent.trim();

    // Generalized filename extraction for supported types
    const commentPatterns: { [key: string]: RegExp } = {
      html: /<!--\s*([^\s]+\.html)\s*.*-->/,
      svg: /<!--\s*([^\s]+\.svg)\s*.*-->/,
      xml: /<!--\s*([^\s]+\.xml)\s*.*-->/,
      css: /\/\*\s*([^\s]+\.css)\s*.*\*\//,
      javascript: /\/\/\s*([^\s]+\.js)\s*.*/,
    };
    const commentFirstLineChecks: { [key: string]: (line: string) => boolean } = {
      html: (line) => line.startsWith('<!--') && line.includes('-->'),
      svg: (line) => line.startsWith('<!--') && line.includes('-->'),
      xml: (line) => line.startsWith('<!--') && line.includes('-->'),
      css: (line) => line.startsWith('/*') && line.includes('*/'),
      javascript: (line) => line.startsWith('//'),
    };

    if (commentPatterns[currentType] && commentFirstLineChecks[currentType]?.(firstLine)) {
      const match = firstLine.match(commentPatterns[currentType]);
      if (match && match[1]) filename = match[1];
    }

    if (!filename) {
      filename = '';
    }

    let fileIndex = files.findIndex((f) => f.filename === filename);
    if (fileIndex === -1) {
      files.push({ filename, code: '', type: currentType });
      fileIndex = files.length - 1;
    }

    files[fileIndex].code = codeContent;

    currentContent =
      endIndex !== -1 ? currentContent.slice(endIndex + endPattern.length) : '';
  }

  return {
    before,
    files,
    after
  };
};
