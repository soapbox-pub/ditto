import {
  BinaryOperationNode,
  FunctionNode,
  Kysely,
  OperatorNode,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  PrimitiveValueListNode,
  ValueNode,
} from 'kysely';
import { PostgresJSDialectConfig, PostgresJSDriver } from 'kysely-postgres-js';
import postgres from 'postgres';

import { Conf } from '@/config.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { KyselyLogger } from '@/db/KyselyLogger.ts';

export class DittoPostgres {
  static db: Kysely<DittoTables> | undefined;
  static postgres?: postgres.Sql;

  // deno-lint-ignore require-await
  static async getInstance(): Promise<Kysely<DittoTables>> {
    if (!this.postgres) {
      this.postgres = postgres(Conf.databaseUrl, { max: Conf.pg.poolSize });
    }

    if (!this.db) {
      this.db = new Kysely({
        dialect: {
          createAdapter() {
            return new PostgresAdapter();
          },
          createDriver() {
            return new PostgresJSDriver({
              postgres: DittoPostgres.postgres as unknown as PostgresJSDialectConfig['postgres'],
            });
          },
          createIntrospector(db) {
            return new PostgresIntrospector(db);
          },
          createQueryCompiler() {
            return new DittoPostgresQueryCompiler();
          },
        },
        log: KyselyLogger,
      });
    }

    return this.db;
  }

  static get poolSize() {
    return this.postgres?.connections.open ?? 0;
  }

  static get availableConnections(): number {
    return this.postgres?.connections.idle ?? 0;
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
