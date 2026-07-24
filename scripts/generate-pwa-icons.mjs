import {mkdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const iconDirectory = path.join(projectRoot, 'public', 'icons');
const sourcePath = path.join(iconDirectory, 'polyhydra-icon.svg');

await mkdir(iconDirectory, {recursive: true});
const source = await readFile(sourcePath);

const outputs = [
  {name: 'icon-192.png', size: 192},
  {name: 'icon-512.png', size: 512},
  {name: 'icon-512-maskable.png', size: 512},
];

await Promise.all(outputs.map(({name, size}) => (
  sharp(source)
    .resize(size, size)
    .flatten({background: '#0a0a0a'})
    .removeAlpha()
    .png({compressionLevel: 9})
    .toFile(path.join(iconDirectory, name))
)));

console.log(`Generated ${outputs.length} PWA icons in ${iconDirectory}`);
