import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DomainEventBus } from '../../../shared-kernel/events/domain-event-bus';
import { Scenario, ScenarioVariableKind } from '../domain/scenario.entity';
import {
  PROJECTION_REPOSITORY,
  ProjectionRepository,
  SCENARIO_REPOSITORY,
  ScenarioRepository,
} from '../domain/repositories.interface';
import { ScenarioSimulator } from './simulation/scenario-simulator.service';
import { ScenarioSimulated } from '../domain/events/cashflow-events';

@Injectable()
export class ScenariosService {
  constructor(
    @Inject(SCENARIO_REPOSITORY)
    private readonly scenarios: ScenarioRepository,
    @Inject(PROJECTION_REPOSITORY)
    private readonly projections: ProjectionRepository,
    private readonly simulator: ScenarioSimulator,
    private readonly events: DomainEventBus,
  ) {}

  async create(input: {
    userId: string;
    name: string;
    variables: ScenarioVariableKind[];
    /** Optional baseline; if omitted we use the current latest projection. */
    baselineProjectionId?: string;
    /** When true, run the simulation immediately and return outcomes. */
    runNow?: boolean;
  }): Promise<Scenario> {
    let baseline = null;
    if (input.baselineProjectionId) {
      baseline = await this.projections.findById(input.baselineProjectionId);
      if (!baseline || baseline.userId !== input.userId) {
        throw new NotFoundException('Baseline projection not found');
      }
    } else {
      baseline = await this.projections.findLatest(input.userId);
    }

    const scenario = Scenario.create({
      userId: input.userId,
      name: input.name,
      variables: input.variables,
      baselineProjectionId: baseline?.id ?? null,
    });

    if (input.runNow ?? true) {
      if (!baseline) {
        throw new NotFoundException(
          'No baseline projection exists yet — run /cashflow/refresh first',
        );
      }
      const outcomes = await this.simulator.simulate(scenario, baseline);
      scenario.recordOutcomes(outcomes);
    }

    await this.scenarios.save(scenario);
    if (scenario.outcomes && baseline) {
      await this.events.publish(
        new ScenarioSimulated(
          scenario.id,
          {
            scenarioId: scenario.id,
            userId: input.userId,
            baselineProjectionId: baseline.id,
          },
          { userId: input.userId },
        ),
      );
    }
    return scenario;
  }

  async list(userId: string): Promise<Scenario[]> {
    return this.scenarios.findByUser(userId);
  }

  async getOne(userId: string, scenarioId: string): Promise<Scenario> {
    const scenario = await this.scenarios.findById(scenarioId);
    if (!scenario || scenario.userId !== userId) {
      throw new NotFoundException(`Scenario ${scenarioId} not found`);
    }
    return scenario;
  }

  async resimulate(userId: string, scenarioId: string): Promise<Scenario> {
    const scenario = await this.getOne(userId, scenarioId);
    const baseline = scenario.baselineProjectionId
      ? await this.projections.findById(scenario.baselineProjectionId)
      : await this.projections.findLatest(userId);
    if (!baseline) {
      throw new NotFoundException('Baseline projection no longer available');
    }
    const outcomes = await this.simulator.simulate(scenario, baseline);
    scenario.recordOutcomes(outcomes);
    await this.scenarios.save(scenario);
    return scenario;
  }

  async delete(userId: string, scenarioId: string): Promise<void> {
    const scenario = await this.getOne(userId, scenarioId);
    await this.scenarios.delete(scenario.id);
  }
}
