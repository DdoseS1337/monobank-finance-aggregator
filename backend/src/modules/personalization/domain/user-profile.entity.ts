export type RiskTolerance = 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
export type LiteracyLevel = 'BEGINNER' | 'INTERMEDIATE' | 'EXPERT';
export type Tone = 'FORMAL' | 'FRIENDLY' | 'DIRECT';
export type Channel = 'in_app' | 'email' | 'push' | 'telegram';

export interface BehavioralTraits {
  /** 0..1 — share of debits in evening (18-23). */
  eveningSpenderScore: number;
  /** 0..1 — share of weekend spend vs weekday. */
  weekendSpenderScore: number;
  /** 0..1 — coefficient of variation of daily spend (high = impulsive). */
  impulsivityScore: number;
  /** 0..1 — share of recurring (planned) outflow. */
  plannerScore: number;
  /** Cluster id for marketing-style segmentation; populated by behavior-modeler. */
  segment: string | null;
  observations: number;
  computedAt: string | null;
}

export interface QuietHours {
  from: string; // "HH:mm"
  to: string;
}

export interface UserProfileProps {
  userId: string;
  riskTolerance: RiskTolerance;
  financialLiteracyLevel: LiteracyLevel;
  behavioralTraits: BehavioralTraits;
  preferredTone: Tone;
  preferredChannels: Channel[];
  preferredLanguage: 'uk' | 'en';
  quietHours: QuietHours | null;
  updatedAt: Date;
}

const DEFAULT_TRAITS: BehavioralTraits = {
  eveningSpenderScore: 0,
  weekendSpenderScore: 0,
  impulsivityScore: 0,
  plannerScore: 0,
  segment: null,
  observations: 0,
  computedAt: null,
};

export class UserProfile {
  private constructor(private props: UserProfileProps) {}

  static rehydrate(props: UserProfileProps): UserProfile {
    return new UserProfile(props);
  }

  static initialFor(userId: string): UserProfile {
    return new UserProfile({
      userId,
      riskTolerance: 'MODERATE',
      financialLiteracyLevel: 'INTERMEDIATE',
      behavioralTraits: { ...DEFAULT_TRAITS },
      preferredTone: 'FRIENDLY',
      preferredChannels: ['in_app'],
      preferredLanguage: 'uk',
      quietHours: null,
      updatedAt: new Date(),
    });
  }

  get userId(): string {
    return this.props.userId;
  }
  get riskTolerance(): RiskTolerance {
    return this.props.riskTolerance;
  }
  get literacy(): LiteracyLevel {
    return this.props.financialLiteracyLevel;
  }
  get traits(): BehavioralTraits {
    return { ...this.props.behavioralTraits };
  }
  get tone(): Tone {
    return this.props.preferredTone;
  }
  get channels(): Channel[] {
    return [...this.props.preferredChannels];
  }
  get language(): 'uk' | 'en' {
    return this.props.preferredLanguage;
  }
  get quietHours(): QuietHours | null {
    return this.props.quietHours ? { ...this.props.quietHours } : null;
  }

  setRiskTolerance(value: RiskTolerance): void {
    this.props.riskTolerance = value;
    this.touch();
  }

  setLiteracy(value: LiteracyLevel): void {
    this.props.financialLiteracyLevel = value;
    this.touch();
  }

  setTone(value: Tone): void {
    this.props.preferredTone = value;
    this.touch();
  }

  setChannels(channels: Channel[]): void {
    if (channels.length === 0) throw new Error('At least one channel required');
    const unique = Array.from(new Set(channels));
    this.props.preferredChannels = unique;
    this.touch();
  }

  setQuietHours(qh: QuietHours | null): void {
    if (qh) this.assertValidTime(qh);
    this.props.quietHours = qh;
    this.touch();
  }

  setLanguage(lang: 'uk' | 'en'): void {
    this.props.preferredLanguage = lang;
    this.touch();
  }

  applyTraits(traits: BehavioralTraits): void {
    this.props.behavioralTraits = { ...traits };
    this.touch();
  }

  toSnapshot(): UserProfileProps {
    return {
      ...this.props,
      behavioralTraits: { ...this.props.behavioralTraits },
      preferredChannels: [...this.props.preferredChannels],
      quietHours: this.props.quietHours ? { ...this.props.quietHours } : null,
    };
  }

  private assertValidTime(qh: QuietHours): void {
    const re = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!re.test(qh.from) || !re.test(qh.to)) {
      throw new Error('Quiet hours must be HH:mm');
    }
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
