import { GameFiles } from '../services/game/route.js';

export function filesToCodeblocks(files: GameFiles[]) {
  const langMap = {
    html: 'html',
    css: 'css',
    javascript: 'javascript',
    js: 'javascript',
    xml: 'xml',
    svg: 'xml'
  };

  return files
    .map((file) => {
      const lang = langMap[file.type as keyof typeof langMap] || 'not found';
      return `\`\`\`${lang}
  ${file.code}
  \`\`\``;
    })
    .join('\n\n');
}
