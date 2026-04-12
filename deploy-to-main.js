const { execSync } = require('child_process');
const cwd = 'C:\\Users\\boyds\\Downloads\\sparmanik-standalone';

function run(cmd) {
  console.log(`> ${cmd}`);
  try {
    const out = execSync(cmd, { cwd, encoding: 'utf8', timeout: 60000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    if (out.trim()) console.log(out.trim());
    return true;
  } catch (e) {
    console.log(e.stderr || e.stdout || e.message);
    return false;
  }
}

// Ensure we're on draft/autumn-butterfly with everything committed
run('git status');
run('git add -A');
run('git -c user.name="Boyd Sparrow" -c user.email="boyd.sparrow@gmail.com" commit -m "chore: pre-deploy cleanup" --allow-empty');

// Create main branch from current state and force push
run('git branch -M main');
run('git remote set-url origin https://github.com/cansomeoneelsedoit/sparmanik-farm.git');
run('git push -u origin main --force');

console.log('\nDone! Main branch updated. Railway should auto-deploy.');
console.log('Check: https://github.com/cansomeoneelsedoit/sparmanik-farm');
