import { reviewCrmDuplicates } from './crm-duplicate-review.mjs';

const contact = (id, email, fields = {}) => ({
  id, email, tenant: 'demo', name: 'Synthetic contact', owner: 'owner-1',
  consent: true, company: '', phone: '', revision: 1, ...fields,
});
const records = [
  contact('merge-2', '   PAIR@example.test ', {company: 'Synthetic Assets', revision: 2}),
  contact('merge-1', 'pair@example.test'),
  contact('held-1', 'owner@example.test'),
  contact('held-2', 'owner@example.test', {owner: 'owner-2', consent: false}),
  contact('review-3', 'cluster@example.test'),
  contact('review-1', 'cluster@example.test'),
  contact('review-2', 'cluster@example.test'),
  contact('no-address', ''),
  contact('outside', 'cluster@example.test', {tenant: 'other-demo'}),
  contact('unmatched', 'unique@example.test'),
];
console.log(JSON.stringify(reviewCrmDuplicates({ tenant: 'demo', records }), null, 2));
