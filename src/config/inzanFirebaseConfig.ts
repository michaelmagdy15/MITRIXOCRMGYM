// Keep the project and named database together. Deployment-wide defaults may
// belong to Strike and must never be combined with Inzan's database ID.
export const inzanFirebaseConfig = {
  projectId: 'faa-test-guide-v2',
  appId: '1:492280162134:web:1515094f029665cf2d98f7',
  apiKey: 'AIzaSyAUvzDIKoTvtbMEWaP1pDSyNfqpS3_11wI',
  authDomain: 'faa-test-guide-v2.firebaseapp.com',
  storageBucket: 'faa-test-guide-v2.firebasestorage.app',
  messagingSenderId: '492280162134',
  firestoreDatabaseId: 'db-inzanathletics',
  tenantId: 'inzanathletics',
};
