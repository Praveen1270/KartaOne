/**
 * SandboxValidator — safety checker for LLM-generated skill code.
 * Runs BEFORE any generated code is installed or executed.
 * Blocks patterns that could damage the system or exfiltrate data.
 */

export interface ValidationResult {
  safe: boolean;
  issues: string[];
  warnings: string[];
}

interface Pattern {
  pattern: RegExp;
  reason: string;
}

const BANNED_PATTERNS: Pattern[] = [
  // System destruction
  { pattern: /rm\s+-rf/g,                           reason: "Recursive file deletion (rm -rf)" },
  { pattern: /process\.exit\s*\(/g,                 reason: "Process termination (process.exit)" },
  { pattern: /child_process\s*\.\s*exec\s*\(/g,     reason: "Raw shell execution (child_process.exec)" },
  { pattern: /child_process\s*\.\s*execSync\s*\(/g, reason: "Raw shell execution (execSync)" },
  { pattern: /child_process\s*\.\s*spawnSync\s*\(/g,reason: "Raw shell execution (spawnSync)" },
  { pattern: /\beval\s*\(/g,                        reason: "Dynamic code evaluation (eval)" },
  { pattern: /\bnew\s+Function\s*\(/g,              reason: "Dynamic function creation (new Function)" },

  // File system abuse — block writes/deletes outside tmp
  {
    pattern: /(?:fs|promises)\s*\.\s*(?:unlink|rmdir|rm)\s*\(\s*['"`](?!(?:\/tmp|os\.tmpdir))/g,
    reason: "Deleting files outside system tmp directory",
  },

  // Network abuse
  { pattern: /require\s*\(\s*['"`]net['"`]\s*\)/g,   reason: "Raw TCP socket access (net module)" },
  { pattern: /require\s*\(\s*['"`]dgram['"`]\s*\)/g, reason: "UDP socket access (dgram module)" },

  // Environment tampering
  { pattern: /process\.env\s*=\s*/g,               reason: "Overwriting process.env" },
  { pattern: /delete\s+process\.env\s*\[/g,        reason: "Deleting env vars" },

  // Crypto mining
  { pattern: /cryptonight|monero|stratum\+tcp/gi,  reason: "Crypto mining pattern detected" },

  // Exfiltration via DNS/ICMP
  { pattern: /dns\s*\.\s*resolve\s*\(/g,           reason: "Potential DNS exfiltration" },
];

const WARNING_PATTERNS: Pattern[] = [
  { pattern: /https?:\/\//g,                                    reason: "Makes external HTTP requests" },
  { pattern: /require\s*\(\s*['"`]child_process['"`]\s*\)/g,   reason: "Uses child_process module" },
  { pattern: /require\s*\(\s*['"`]fs['"`]\s*\)/g,              reason: "Uses filesystem" },
  { pattern: /process\.env\./g,                                 reason: "Reads environment variables" },
];

export class SandboxValidator {
  validate(code: string): ValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];

    for (const { pattern, reason } of BANNED_PATTERNS) {
      // Reset lastIndex since we reuse patterns with /g flag
      pattern.lastIndex = 0;
      if (pattern.test(code)) {
        issues.push(reason);
      }
    }

    for (const { pattern, reason } of WARNING_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(code)) {
        warnings.push(reason);
      }
    }

    return {
      safe: issues.length === 0,
      issues,
      warnings,
    };
  }
}
