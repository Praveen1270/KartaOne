/**
 * Type declarations for Node.js 22 built-in sqlite module (experimental).
 * Full types will be available in @types/node once stabilised.
 */

declare module "node:sqlite" {
  interface StatementResultingChanges {
    changes: number;
    lastInsertRowid: number;
  }

  type SupportedValueType = null | number | bigint | string | Uint8Array;

  interface StatementSync {
    get(...params: SupportedValueType[]): Record<string, SupportedValueType> | undefined;
    all(...params: SupportedValueType[]): Array<Record<string, SupportedValueType>>;
    run(...params: SupportedValueType[]): StatementResultingChanges;
    iterate(...params: SupportedValueType[]): IterableIterator<Record<string, SupportedValueType>>;
    setAllowBareNamedParameters(enabled: boolean): void;
    setReadBigInts(enabled: boolean): void;
    readonly columnNames: string[];
    readonly parameterCount: number;
    readonly sourceSQL: string;
    readonly expandedSQL: string;
  }

  interface DatabaseSyncOptions {
    open?: boolean;
    enableForeignKeyConstraints?: boolean;
    readOnly?: boolean;
  }

  class DatabaseSync {
    constructor(location: string, options?: DatabaseSyncOptions);
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    open(): void;
    readonly open: boolean;
    readonly isTransaction: boolean;
    transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T;
    backup(destination: string, options?: { source?: string }): Promise<void>;
  }

  export { DatabaseSync };
}
