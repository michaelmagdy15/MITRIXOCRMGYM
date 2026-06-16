export const PACKAGES = [
  { name: '10 Session PT', sessions: 10, price: 5700, expiryDays: 35 },
  { name: '20 Session PT', sessions: 20, price: 9700, expiryDays: 70 },
  { name: '10S GT Kids', sessions: 10, price: 2000, expiryDays: 35 },
  { name: '20S GT Kids', sessions: 20, price: 3150, expiryDays: 70 },
  { name: '30S GT Kids', sessions: 30, price: 3950, expiryDays: 90 },
  { name: '10 Session GT', sessions: 10, price: 2600, expiryDays: 35 },
  { name: '20 Session GT', sessions: 20, price: 4150, expiryDays: 70 },
  { name: '30 Session GT', sessions: 30, price: 5600, expiryDays: 90 },
];

export const SALES_MEMBERS = [
  'Atef mitrixogymcrm',
  'Youssef Emad',
  'Hassan Tarek',
  'Maison Mohamed',
  'Mustafa Mahmoud',
  'Omar Ehab'
];

export const ASSIGNABLE_ROLES = [
  'admin', 
  'super_admin', 
  'crm_admin', 
  'manager', 
  'sales_manager',
  'rep', 
  'sales_rep', 
  'sales'
];

export const SALES_NAME_MAPPING: Record<string, string> = {
  // ---- Atef mitrixogymcrm ----
  'Atef': 'Atef mitrixogymcrm',
  'Atef mitrixogymcrm': 'Atef mitrixogymcrm',
  'atefmitrixogymcrm': 'Atef mitrixogymcrm',

  // ---- Youssef Emad (EL GOO) ----
  'EL GOO': 'Youssef Emad',
  'El Goo': 'Youssef Emad',
  'el goo': 'Youssef Emad',
  'Youssef': 'Youssef Emad',
  'Youssef Emad': 'Youssef Emad',
  'Yousssef Emad': 'Youssef Emad',   // typo variant
  'youssef emad': 'Youssef Emad',

  // ---- Maison Mohamed ----
  'Maisoon': 'Maison Mohamed',
  'Maison': 'Maison Mohamed',
  'Maison Mohmed': 'Maison Mohamed',  // typo in user profile
  'Maison Mohamed': 'Maison Mohamed',
  'maisoon': 'Maison Mohamed',
  'maisonmohmed6': 'Maison Mohamed',  // email prefix

  // ---- Mustafa Mahmoud ----
  'Mustafa': 'Mustafa Mahmoud',
  'Mustafa Mahmoud': 'Mustafa Mahmoud',
  'mostafa Mahmoud': 'Mustafa Mahmoud',  // actual user name variant
  'Mostafa': 'Mustafa Mahmoud',
  'Mostafa Mahmoud': 'Mustafa Mahmoud',
  'mostafamahmoud688': 'Mustafa Mahmoud',  // email prefix

  // ---- Hassan Tarek ----
  'Hassan Tarek': 'Hassan Tarek',
  'Hassan': 'Hassan Tarek',
  'hassantarek104': 'Hassan Tarek',  // email prefix

  // ---- Omar Ehab ----
  'Omar Ehab': 'Omar Ehab',
  'Omar': 'Omar Ehab',
  'omarehab98765': 'Omar Ehab',  // email prefix

  // ---- Legacy / other names ----
  'Abdallah Atef': 'Abdallah Atef',
  'Omar Sherif': 'Omar Sherif',
  'Salma Ahmed': 'Salma Ahmed',
};
