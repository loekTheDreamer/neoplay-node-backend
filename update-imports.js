import fs from 'fs';
import path from 'path';

function updateImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let updated = false;

  // Regular expression to match import statements with relative paths missing .js extension
  const importRegex = /import\s+([\s\S]*?)\s+from\s+(['"])(\.\.?\/[^'"]*)(['"])/g;

  content = content.replace(importRegex, (match, imports, quote1, importPath, quote2) => {
    if (importPath.endsWith('.js') || !importPath.startsWith('.')) {
      return match; // Skip if already has .js or is not a relative import
    }
    updated = true;
    return `import ${imports} from ${quote1}${importPath}.js${quote2}`;
  });

  if (updated) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated imports in ${filePath}`);
  }
}

function traverseDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      traverseDirectory(filePath);
    } else if (filePath.endsWith('.ts')) {
      updateImportsInFile(filePath);
    }
  }
}

console.log('Starting import updates...');
traverseDirectory(path.join(process.cwd(), 'src'));
traverseDirectory(path.join(process.cwd(), 'server.ts'));
console.log('Import updates completed.');
