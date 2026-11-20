#!/usr/bin/env node
// Coffre de fichier, pas un mécanisme de sauvegarde ou de restauration complet.
// Aucune sortie déchiffrée n'est publiée avant vérification de l'étiquette GCM.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat, mkdtemp, link, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const MAGIC = Buffer.from('PATSYGEST-GCM01\n', 'ascii');
const SALT_SIZE = 16, NONCE_SIZE = 12, TAG_SIZE = 16;
const HEADER_SIZE = MAGIC.length + SALT_SIZE + NONCE_SIZE;
const MAX_DATA_SIZE = 2 ** 36 - 32; // maximum GCM par clé/nonce

async function main() {
 const [mode, inputArg, outputArg, ...extra] = process.argv.slice(2);
 if (!['chiffrer','dechiffrer'].includes(mode) || !inputArg || !outputArg || extra.length) {
  throw new Error('Usage : coffre-sauvegarde.mjs chiffrer|dechiffrer entrée sortie ; phrase secrète dans PATSYGEST_BACKUP_PASSPHRASE');
 }
 const password = process.env.PATSYGEST_BACKUP_PASSPHRASE;
 if (!password || Buffer.byteLength(password, 'utf8') < 32) throw new Error('Phrase secrète absente ou inférieure à 32 octets.');
 delete process.env.PATSYGEST_BACKUP_PASSPHRASE;
 const input = resolve(inputArg), output = resolve(outputArg);
 if (input === output) throw new Error('Entrée et sortie identiques interdites.');
 const inputStat = await stat(input);
 if (!inputStat.isFile()) throw new Error('Entrée non régulière.');
 const tempDir = await mkdtemp(join(dirname(output), '.patsygest-coffre-'));
 const temp = join(tempDir, 'contenu');
 let key;
 try {
  if (mode === 'chiffrer') {
   if (inputStat.size > MAX_DATA_SIZE) throw new Error('Fichier trop volumineux pour ce format.');
   const header = Buffer.concat([MAGIC, randomBytes(SALT_SIZE), randomBytes(NONCE_SIZE)]);
   key = scryptSync(password, header.subarray(MAGIC.length, MAGIC.length+SALT_SIZE), 32, { N:32768, r:8, p:1, maxmem:64*1024*1024 });
   const cipher = createCipheriv('aes-256-gcm', key, header.subarray(MAGIC.length+SALT_SIZE));
   cipher.setAAD(header);
   const outputStream = createWriteStream(temp, { flags:'wx', mode:0o600 });
   outputStream.write(header);
   await pipeline(createReadStream(input), cipher, outputStream);
   const file = await open(temp, 'a');
   try { await file.write(cipher.getAuthTag()); } finally { await file.close(); }
  } else {
   if (inputStat.size < HEADER_SIZE + TAG_SIZE || inputStat.size - HEADER_SIZE - TAG_SIZE > MAX_DATA_SIZE) throw new Error('Taille du coffre invalide.');
   const file = await open(input, 'r');
   const header = Buffer.alloc(HEADER_SIZE), tag = Buffer.alloc(TAG_SIZE);
   try {
    if ((await file.read(header, 0, HEADER_SIZE, 0)).bytesRead !== HEADER_SIZE ||
        (await file.read(tag, 0, TAG_SIZE, inputStat.size-TAG_SIZE)).bytesRead !== TAG_SIZE) throw new Error('Coffre tronqué.');
   } finally { await file.close(); }
   if (!header.subarray(0,MAGIC.length).equals(MAGIC)) throw new Error('Format de coffre inconnu.');
   key = scryptSync(password, header.subarray(MAGIC.length, MAGIC.length+SALT_SIZE), 32, { N:32768, r:8, p:1, maxmem:64*1024*1024 });
   const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length+SALT_SIZE));
   decipher.setAAD(header); decipher.setAuthTag(tag);
   const end = inputStat.size-TAG_SIZE-1;
   const encrypted = end < HEADER_SIZE ? Readable.from([]) : createReadStream(input, {start:HEADER_SIZE,end});
   await pipeline(encrypted, decipher, createWriteStream(temp, {flags:'wx',mode:0o600}));
  }
  // link est atomique et refuse toute sortie préexistante ; temp est sur le même FS.
  await link(temp, output);
 } finally {
  key?.fill(0);
  await rm(tempDir, { recursive:true, force:true });
 }
}
main().catch(error => { console.error(`Coffre : ${error.message}`); process.exitCode=1; });
