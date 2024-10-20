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

import { DittoDatabase, DittoDatabaseOpts } from '@/db/DittoDatabase.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { KyselyLogger } from '@/db/KyselyLogger.ts';

export class DittoPostgres {
  static create(databaseUrl: string, opts?: DittoDatabaseOpts): DittoDatabase {
    const pg = postgres(databaseUrl, { max: opts?.poolSize });

    const kysely = new Kysely<DittoTables>({
      dialect: {
        createAdapter() {
          return new PostgresAdapter();
        },
        createDriver() {
          return new PostgresJSDriver({
            postgres: pg as unknown as PostgresJSDialectConfig['postgres'],
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

    const listen = (channel: string, callback: (payload: string) => void): void => {
      pg.listen(channel, callback);
    };

    return {
      kysely,
      get poolSize() {
        return pg.connections.open;
      },
      get availableConnections() {
        return pg.connections.idle;
      },
      listen,
    };
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
