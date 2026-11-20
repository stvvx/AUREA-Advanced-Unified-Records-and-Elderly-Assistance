import type { OscaApplicationOptions } from './types';

export default {
  service: 'purchase-booklet',
  title: 'Purchase Booklet para sa senior citizens',
  heading: 'Anong booklet ang kailangan mo?',
  verification: 'Dalhin ang original na Senior Citizen ID sa OSCA. Libre ang replacement.',
  confirmation: 'Nakatira ako sa Pateros at kinukumpirma kong tama ang impormasyon at mga dokumento ko.',
  allowsReplacement: true,
  firstRequestVerification:
    'Para sa unang booklet, ipakita sa OSCA ang bagong release na Senior Citizen ID. Libre ang booklet.',
  wornItem: 'Dalhin ang lumang Purchase Booklet para sa replacement.',
  representativeReminder: true,
} satisfies OscaApplicationOptions;
