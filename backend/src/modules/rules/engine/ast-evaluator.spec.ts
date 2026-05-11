import { AstEvaluator } from './ast-evaluator';
import { ConditionASTNode, EvaluationContext } from '../domain/rule-schemas';

describe('AstEvaluator', () => {
  const evaluator = new AstEvaluator();

  const baseCtx: EvaluationContext = {
    time: { dayOfWeek: 3, hourOfDay: 14 },
    transaction: {
      amount: 1500,
      mccCode: 5411,
      categorySlug: 'food--groceries',
      merchantName: 'Silpo',
      type: 'DEBIT',
      description: 'silpo kyiv',
    },
  };

  it('evaluates EQ on string field', () => {
    const ast: ConditionASTNode = { op: 'EQ', field: 'transaction.type', value: 'DEBIT' };
    expect(evaluator.evaluate(ast, baseCtx)).toBe(true);
  });

  it('evaluates GT on number field', () => {
    const ast: ConditionASTNode = { op: 'GT', field: 'transaction.amount', value: 1000 };
    expect(evaluator.evaluate(ast, baseCtx)).toBe(true);
  });

  it('short-circuits AND', () => {
    const ast: ConditionASTNode = {
      op: 'AND',
      left: { op: 'EQ', field: 'transaction.type', value: 'CREDIT' },
      right: { op: 'GT', field: 'transaction.amount', value: 0 },
    };
    expect(evaluator.evaluate(ast, baseCtx)).toBe(false);
  });

  it('short-circuits OR', () => {
    const ast: ConditionASTNode = {
      op: 'OR',
      left: { op: 'EQ', field: 'transaction.type', value: 'CREDIT' },
      right: { op: 'GT', field: 'transaction.amount', value: 100 },
    };
    expect(evaluator.evaluate(ast, baseCtx)).toBe(true);
  });

  it('NOT inverts', () => {
    const ast: ConditionASTNode = {
      op: 'NOT',
      expr: { op: 'EQ', field: 'transaction.type', value: 'CREDIT' },
    };
    expect(evaluator.evaluate(ast, baseCtx)).toBe(true);
  });

  it('IN matches one of values', () => {
    const ast: ConditionASTNode = {
      op: 'IN',
      field: 'transaction.mccCode',
      values: [5411, 5412, 5499],
    };
    expect(evaluator.evaluate(ast, baseCtx)).toBe(true);
  });

  it('CONTAINS is case insensitive', () => {
    const ast: ConditionASTNode = {
      op: 'CONTAINS',
      field: 'transaction.merchantName',
      substring: 'silpo',
    };
    expect(evaluator.evaluate(ast, baseCtx)).toBe(true);
  });

  it('GT against missing field returns false (does not throw)', () => {
    const ctxWithoutTransaction: EvaluationContext = { time: baseCtx.time };
    const ast: ConditionASTNode = { op: 'GT', field: 'transaction.amount', value: 0 };
    expect(evaluator.evaluate(ast, ctxWithoutTransaction)).toBe(false);
  });

  it('IN against null field returns false', () => {
    const ctxNull: EvaluationContext = {
      time: baseCtx.time,
      transaction: { ...baseCtx.transaction!, mccCode: null },
    };
    const ast: ConditionASTNode = {
      op: 'IN',
      field: 'transaction.mccCode',
      values: [5411],
    };
    expect(evaluator.evaluate(ast, ctxNull)).toBe(false);
  });

  it('combines AND and OR with NOT correctly', () => {
    // type=DEBIT AND (mccCode=5411 OR amount>5000)
    const ast: ConditionASTNode = {
      op: 'AND',
      left: { op: 'EQ', field: 'transaction.type', value: 'DEBIT' },
      right: {
        op: 'OR',
        left: { op: 'EQ', field: 'transaction.mccCode', value: 5411 },
        right: { op: 'GT', field: 'transaction.amount', value: 5000 },
      },
    };
    expect(evaluator.evaluate(ast, baseCtx)).toBe(true);

    const ctxNonGroceries: EvaluationContext = {
      ...baseCtx,
      transaction: { ...baseCtx.transaction!, mccCode: 6000, amount: 100 },
    };
    expect(evaluator.evaluate(ast, ctxNonGroceries)).toBe(false);
  });
});
