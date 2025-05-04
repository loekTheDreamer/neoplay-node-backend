import { transformFiles } from 'esm-import-transformer';
import path from 'path';

// Define the directory containing the compiled JavaScript files
const distDir = path.join(process.cwd(), 'dist');

// Transform the files to append .js extensions to relative imports
transformFiles({
  dir: distDir,
  ext: '.js', // Process only .js files
  recursive: true, // Process all subdirectories
  verbose: true, // Log the transformation process
  relative: true, // Only transform relative imports
  appendExtension: true // Append .js extension if missing
}).then(() => {
  console.log('Transformation complete');
}).catch(err => {
  console.error('Transformation failed:', err);
  process.exit(1);
});
