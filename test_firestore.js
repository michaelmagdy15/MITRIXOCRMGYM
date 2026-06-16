import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { readFileSync } from 'fs';

const firebaseConfig = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));

async function run() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log("Firebase Web SDK initialized!");

  try {
    console.log("Searching for user document...");
    const usersQ = query(collection(db, 'users'), where('clientRecordId', '==', '1081'));
    const usersSnap = await getDocs(usersQ);
    
    let email = '';
    let uid = '';
    let userDocData = null;
    
    if (usersSnap.empty) {
      const usersQ2 = query(collection(db, 'users'), where('clientRecordId', '==', 'MEM-1081'));
      const usersSnap2 = await getDocs(usersQ2);
      if (usersSnap2.empty) {
        console.log("User document not found for '1081' or 'MEM-1081'. Checking all client role users...");
        const allUsersQ = query(collection(db, 'users'), where('role', '==', 'client'));
        const allUsersSnap = await getDocs(allUsersQ);
        allUsersSnap.forEach(d => {
          const data = d.data();
          if (data.clientRecordId && data.clientRecordId.toString().includes('1081')) {
            email = data.email;
            uid = d.id;
            userDocData = data;
          }
        });
      } else {
        const d = usersSnap2.docs[0];
        email = d.data().email;
        uid = d.id;
        userDocData = d.data();
      }
    } else {
      const d = usersSnap.docs[0];
      email = d.data().email;
      uid = d.id;
      userDocData = d.data();
    }
    
    if (!email) {
      console.error("Could not determine email for member 1081!");
      return;
    }
    
    console.log(`Found user! email: ${email}, uid: ${uid}, data:`, userDocData);
    
    console.log("Signing in...");
    const userCred = await signInWithEmailAndPassword(auth, email, 'Miko0019_!');
    console.log("Signed in successfully! uid:", userCred.user.uid);
    
    console.log("Searching for client document...");
    const clientRecordId = userDocData.clientRecordId;
    const clientQ = query(collection(db, 'clients'), where('memberId', '==', clientRecordId));
    const clientSnap = await getDocs(clientQ);
    if (clientSnap.empty) {
      console.log("Client record not found!");
      return;
    }
    
    const clientDoc = clientSnap.docs[0];
    console.log(`Found client record! id: ${clientDoc.id}, data:`, clientDoc.data());
    
    console.log("Querying attendance...");
    try {
      const attQ = query(collection(db, 'attendance'), where('clientId', '==', clientDoc.id));
      const attSnap = await getDocs(attQ);
      console.log(`Successfully fetched attendance! count: ${attSnap.size}`);
    } catch (e) {
      console.error("Failed to query attendance:", e);
    }
    
    console.log("Querying clientPerformance...");
    try {
      const perfQ = query(collection(db, 'clientPerformance'), where('clientId', '==', clientDoc.id));
      const perfSnap = await getDocs(perfQ);
      console.log(`Successfully fetched clientPerformance! count: ${perfSnap.size}`);
      perfSnap.forEach(d => console.log(d.id, d.data()));
    } catch (e) {
      console.error("Failed to query clientPerformance:", e);
    }
    
  } catch (err) {
    console.error("Execution error:", err);
  }
}

run();
