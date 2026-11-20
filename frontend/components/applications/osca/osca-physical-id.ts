import type { OscaApplicationOptions } from './types';

export default {
  service: 'physical-id',
  title: 'Physical ID para sa senior citizens',
  heading: 'Anong card ang kailangan mo?',
  verification:
    'Itabi ang mga original at kailangang photocopy para sa OSCA. Maghanda ng isang recent na 2×2 at dalawang 1×1 na litrato. Maaaring papunan ka ng paper form ng OSCA.',
  confirmation:
    'Nakatira ako sa Pateros at kinukumpirma kong tama at updated ang profile details, litrato, at mga dokumento ko.',
  allowsReplacement: true,
  showsSignature: true,
  newRequestHelp:
    'Dapat nakalagay sa barangay certification ang eksaktong address mo, petsa ng kapanganakan, at purpose ng request.',
  wornItem: 'Dalhin ang lumang card para maisauli sa OSCA.',
} satisfies OscaApplicationOptions;
