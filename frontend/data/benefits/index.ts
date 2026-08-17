import { BenefitDefinition } from './types';
import { medicineBenefit } from './medicine';
import { financialAidBenefit } from './financial-aid';
import { physicalIdBenefit } from './physical-id';
import { movieCenterBenefit } from './movie-center';
import { checkUpBenefit } from './check-up';
import { emergencyBenefit } from './emergency';

export const BENEFITS: BenefitDefinition[] = [
  medicineBenefit,
  financialAidBenefit,
  physicalIdBenefit,
  movieCenterBenefit,
  checkUpBenefit,
  emergencyBenefit,
];

export const BENEFIT_ITEMS = BENEFITS;

export function getBenefitById(benefitId?: string): BenefitDefinition | undefined {
  if (!benefitId) {
    return undefined;
  }

  return BENEFITS.find((benefit) => benefit.id === benefitId);
}

export type { BenefitDefinition } from './types';
