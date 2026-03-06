/**
 * SandboxTester — runs LLM-generated skill tests in an isolated child process.
 * If the test process crashes, times out, or exits non-zero, the skill is rejected.
 * Skills must pass tests before they are registered and executed.
 */

import { spawn } from "child_process";
import * as path from "path";

export interface TestResult {
  passed: boolean;
  errors: string[];
  output: string;
  durationMs: number;
}

export class SandboxTester {
  private timeoutMs = 60_000; // 60 seconds — LLM-generated skills may need time

  async test(skillPath: string, testPath: string): Promise<TestResult> {
    return new Promise((resolve) => {
      const start = Date.now();
      const errors: string[] = [];
      let output = "";
      let settled = false;

      const settle = (result: TestResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      const child = spawn(
        "npx",
        ["ts-node", "--transpile-only", testPath],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            NODE_ENV: "test",
            SANDBOX: "true",
            TS_NODE_TRANSPILE_ONLY: "true",
          },
          shell: process.platform === "win32",
        }
      );

      child.stdout.on("data", (data: Buffer) => {
        output += data.toString();
      });

      child.stderr.on("data", (data: Buffer) => {
        const text = data.toString();
        // ts-node prints compilation info to stderr — filter to real errors
        if (
          !text.includes("ts-node") &&
          !text.includes("Compiling") &&
          !text.includes("DeprecationWarning")
        ) {
          errors.push(text);
        }
      });

      child.on("close", (code) => {
        settle({
          passed: code === 0 && errors.every((e) => !e.includes("Error")),
          errors,
          output,
          durationMs: Date.now() - start,
        });
      });

      child.on("error", (err) => {
        settle({
          passed: false,
          errors: [err.message],
          output,
          durationMs: Date.now() - start,
        });
      });

      const timer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* ignore */ }
        settle({
          passed: false,
          errors: [`Test timed out after ${this.timeoutMs}ms`],
          output,
          durationMs: this.timeoutMs,
        });
      }, this.timeoutMs);
    });
  }
}
