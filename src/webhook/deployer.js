'use strict';
/**
 * src/webhook/deployer.js
 * Menjalankan `git pull origin <branch>` di direktori proyek.
 */

const { exec } = require('child_process');
const { PROJECT_DIR, BRANCH, log } = require('./config');

/**
 * Jalankan git pull origin <BRANCH> di PROJECT_DIR secara async.
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function runGitPull() {
  return new Promise((resolve, reject) => {
    const command = `git -C "${PROJECT_DIR}" pull origin ${BRANCH}`;
    log('INFO', `Menjalankan: ${command}`);

    exec(command, (err, stdout, stderr) => {
      if (err) {
        reject({ error: err.message, stderr });
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

module.exports = { runGitPull };
