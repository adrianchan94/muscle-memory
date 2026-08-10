export function evaluateGateResults({ commands, sourceBundleSha256, checkedInBundleSha256, packageSmokePass }) {
  const failures = [];
  for (const command of commands || []) {
    if (command.exitCode !== 0) failures.push(`command:${command.name}:exit=${command.exitCode}`);
  }
  if (!sourceBundleSha256 || sourceBundleSha256 !== checkedInBundleSha256) failures.push("bundle-parity");
  if (!packageSmokePass) failures.push("package-smoke");
  return { pass: failures.length === 0, failures };
}
