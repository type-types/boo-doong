import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = (typeof __dirname === 'undefined') ? fileURLToPath(import.meta.url) : __filename as any;
const __dirname2 = path.dirname(__filename);

export function mountStatic(app: express.Express) {
  const pubDir = path.join(__dirname2, '..', 'public');
  app.use(express.static(pubDir));
}




