export interface MerchantRuleEntity {
  id: string;
  pattern: string;
  matchType: 'CONTAINS' | 'EXACT' | 'REGEX';
  field: 'MERCHANT' | 'DESCRIPTION' | 'BOTH';
  category: string;
  subcategory: string | null;
  priority: number;
  isActive: boolean;
  createdAt: Date;
}
