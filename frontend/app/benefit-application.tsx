import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { getBenefitById } from '../data/benefits';
import BirthdayBenefitTracker from '../components/BirthdayBenefitTracker';
import BirthdayBenefitApplication from '../components/applications/BirthdayBenefitApplication';
import CheckupApplication from '../components/applications/CheckupApplication';
import GeneralBenefitApplication from '../components/applications/GeneralBenefitApplication';
import OscaDocumentApplication from '../components/OscaDocumentApplication';
import physicalId from '../components/applications/osca/osca-physical-id';
import philHealth from '../components/applications/osca/osca-philhealth';
import socialPension from '../components/applications/osca/osca-social-pension';
import purchaseBooklet from '../components/applications/osca/osca-purchase-booklet';
import oscaTransfer from '../components/applications/osca/osca-transfer';
import financialAssistance from '../components/applications/osca/osca-financial-assistance';
import type { OscaApplicationOptions } from '../components/applications/osca/types';

const oscaApplications = new Map<string, OscaApplicationOptions>(
  [physicalId, philHealth, socialPension, purchaseBooklet, oscaTransfer, financialAssistance].map((options) => [options.service, options]),
);

export default function BenefitApplicationScreen() {
  const { user } = useAuth();
  const { benefitId, benefit } = useLocalSearchParams<{ benefitId?: string; benefit?: string }>();
  if (benefitId === 'emergency') return <Redirect href="/emergency" />;
  if (benefitId === 'check-up') return <CheckupApplication key={user?.id} />;
  if (benefitId === 'financial-aid') {
    if (!user) return <BirthdayBenefitApplication />;
    return (
      <BirthdayBenefitTracker
        key={user.id}
        userId={user.id}
        renderForm={(onBirthdaySubmitted) => <BirthdayBenefitApplication onBirthdaySubmitted={onBirthdaySubmitted} />}
      />
    );
  }
  const oscaOptions = benefitId ? oscaApplications.get(benefitId) : undefined;
  if (oscaOptions) return <OscaDocumentApplication key={`${user?.id}:${benefitId}`} options={oscaOptions} />;
  const definition = getBenefitById(benefitId);
  const selectedBenefit = (definition?.applicationValue ?? (typeof benefit === 'string' ? benefit : 'benefit request'))
    .replace(/\s+/g, ' ')
    .trim();
  return (
    <GeneralBenefitApplication
      key={`${user?.id}:${benefitId}`}
      benefitId={benefitId}
      selectedBenefit={selectedBenefit}
      label={definition?.label ?? selectedBenefit}
    />
  );
}
