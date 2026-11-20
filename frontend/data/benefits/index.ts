import { BenefitDefinition } from './types';
import { medicineBenefit } from './medicine';
import { financialAidBenefit } from './financial-aid';
import { physicalIdBenefit } from './physical-id';
import { movieCenterBenefit } from './movie-center';
import { checkUpBenefit } from './check-up';
import { emergencyBenefit } from './emergency';
import { philHealthBenefit } from './philhealth';
import { socialPensionBenefit } from './social-pension';
import { purchaseBookletBenefit } from './purchase-booklet';
import { oscaTransferBenefit } from './osca-transfer';
import { financialAssistanceBenefit } from './financial-assistance';

export const ALL_BENEFITS: BenefitDefinition[] = [
  medicineBenefit,
  financialAidBenefit,
  financialAssistanceBenefit,
  physicalIdBenefit,
  movieCenterBenefit,
  philHealthBenefit,
  socialPensionBenefit,
  purchaseBookletBenefit,
  oscaTransferBenefit,
  checkUpBenefit,
  emergencyBenefit,
];

export const BENEFITS: BenefitDefinition[] = [
  financialAidBenefit,
  financialAssistanceBenefit,
  physicalIdBenefit,
  movieCenterBenefit,
  philHealthBenefit,
  socialPensionBenefit,
  purchaseBookletBenefit,
  oscaTransferBenefit,
  checkUpBenefit,
  emergencyBenefit,
];

export const BENEFIT_ITEMS = BENEFITS;

export function getBenefitById(
  benefitId?: string
): BenefitDefinition | undefined {
  if (!benefitId) {
    return undefined;
  }

  return ALL_BENEFITS.find((benefit) => benefit.id === benefitId);
}

export type { BenefitDefinition } from './types';
