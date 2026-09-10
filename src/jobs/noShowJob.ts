import { getFirestore } from 'firebase-admin/firestore';

// Runs every 15 minutes to flag no-shows for classes that have finished
export function startNoShowJob() {
  setInterval(async () => {
    try {
      console.log('[Cron] Running No-Show job for all tenants...');
      
      const databases = [
        getFirestore(), // Default DB (Strike)
        getFirestore('db-inzanathletics') // Inzan DB
      ];

      for (const db of databases) {
        try {
          const nowMs = Date.now();
          const oneHourMs = 60 * 60 * 1000;
          const twentyFourHoursMs = 24 * 60 * 60 * 1000;

          // Cost Optimization: Only inspect classes from the last 48 hours (using default single-field date index)
          const todayStr = new Date().toISOString().split('T')[0];
          const twoDaysAgoStr = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().split('T')[0];

          const classesSnap = await db.collection('classSchedules')
            .where('date', '>=', twoDaysAgoStr)
            .where('date', '<=', todayStr)
            .get();

          for (const classDoc of classesSnap.docs) {
            const classData = classDoc.data();
            if (classData.noShowsProcessed === true) continue;
            if (!classData.endTime) continue;

            const endTimeMs = new Date(classData.endTime).getTime();
            
            // Check if class ended more than 1 hour ago
            if (!isNaN(endTimeMs) && (nowMs - endTimeMs > oneHourMs)) {
               // Only process if it's within the last 24 hours (safety to not process ancient classes)
               if (nowMs - endTimeMs < twentyFourHoursMs) {
                 const attendees = classData.attendees || [];
                 const checkedIn = classData.checkedIn || [];
                 const currentNoShows = classData.noShows || [];
                 
                 // Anyone in attendees who is NOT in checkedIn is a no-show
                 const newNoShows = attendees.filter((id: string) => !checkedIn.includes(id) && !currentNoShows.includes(id));
                 
                 if (newNoShows.length > 0) {
                   const finalNoShows = [...currentNoShows, ...newNoShows];
                   await classDoc.ref.update({ 
                     noShows: finalNoShows,
                     noShowsProcessed: true 
                   });

                   // Increment strikes for each no-show
                   for (const memberId of newNoShows) {
                     const clientRef = db.collection('clients').doc(memberId);
                     const clientDoc = await clientRef.get();
                     if (clientDoc.exists) {
                       const currentStrikes = clientDoc.data()?.strikes || 0;
                       await clientRef.update({ strikes: currentStrikes + 1 });
                     }
                   }
                 } else {
                   // No new no-shows, just mark as processed
                   await classDoc.ref.update({ noShowsProcessed: true });
                 }
               } else {
                 // Too old, just mark as processed to skip in future
                 await classDoc.ref.update({ noShowsProcessed: true });
               }
            }
          }
        } catch (dbError) {
          console.error('[Cron] Error processing a database for no-shows:', dbError);
        }
      }
    } catch (error) {
      console.error('[Cron] Error running No-Show job:', error);
    }
  }, 15 * 60 * 1000); // 15 minutes
}
