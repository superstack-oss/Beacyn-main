const fs = require('fs');
const path = require('path');

const base = '/Users/atanukumarpal/Documents/Devlopment/uptime/src/pages/main';
const dirs = ['admin', 'broadcast', 'database', 'datacenter', 'infrastructure', 'investigate', 'uptime'];

let fixedCount = 0;

dirs.forEach(d => {
  const dirPath = path.join(base, d);
  if (!fs.existsSync(dirPath)) return;
  
  const files = fs.readdirSync(dirPath);
  files.forEach(f => {
    if (f.endsWith('.tsx') || f.endsWith('.ts')) {
      const filePath = path.join(dirPath, f);
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Replace static and default imports
      // e.g., import { X } from '../../lib' -> '../../../lib'
      // e.g., import '../../styles.css' -> '../../../styles.css'
      const original = content;
      content = content.replace(/(import\s+.*?from\s+['"])\.\.\/\.\.\//g, '$1../../../');
      content = content.replace(/(import\s+['"])\.\.\/\.\.\//g, '$1../../../');

      if (original !== content) {
        fs.writeFileSync(filePath, content);
        console.log('Fixed imports in:', path.join(d, f));
        fixedCount++;
      }
    }
  });
});

console.log(`Fixed imports in ${fixedCount} files.`);
