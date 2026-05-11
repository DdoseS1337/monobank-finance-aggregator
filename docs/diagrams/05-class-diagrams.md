# Class Diagrams (per Bounded Context)

UML-style class diagrams for the core aggregates. Generated from the actual entity classes in `backend/src/modules/*/domain/`.

## Budgeting

```mermaid
classDiagram
    direction LR

    class Budget {
      +id: BudgetId
      +userId: UserId
      +name: string
      +method: BudgetMethod
      +cadence: Cadence
      +baseCurrency: Currency
      +rolloverPolicy: RolloverPolicy
      +status: BudgetStatus
      +periods: BudgetPeriod[]
      +startPeriod(period): BudgetPeriod
      +closeCurrentPeriod(closing?)
      +addLine(line)
      +archive()
      +evaluateHealth(): BudgetHealth
      +pullEvents(): DomainEvent[]
    }

    class BudgetPeriod {
      +id: BudgetPeriodId
      +budgetId: BudgetId
      +period: Period
      +status: PeriodStatus
      +openingBalance: Money?
      +closingBalance: Money?
      +lines: BudgetLine[]
      +addLine(line)
      +findLineByCategory(catId): BudgetLine?
      +totalPlanned(): Money?
      +totalSpent(): Money?
      +close(closingBalance?)
    }

    class BudgetLine {
      +id: BudgetLineId
      +budgetPeriodId: BudgetPeriodId
      +categoryId: CategoryId?
      +plannedAmount: Money
      +spentAmount: Money
      +thresholdPct: number
      +status: BudgetLineStatus
      +setSpent(amount)
      +adjustPlanned(money)
      +burnRate(elapsedRatio): BurnRate
      +spentPct(): number
    }

    class EnvelopeBucket {
      +id: EnvelopeId
      +userId: UserId
      +balance: Money
      +targetBalance: Money?
      +fund(amount, source): EnvelopeMovement
      +spend(amount, ref): EnvelopeMovement
      +transferTo(target, amount)
      +archive()
    }

    Budget "1" *-- "0..*" BudgetPeriod
    BudgetPeriod "1" *-- "1..*" BudgetLine
```

**File anchors:**
- [`Budget`](backend/src/modules/budgeting/domain/budget.entity.ts)
- [`BudgetPeriod`](backend/src/modules/budgeting/domain/budget-period.entity.ts)
- [`BudgetLine`](backend/src/modules/budgeting/domain/budget-line.entity.ts)
- [`EnvelopeBucket`](backend/src/modules/budgeting/domain/envelope.entity.ts)

---

## Goals

```mermaid
classDiagram
    direction LR

    class FinancialGoal {
      +id: GoalId
      +userId: UserId
      +type: GoalType
      +targetAmount: Money
      +currentAmount: Money
      +deadline: Date?
      +priority: 1..5
      +fundingStrategy: FundingStrategy
      +status: GoalStatus
      +feasibilityScore: number?
      +contribute(amount, source): GoalContribution
      +adjustTarget(money)
      +adjustDeadline(date?)
      +pause() / resume() / abandon()
      +recalculateFeasibility(): FeasibilityScore
      +monthsUntilDeadline(): number?
      +requiredMonthlyContribution(): Money?
      +averageMonthlyContribution(): number
    }

    class GoalContribution {
      +id: ContributionId
      +amount: Money
      +sourceType: ContributionSource
      +sourceRef: string?
      +madeAt: Date
    }

    class GoalMilestone {
      +thresholdPct: 25/50/75/100
      +reachedAt: Date?
      +rewardText: string?
    }

    class FeasibilityScore {
      <<value object>>
      +value: 0..1
      +category(): FeasibilityCategory
      +isAtRisk(): boolean
      +static fromPace(input)
    }

    FinancialGoal "1" *-- "*" GoalContribution
    FinancialGoal "1" *-- "*" GoalMilestone
    FinancialGoal -- FeasibilityScore : computes
```

---

## Cashflow

```mermaid
classDiagram
    direction TB

    class CashFlowProjection {
      +id: ProjectionId
      +userId: UserId
      +horizonDays: number
      +modelVersion: string
      +confidenceScore: number?
      +isLatest: boolean
      +points: ProjectionPoint[]
      +assumptions: ProjectionAssumption[]
      +detectDeficitWindows(threshold=0): DeficitWindow[]
    }

    class ProjectionPoint {
      <<value object>>
      +day: Date
      +balanceP10: Decimal
      +balanceP50: Decimal
      +balanceP90: Decimal
      +expectedInflow: Decimal
      +expectedOutflow: Decimal
      +hasDeficitRisk: boolean
      +uncertainty(): Decimal
    }

    class DeficitWindow {
      <<value object>>
      +start: Date
      +end: Date
      +worstDay: Date
      +worstAmount: number
      +confidence: number
    }

    class Scenario {
      +id: ScenarioId
      +baselineProjectionId: ProjectionId?
      +variables: ScenarioVariableKind[]
      +outcomes: ScenarioOutcome[]?
      +recordOutcomes(outcomes)
    }

    CashFlowProjection "1" *-- "*" ProjectionPoint
    CashFlowProjection ..> DeficitWindow : derives
    Scenario "0..1" --> "1" CashFlowProjection : baseline
```

---

## Recommendations

```mermaid
classDiagram
    class Recommendation {
      +id: RecommendationId
      +userId: UserId
      +kind: RecommendationKind
      +priority: 1..5
      +generatedBy: rules|ml|llm|hybrid
      +payload: Record~string,unknown~
      +explanation: string
      +expectedImpact: ExpectedImpact?
      +ranking: RankingScore?
      +status: RecommendationStatus
      +setRanking(score)
      +markDelivered(channel)
      +recordDecision(decision)
      +isExpired(at?): boolean
    }

    class RankingScore {
      <<value object>>
      +total: 0..1
      +breakdown: RankingBreakdown
      +weights: RankingWeights
      +static compute(breakdown, weights)
    }

    class RankingBreakdown {
      <<value object>>
      +utility: 0..1
      +urgency: 0..1
      +novelty: 0..1
      +userFit: 0..1
    }

    class ExpectedImpact {
      <<value object>>
      +financial: Money?
      +timeframe: string?
      +description: string
    }

    Recommendation --> RankingScore
    RankingScore *-- RankingBreakdown
    Recommendation --> ExpectedImpact
```

---

## AI Memory

```mermaid
classDiagram
    class MemoryRecord {
      +id: MemoryRecordId
      +userId: UserId
      +kind: SEMANTIC|EPISODIC|PROCEDURAL
      +content: string
      +embedding: Float32Array?
      +importanceScore: 0..1
      +decayFactor: 0..1
      +relatedEntities: string[]
      +supersededById: MemoryRecordId?
      +recordAccess(at?)
      +applyDecay(factor)
      +bumpImportance(delta)
      +supersedeBy(id)
      +effectiveImportance(at?): number
    }

    class MemoryService {
      +write(input): MemoryRecord
      +recall(query): RecallResult[]
      +writeEpisodic(userId, content, ...)
      +writeSemantic(userId, content, ...)
    }

    class MemoryConsolidationService {
      +consolidateForUser(userId)
      -SYSTEM_PROMPT
      -REFLECTION_SCHEMA
    }

    class MemoryDecayService {
      +applyNightlyDecay(): number
    }

    MemoryService --> MemoryRecord : creates
    MemoryConsolidationService --> MemoryService : promotes EPISODIC→SEMANTIC
    MemoryDecayService ..> MemoryRecord : bulk update
```
