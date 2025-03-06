import {
  type BinaryOperationNode,
  FunctionNode,
  Kysely,
  OperatorNode,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  PrimitiveValueListNode,
  ValueNode,
} from 'kysely';
import { type PostgresJSDialectConfig, PostgresJSDriver } from 'kysely-postgres-js';
import postgres from 'postgres';

import { DittoPgMigrator } from '../DittoPgMigrator.ts';
import { KyselyLogger } from '../KyselyLogger.ts';

import type { DittoDB, DittoDBOpts } from '../DittoDB.ts';
import type { DittoTables } from '../DittoTables.ts';

export class DittoPostgres implements DittoDB {
  private pg: ReturnType<typeof postgres>;
  private migrator: DittoPgMigrator;

  readonly kysely: Kysely<DittoTables>;

  constructor(databaseUrl: string, opts?: DittoDBOpts) {
    this.pg = postgres(databaseUrl, { max: opts?.poolSize });

    this.kysely = new Kysely<DittoTables>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () =>
          new PostgresJSDriver({ postgres: this.pg as unknown as PostgresJSDialectConfig['postgres'] }),
        createIntrospector: (db) => new PostgresIntrospector(db),
        createQueryCompiler: () => new DittoPostgresQueryCompiler(),
      },
      log: KyselyLogger,
    });

    this.migrator = new DittoPgMigrator(this.kysely);
  }

  listen(channel: string, callback: (payload: string) => void): void {
    this.pg.listen(channel, callback);
  }

  async migrate(): Promise<void> {
    await this.migrator.migrate();
  }

  get poolSize(): number {
    return this.pg.connections.open;
  }

  get availableConnections(): number {
    return this.pg.connections.idle;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.pg.end({ timeout: 0 }); // force-close the connections
    await this.kysely.destroy();
  }
}

/** Converts `in` queries to `any` to improve prepared statements on Postgres. */
class DittoPostgresQueryCompiler extends PostgresQueryCompiler {
  protected override visitBinaryOperation(node: BinaryOperationNode): void {
    if (
      OperatorNode.is(node.operator) && node.operator.operator === 'in' && PrimitiveValueListNode.is(node.rightOperand)
    ) {
      this.visitNode(node.leftOperand);
      this.append(' = ');
      this.visitNode(FunctionNode.create('any', [ValueNode.create(node.rightOperand.values)]));
    } else {
      super.visitBinaryOperation(node);
    }
  }
}
