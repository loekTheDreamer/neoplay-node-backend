import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Saves the provided code to a file in public/currentGame.
 * @param file - The filename to save as (e.g. 'main.js')
 * @param code - The code/content to write to the file
 * @throws Will throw if writing fails
 */
export async function saveGameFile(file: string, code: string): Promise<void> {
  try {
    console.log('here');
    const dir = path.resolve(__dirname, '../../../public/currentGame');

    console.log('dir:', dir);
    console.log('file:', file);
    console.log('code:', code);

    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, file);
    await fs.writeFile(filePath, code, 'utf8');
  } catch (error) {
    console.log('error saving file:', error);
  }
}
