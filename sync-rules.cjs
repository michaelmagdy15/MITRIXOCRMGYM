const fs = require('fs');
const path = require('path');

// Target file name
const FILENAME = 'firestore.rules';

// Target projects configurations
// We define both absolute and relative path paths to support different environments.
const projectDefinitions = [
  {
    name: 'Strike CRM',
    absolute: 'C:/Users/Mi5a/MitrixoGYMCRMPlatform',
    relative: '../MitrixoGYMCRMPlatform'
  },
  {
    name: 'ATPL Vector',
    absolute: 'C:/Users/Mi5a/atplvector',
    relative: '../atplvector'
  },
  {
    name: 'GamenEG-Brand',
    absolute: 'C:/Users/Mi5a/GamenEG-Brand',
    relative: '../GamenEG-Brand'
  },
  {
    name: 'Matchmaking CRM',
    absolute: 'H:/Matchmaking CRM/strike-boxing-crm2-master',
    relative: '../../Matchmaking CRM/strike-boxing-crm2-master'
  }
];

// Helper to resolve the directory path for a project configuration
function resolveProjectDir(def) {
  // Check relative path first
  if (def.relative) {
    const relativePath = path.resolve(process.cwd(), def.relative);
    if (fs.existsSync(relativePath) && fs.statSync(relativePath).isDirectory()) {
      return relativePath;
    }
  }

  // Check absolute path
  const absolutePath = path.normalize(def.absolute);
  if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory()) {
    return absolutePath;
  }

  return null;
}

function main() {
  console.log('=== Firestore Rules Sync Started ===');
  
  const activeProjects = [];
  
  // Resolve all existing project paths and check if they have firestore.rules
  for (const def of projectDefinitions) {
    const dir = resolveProjectDir(def);
    if (dir) {
      const filePath = path.join(dir, FILENAME);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        activeProjects.push({
          name: def.name,
          dir: dir,
          filePath: filePath,
          mtime: stats.mtime
        });
      } else {
        console.log(`[Warning] Project folder found for '${def.name}' at: ${dir}, but no '${FILENAME}' file exists inside.`);
      }
    } else {
      console.log(`[Info] Project folder for '${def.name}' not found locally. Skipping sync for this project.`);
    }
  }

  if (activeProjects.length < 2) {
    console.log('[Info] Less than 2 active projects found on this machine. Sync is not required.');
    console.log('=== Firestore Rules Sync Finished ===\n');
    return;
  }

  // Sort by modification time descending to find the newest modified file
  activeProjects.sort((a, b) => b.mtime - a.mtime);
  
  const source = activeProjects[0];
  console.log(`[Sync] Newest rules file detected in: '${source.name}'`);
  console.log(`       Path: ${source.filePath}`);
  console.log(`       Last Modified: ${source.mtime.toISOString()}`);

  const sourceContent = fs.readFileSync(source.filePath, 'utf8');

  // Copy to all other active projects if the content is different
  for (let i = 1; i < activeProjects.length; i++) {
    const target = activeProjects[i];
    const targetContent = fs.readFileSync(target.filePath, 'utf8');
    
    if (sourceContent !== targetContent) {
      console.log(`[Sync] Copying newest rules to: '${target.name}'`);
      console.log(`       Target: ${target.filePath}`);
      fs.writeFileSync(target.filePath, sourceContent, 'utf8');
    } else {
      console.log(`[Sync] '${target.name}' is already in sync.`);
    }
  }

  console.log('=== Firestore Rules Sync Finished Successfully ===\n');
}

try {
  main();
} catch (error) {
  console.error('[Error] Failed to synchronize firestore.rules:', error);
  // Do not exit with non-zero unless absolutely critical, so we don't break isolated project deploys
  // but if we are in predeploy, a sync crash is good to know. We exit 0 to prevent blockages if it's just path issues.
  process.exit(0);
}
