const { execSync } = require('child_process');

function run(cmd) {
  console.log(`> ${cmd}`);
  try {
    const out = execSync(cmd, { 
      cwd: 'C:\\Users\\boyds\\Downloads\\sparmanik-standalone',
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    });
    if (out.trim()) console.log(out.trim());
    return true;
  } catch (e) {
    console.log(e.stderr || e.message);
    return false;
  }
}

// Check git
if (!run('git --version')) {
  console.log('Git not found!');
  process.exit(1);
}

// Init and configure
run('git init');
run('git checkout -b draft/autumn-butterfly');
run('git add -A');
run('git -c user.name="Boyd Sparrow" -c user.email="boyd.sparrow@gmail.com" commit -m "feat: standalone React app with 429 inventory items, bilingual EN/ID"');
run('git remote add origin https://github.com/cansomeoneelsedoit/sparmanik-farm.git');
run('git remote set-url origin https://github.com/cansomeoneelsedoit/sparmanik-farm.git');
run('git push -u origin draft/autumn-butterfly --force');

console.log('\nDone! Check: https://github.com/cansomeoneelsedoit/sparmanik-farm/tree/draft/autumn-butterfly');
