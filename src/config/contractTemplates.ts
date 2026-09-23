interface ContractTemplate {
  url: string;
  fields: Record<string, string>;
}

// Tenant assets and mappings are isolated from shared rendering code.
// Unknown tenants must never fall back to another gym's agreement.
export const contractTemplates: Record<string, ContractTemplate> = {
  strike: {
    url: '/MITRIXOGYMCRM Client Contract form.pdf',
    fields: {
      name: 'text_1ecyo', phone: 'text_2dukr', amount: 'text_3pbmr', paymentMethod: 'text_4venp',
      startDate: 'text_5inc', endDate: 'text_6lmen', package: 'text_7acxg',
    },
  },
  inzanathletics: {
    url: '/contracts/inzan-membership.pdf',
    fields: Object.fromEntries([
      'name', 'phone', 'memberId', 'gender', 'nationality', 'birthday', 'package',
      'startDate', 'endDate', 'amount', 'paymentDetails', 'printedAt', 'printedBy',
    ].map(name => [name, name])),
  },
};
